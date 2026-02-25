import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const ITEMS_PER_PAGE = 20;

/** Render text with inline [N] citations as clickable superscript links */
function CitedText({ text, sources }: { text: string; sources?: Array<{ url: string; title: string }> }) {
  if (!sources || sources.length === 0) {
    return <>{text}</>;
  }

  // Split on [N] or [N][M] patterns, keeping delimiters
  const parts = text.split(/(\[\d+\](?:\[\d+\])*)/g);

  return (
    <>
      {parts.map((part, i) => {
        // Check if this part is a citation cluster like [1] or [1][2]
        const citeMatches = part.match(/\[(\d+)\]/g);
        if (citeMatches) {
          return (
            <span key={i}>
              {citeMatches.map((cite, j) => {
                const num = parseInt(cite.replace(/[[\]]/g, ""), 10);
                const source = sources[num - 1]; // 1-based index
                if (!source) return <sup key={j} className="text-xs text-gray-400">{cite}</sup>;
                return (
                  <a
                    key={j}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={source.title}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <sup className="text-xs font-medium">{cite}</sup>
                  </a>
                );
              })}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default async function ArtistDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10));
  const offset = (page - 1) * ITEMS_PER_PAGE;
  const artistId = parseInt(id, 10);

  const supabase = await createClient();

  const [artistResult, extendedResult, worksResult] = await Promise.all([
    supabase
      .from("artists")
      .select("*")
      .eq("id", artistId)
      .single(),
    supabase
      .from("artists_extended")
      .select("enrichment_brief, formatted_bio, market_context, enrichment_status, enrichment_confidence, primary_mediums, style_tags, subject_tags, mood_tags")
      .eq("artist_id", artistId)
      .single(),
    supabase
      .from("artworks")
      .select("id, title, catalog_number, year, medium, price, price_currency, status, primary_image_url", { count: "exact" })
      .contains("artist_ids", [artistId])
      .order("arternal_updated_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + ITEMS_PER_PAGE - 1),
  ]);

  const { data: artist, error } = artistResult;
  const extended = extendedResult.data;
  const works = worksResult.data ?? [];
  const worksCount = worksResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(worksCount / ITEMS_PER_PAGE));

  const statusColors: Record<string, string> = {
    available: "bg-green-100 text-green-800",
    sold: "bg-red-100 text-red-800",
    hold: "bg-yellow-100 text-yellow-800",
    "on consignment": "bg-blue-100 text-blue-800",
  };

  const formatPrice = (price: number | null, currency: string | null) => {
    if (price === null || price === undefined) return "\u2014";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
    }).format(price);
  };

  if (error || !artist) {
    return (
      <div>
        <Link
          href="/artists"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to artists
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error?.message || "Artist not found"}
        </div>
      </div>
    );
  }

  const details = [
    { label: "ID", value: String(artist.id) },
    { label: "First Name", value: artist.first_name },
    { label: "Last Name", value: artist.last_name },
    { label: "Display Name", value: artist.display_name },
    { label: "Alias", value: artist.alias },
    { label: "Birth Year", value: artist.birth_year },
    { label: "Death Year", value: artist.death_year },
    { label: "Life Dates", value: artist.life_dates },
    { label: "Country", value: artist.country },
    { label: "Saved", value: artist.saved ? "Yes" : "No" },
    { label: "Created", value: artist.arternal_created_at ? new Date(artist.arternal_created_at).toLocaleDateString() : null },
    { label: "Updated", value: artist.arternal_updated_at ? new Date(artist.arternal_updated_at).toLocaleDateString() : null },
  ];

  return (
    <div>
      <Link
        href="/artists"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to artists
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 mb-6">{artist.display_name}</h1>

      {/* Artist details */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Artist Information
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {d.label}
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {d.value || <span className="text-gray-400 italic">{"\u2014"}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Bio */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Biography
        </h2>
        {artist.bio ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{artist.bio}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">{"\u2014"}</p>
        )}
      </div>

      {/* Statistics */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Statistics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Overview</h3>
            <dl className="space-y-1">
              <div className="flex justify-between text-sm">
                <dt className="text-gray-600">Works in inventory</dt>
                <dd className="text-gray-900 font-medium">{artist.work_count ?? "\u2014"}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-gray-600">Catalog items</dt>
                <dd className="text-gray-900 font-medium">{artist.catalog_count ?? "\u2014"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Enrichment data from artists_extended */}
      {extended && (extended.formatted_bio || extended.market_context || extended.enrichment_brief) && (() => {
        const brief = extended.enrichment_brief as Record<string, unknown> | null;
        const summary = brief?.summary as string | undefined;
        const ap = brief?.artistic_practice as {
          philosophy?: string; process?: string; themes?: string[];
          evolution?: string; influences?: string[];
        } | undefined;
        const career = brief?.career as {
          education?: string[]; solo_exhibitions?: string[];
          group_exhibitions?: string[]; awards_grants?: string[];
          residencies?: string[];
        } | undefined;
        const market = brief?.market as { auction_results?: string[] } | undefined;
        const collections = brief?.collections as {
          museum_collections?: string[]; notable_private_collections?: string[];
        } | undefined;
        const relatedArtists = (brief?.related_artists as string[] | undefined) ?? [];
        const social = brief?.social_presence as { website?: string; instagram?: string; other?: string[] } | undefined;
        const sources = brief?.sources as Array<{ url: string; title: string; relevance: string }> | undefined;
        const researchNotes = brief?.notes as string | undefined;

        const styleTags: string[] = extended.style_tags ?? [];
        const subjectTags: string[] = extended.subject_tags ?? [];
        const moodTags: string[] = extended.mood_tags ?? [];
        const primaryMediums: string[] = extended.primary_mediums ?? [];

        const confidenceColor = {
          high: "bg-green-100 text-green-800",
          medium: "bg-yellow-100 text-yellow-800",
          low: "bg-red-100 text-red-800",
        }[extended.enrichment_confidence as string] ?? "bg-gray-100 text-gray-700";

        return (
          <div className="space-y-6 mb-6">
            {/* Summary & Status Header */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Artist Research
                </h2>
                {extended.enrichment_confidence && (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${confidenceColor}`}>
                    {(extended.enrichment_confidence as string).charAt(0).toUpperCase() + (extended.enrichment_confidence as string).slice(1)} confidence
                  </span>
                )}
              </div>
              {summary && (
                <p className="text-sm text-gray-700 leading-relaxed"><CitedText text={summary} sources={sources} /></p>
              )}
            </div>

            {/* Formatted Bio */}
            {extended.formatted_bio && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Biography
                </h3>
                <div className="text-sm text-gray-700 leading-relaxed space-y-3">
                  {(extended.formatted_bio as string).split(/\n\n+/).map((para, i) => (
                    <p key={i}><CitedText text={para} sources={sources} /></p>
                  ))}
                </div>
              </div>
            )}

            {/* Artistic Practice */}
            {ap && (ap.philosophy || ap.process || ap.themes?.length || ap.evolution) && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
                  Artistic Practice
                </h3>
                <div className="space-y-4">
                  {ap.philosophy && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Philosophy</p>
                      <p className="text-sm text-gray-700 leading-relaxed"><CitedText text={ap.philosophy} sources={sources} /></p>
                    </div>
                  )}
                  {ap.process && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Process</p>
                      <p className="text-sm text-gray-700 leading-relaxed"><CitedText text={ap.process} sources={sources} /></p>
                    </div>
                  )}
                  {ap.themes && ap.themes.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Recurring Themes</p>
                      <ul className="space-y-1">
                        {ap.themes.map((t, i) => (
                          <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                            <span className="text-gray-300 mt-1 shrink-0">&bull;</span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ap.evolution && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Evolution</p>
                      <p className="text-sm text-gray-700 leading-relaxed"><CitedText text={ap.evolution} sources={sources} /></p>
                    </div>
                  )}
                  {ap.influences && ap.influences.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Influences</p>
                      <div className="flex flex-wrap gap-2">
                        {ap.influences.map((inf) => (
                          <span key={inf} className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-sm">
                            {inf}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tags — style, subject, mood, mediums */}
            {(styleTags.length > 0 || subjectTags.length > 0 || moodTags.length > 0 || primaryMediums.length > 0) && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
                  Classification
                </h3>
                <div className="space-y-4">
                  {primaryMediums.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Primary Mediums</p>
                      <div className="flex flex-wrap gap-2">
                        {primaryMediums.map((m) => (
                          <span key={m} className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 px-3 py-1 text-sm font-medium">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {styleTags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Style</p>
                      <div className="flex flex-wrap gap-2">
                        {styleTags.map((s) => (
                          <span key={s} className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-3 py-1 text-sm">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {subjectTags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Subject</p>
                      <div className="flex flex-wrap gap-2">
                        {subjectTags.map((s) => (
                          <span key={s} className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-sm">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {moodTags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Mood</p>
                      <div className="flex flex-wrap gap-2">
                        {moodTags.map((m) => (
                          <span key={m} className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 px-3 py-1 text-sm">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Related Artists */}
            {relatedArtists.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Related Artists
                </h3>
                <div className="flex flex-wrap gap-2">
                  {relatedArtists.map((a) => (
                    <span key={a} className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 px-3 py-1 text-sm font-medium">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Career & Market — side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Career */}
              {career && (career.education?.length || career.solo_exhibitions?.length || career.group_exhibitions?.length || career.awards_grants?.length || career.residencies?.length) && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Career
                  </h3>
                  <div className="space-y-3">
                    {career.education && career.education.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Education</p>
                        <ul className="space-y-1">
                          {career.education.map((e, i) => (
                            <li key={i} className="text-sm text-gray-700">{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {career.solo_exhibitions && career.solo_exhibitions.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Solo Exhibitions</p>
                        <ul className="space-y-1">
                          {career.solo_exhibitions.map((e, i) => (
                            <li key={i} className="text-sm text-gray-600">{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {career.group_exhibitions && career.group_exhibitions.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Group Exhibitions</p>
                        <ul className="space-y-1">
                          {career.group_exhibitions.map((e, i) => (
                            <li key={i} className="text-sm text-gray-600">{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {career.awards_grants && career.awards_grants.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Awards & Grants</p>
                        <ul className="space-y-1">
                          {career.awards_grants.map((a, i) => (
                            <li key={i} className="text-sm text-gray-700">{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {career.residencies && career.residencies.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Residencies</p>
                        <ul className="space-y-1">
                          {career.residencies.map((r, i) => (
                            <li key={i} className="text-sm text-gray-700">{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Market */}
              {(extended.market_context || market?.auction_results?.length) && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Market
                  </h3>
                  {extended.market_context && (
                    <p className="text-sm text-gray-700 leading-relaxed mb-3">{extended.market_context}</p>
                  )}
                  {market?.auction_results && market.auction_results.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Auction Results</p>
                      <ul className="space-y-1">
                        {market.auction_results.map((r, i) => (
                          <li key={i} className="text-sm text-gray-600">{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Collections */}
            {collections && (collections.museum_collections?.length || collections.notable_private_collections?.length) && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Collections
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {collections.museum_collections && collections.museum_collections.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Museum Collections</p>
                      <ul className="space-y-1">
                        {collections.museum_collections.map((m, i) => (
                          <li key={i} className="text-sm text-gray-700">{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {collections.notable_private_collections && collections.notable_private_collections.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Notable Private Collections</p>
                      <ul className="space-y-1">
                        {collections.notable_private_collections.map((c, i) => (
                          <li key={i} className="text-sm text-gray-700">{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Social & Sources — side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Social Presence */}
              {social && (social.website || social.instagram || (social.other && social.other.length > 0)) && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Social Presence
                  </h3>
                  <div className="space-y-2">
                    {social.website && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 w-20">Website</span>
                        <a href={social.website.startsWith("http") ? social.website : `https://${social.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate">
                          {social.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      </div>
                    )}
                    {social.instagram && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 w-20">Instagram</span>
                        <span className="text-sm text-gray-700">{social.instagram}</span>
                      </div>
                    )}
                    {social.other && social.other.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 w-20">Other</span>
                        <span className="text-sm text-gray-700">{o}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources */}
              {sources && sources.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Sources ({sources.length})
                  </h3>
                  <ol className="space-y-2 list-none">
                    {sources.map((s, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-xs font-medium text-blue-600 shrink-0 mt-0.5">[{i + 1}]</span>
                        <div>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {s.title}
                          </a>
                          <p className="text-xs text-gray-500 mt-0.5">{s.relevance}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Research Notes */}
            {researchNotes && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Research Notes</p>
                <p className="text-sm text-gray-600">{researchNotes}</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Works heading */}
      <p className="text-sm text-gray-500 mb-3">
        {worksCount.toLocaleString()} works
        {totalPages > 1 && ` \u00b7 Page ${page} of ${totalPages}`}
      </p>

      {/* Works table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                Image
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                Medium
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                Year
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {works.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                  No works found for this artist.
                </td>
              </tr>
            )}
            {works.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <Link href={`/inventory/${item.id}`}>
                    {item.primary_image_url ? (
                      <img
                        src={item.primary_image_url}
                        alt={item.title || "Artwork"}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  <Link href={`/inventory/${item.id}`} className="hover:underline">
                    {item.title || <span className="text-gray-400 italic">Untitled</span>}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                  {item.medium || <span className="text-gray-400">{"\u2014"}</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                  {item.year || <span className="text-gray-400">{"\u2014"}</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                  {formatPrice(item.price, item.price_currency)}
                </td>
                <td className="px-4 py-3">
                  {item.status ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        statusColors[item.status.toLowerCase()] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {item.status}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">{"\u2014"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination for works */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Link
            href={page > 1 ? `/artists/${id}?page=${page - 1}` : "#"}
            className={`rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors ${
              page <= 1 ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            Previous
          </Link>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <Link
            href={page < totalPages ? `/artists/${id}?page=${page + 1}` : "#"}
            className={`rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors ${
              page >= totalPages ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}
