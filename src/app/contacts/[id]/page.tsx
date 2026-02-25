import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contactId = parseInt(id, 10);

  const supabase = await createClient();

  const [contactResult, extendedResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single(),
    supabase
      .from("contacts_extended")
      .select("collector_brief, inferred_preferences, enrichment_status, enrichment_confidence, engagement_level, known_artists, style_preferences, subject_preferences, mood_preferences, board_memberships, classification")
      .eq("contact_id", contactId)
      .single(),
  ]);

  const { data: contact, error } = contactResult;
  const extended = extendedResult.data;

  if (error || !contact) {
    return (
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to contacts
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error?.message || "Contact not found"}
        </div>
      </div>
    );
  }

  const details = [
    { label: "ID", value: String(contact.id) },
    { label: "First Name", value: contact.first_name },
    { label: "Last Name", value: contact.last_name },
    { label: "Display Name", value: contact.display_name },
    { label: "Email", value: contact.email, isEmail: true },
    { label: "Phone", value: contact.phone },
    { label: "Phone (Mobile)", value: contact.phone_mobile },
    { label: "Type", value: contact.type },
    { label: "Website", value: contact.website, isLink: true },
    { label: "Company", value: contact.company },
  ];

  const addressDetails = [
    { label: "Street", value: contact.primary_street },
    { label: "City", value: contact.primary_city },
    { label: "State", value: contact.primary_state },
    { label: "ZIP", value: contact.primary_zip },
    { label: "Country", value: contact.primary_country },
    { label: "Formatted Address", value: contact.primary_address_formatted, wide: true },
  ];

  const tags: string[] = contact.tags ?? [];
  const notes: string[] = contact.notes ?? [];
  const recentTransactions: { id: number; title: string; status: string; total_price: string; created_at: string }[] = contact.recent_transactions ?? [];
  const recentActivities: { type: string; text: string | null; created_at: string }[] = contact.recent_activities ?? [];

  return (
    <div>
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to contacts
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 mb-6">{contact.display_name}</h1>

      {/* Contact Details */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Contact Information
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {d.label}
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {d.isEmail && d.value ? (
                  <a href={`mailto:${d.value}`} className="hover:underline text-blue-600">
                    {d.value}
                  </a>
                ) : d.isLink && d.value ? (
                  <a
                    href={d.value.startsWith("http") ? d.value : `https://${d.value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-blue-600"
                  >
                    {d.value}
                  </a>
                ) : (
                  d.value || <span className="text-gray-400 italic">{"\u2014"}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Address */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Primary Address
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {addressDetails.map((d) => (
            <div key={d.label} className={d.wide ? "sm:col-span-2" : ""}>
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

      {/* Tags */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Tags
        </h2>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">{"\u2014"}</p>
        )}
      </div>

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Recent Transactions
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-3 py-2 text-sm text-gray-900">{tx.title}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{tx.status}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 text-right">
                      {tx.total_price ? `$${(Number(tx.total_price) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activities */}
      {recentActivities.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Recent Activities
          </h2>
          <ul className="space-y-3">
            {recentActivities.map((act, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 shrink-0">
                  {act.type}
                </span>
                <span className="text-sm text-gray-700 flex-1">
                  {act.text || <span className="text-gray-400 italic">{"\u2014"}</span>}
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(act.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes */}
      {notes.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Notes
          </h2>
          <ul className="space-y-2">
            {notes.map((note, i) => (
              <li key={i} className="text-sm text-gray-700 bg-gray-50 rounded p-3">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Enrichment from contacts_extended */}
      {extended && (extended.collector_brief || extended.engagement_level) && (() => {
        const brief = extended.collector_brief as Record<string, unknown> | null;
        const professional = brief?.professional as { current_role?: string; career_highlights?: string[]; industry?: string } | undefined;
        const artWorld = brief?.art_world as { collection_mentions?: string[]; art_events?: string[]; advisory_roles?: string[] } | undefined;
        const philanthropy = brief?.philanthropy as { foundations?: string[]; board_seats?: string[]; notable_giving?: string[] } | undefined;
        const social = brief?.social_presence as { linkedin?: string; instagram?: string; other?: string[] } | undefined;
        const sources = brief?.sources as Array<{ url: string; title: string; relevance: string }> | undefined;
        const summary = brief?.summary as string | undefined;
        const notes = brief?.notes as string | undefined;

        const knownArtists: string[] = extended.known_artists ?? [];
        const stylePrefs: string[] = extended.style_preferences ?? [];
        const subjectPrefs: string[] = extended.subject_preferences ?? [];
        const moodPrefs: string[] = extended.mood_preferences ?? [];
        const boardMemberships: string[] = extended.board_memberships ?? [];

        const confidenceColor = {
          high: "bg-green-100 text-green-800",
          medium: "bg-yellow-100 text-yellow-800",
          low: "bg-red-100 text-red-800",
        }[extended.enrichment_confidence as string] ?? "bg-gray-100 text-gray-700";

        const engagementLabel = {
          active_collector: "Active Collector",
          casual_buyer: "Casual Buyer",
          institutional: "Institutional",
          unknown: "Unknown",
        }[extended.engagement_level as string] ?? extended.engagement_level;

        return (
          <div className="space-y-6 mb-6">
            {/* Summary & Status Header */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Collector Research
                </h2>
                <div className="flex items-center gap-2">
                  {extended.enrichment_confidence && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${confidenceColor}`}>
                      {(extended.enrichment_confidence as string).charAt(0).toUpperCase() + (extended.enrichment_confidence as string).slice(1)} confidence
                    </span>
                  )}
                  {extended.engagement_level && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-xs font-medium">
                      {engagementLabel}
                    </span>
                  )}
                </div>
              </div>
              {summary && (
                <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
              )}
            </div>

            {/* Professional & Art World — side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Professional Background */}
              {professional && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Professional Background
                  </h3>
                  {professional.current_role && (
                    <p className="text-sm font-medium text-gray-900 mb-1">{professional.current_role}</p>
                  )}
                  {professional.industry && (
                    <p className="text-xs text-gray-500 mb-3">{professional.industry}</p>
                  )}
                  {professional.career_highlights && professional.career_highlights.length > 0 && (
                    <ul className="space-y-1">
                      {professional.career_highlights.map((h, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-gray-300 mt-1 shrink-0">&bull;</span>
                          {h}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Art World Involvement */}
              {(boardMemberships.length > 0 || artWorld) && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Art World
                  </h3>
                  {boardMemberships.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Board Memberships</p>
                      <ul className="space-y-1">
                        {boardMemberships.map((b, i) => (
                          <li key={i} className="text-sm text-gray-700">{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {artWorld?.advisory_roles && artWorld.advisory_roles.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Advisory Roles</p>
                      <ul className="space-y-1">
                        {artWorld.advisory_roles.map((r, i) => (
                          <li key={i} className="text-sm text-gray-700">{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {artWorld?.collection_mentions && artWorld.collection_mentions.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Collection Mentions</p>
                      <ul className="space-y-1">
                        {artWorld.collection_mentions.map((m, i) => (
                          <li key={i} className="text-sm text-gray-600">{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {artWorld?.art_events && artWorld.art_events.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Events</p>
                      <ul className="space-y-1">
                        {artWorld.art_events.map((e, i) => (
                          <li key={i} className="text-sm text-gray-600">{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Collection Profile — tag pills */}
            {(knownArtists.length > 0 || stylePrefs.length > 0 || subjectPrefs.length > 0 || moodPrefs.length > 0) && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
                  Collection Profile
                </h3>
                <div className="space-y-4">
                  {knownArtists.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Known Artists</p>
                      <div className="flex flex-wrap gap-2">
                        {knownArtists.map((a) => (
                          <span key={a} className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 px-3 py-1 text-sm font-medium">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {stylePrefs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Style Preferences</p>
                      <div className="flex flex-wrap gap-2">
                        {stylePrefs.map((s) => (
                          <span key={s} className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-3 py-1 text-sm">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {subjectPrefs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Subject Preferences</p>
                      <div className="flex flex-wrap gap-2">
                        {subjectPrefs.map((s) => (
                          <span key={s} className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-sm">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {moodPrefs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Mood Preferences</p>
                      <div className="flex flex-wrap gap-2">
                        {moodPrefs.map((m) => (
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

            {/* Philanthropy */}
            {philanthropy && (philanthropy.foundations?.length || philanthropy.board_seats?.length || philanthropy.notable_giving?.length) && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Philanthropy
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {philanthropy.foundations && philanthropy.foundations.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Foundations</p>
                      <ul className="space-y-1">
                        {philanthropy.foundations.map((f, i) => (
                          <li key={i} className="text-sm text-gray-700">{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {philanthropy.board_seats && philanthropy.board_seats.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Board Seats</p>
                      <ul className="space-y-1">
                        {philanthropy.board_seats.map((b, i) => (
                          <li key={i} className="text-sm text-gray-700">{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {philanthropy.notable_giving && philanthropy.notable_giving.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Notable Giving</p>
                      <ul className="space-y-1">
                        {philanthropy.notable_giving.map((g, i) => (
                          <li key={i} className="text-sm text-gray-700">{g}</li>
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
              {social && (social.linkedin || social.instagram || (social.other && social.other.length > 0)) && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Social Presence
                  </h3>
                  <div className="space-y-2">
                    {social.linkedin && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 w-20">LinkedIn</span>
                        <a href={social.linkedin} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate">
                          {social.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "")}
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
                  <ul className="space-y-2">
                    {sources.map((s, i) => (
                      <li key={i} className="text-sm">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {s.title}
                        </a>
                        <p className="text-xs text-gray-500 mt-0.5">{s.relevance}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Research Notes */}
            {notes && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Research Notes</p>
                <p className="text-sm text-gray-600">{notes}</p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
