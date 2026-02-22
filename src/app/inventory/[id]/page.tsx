import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [artworkResult, extendedResult] = await Promise.all([
    supabase
      .from("artworks")
      .select("*, artwork_artists(artist_id, display_name)")
      .eq("id", id)
      .single(),
    supabase
      .from("artworks_extended")
      .select("ai_description, style_tags, subject_tags, mood_tags, color_palette, vision_analyzed_at")
      .eq("artwork_id", id)
      .single(),
  ]);

  const { data: item, error } = artworkResult;
  const extended = extendedResult.data;

  if (error || !item) {
    return (
      <div>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to inventory
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error?.message || "Item not found"}
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    available: "bg-green-100 text-green-800",
    sold: "bg-red-100 text-red-800",
    hold: "bg-yellow-100 text-yellow-800",
    "on consignment": "bg-blue-100 text-blue-800",
  };

  const formatPrice = (price: number | null, currency: string | null) => {
    if (price === null || price === undefined) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDimensions = () => {
    const parts: string[] = [];
    if (item.height != null) parts.push(`H: ${item.height} cm`);
    if (item.width != null) parts.push(`W: ${item.width} cm`);
    if (item.depth != null) parts.push(`D: ${item.depth} cm`);
    return parts.length > 0 ? parts.join(" \u00d7 ") : null;
  };

  const details = [
    { label: "ID", value: String(item.id) },
    { label: "Catalog #", value: item.catalog_number },
    { label: "Year", value: item.year },
    { label: "Medium", value: item.medium },
    { label: "Dimensions", value: item.dimensions },
    { label: "Dimensions (cm)", value: formatDimensions() },
    { label: "Edition", value: item.edition },
    { label: "Price", value: formatPrice(item.price, item.price_currency) },
    { label: "Currency", value: item.price_currency },
    { label: "Status", value: item.status },
    { label: "Type", value: item.type },
    { label: "Created", value: item.arternal_created_at ? new Date(item.arternal_created_at).toLocaleDateString() : null },
    { label: "Updated", value: item.arternal_updated_at ? new Date(item.arternal_updated_at).toLocaleDateString() : null },
  ];

  const artists = item.artwork_artists ?? [];

  return (
    <div>
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to inventory
      </Link>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="md:flex">
          {/* Image */}
          <div className="md:w-1/2">
            {item.primary_image_url ? (
              <div className="bg-gray-100 flex items-center justify-center min-h-[300px]">
                <img
                  src={item.primary_image_url}
                  alt={item.title || "Artwork"}
                  className="w-full h-auto object-contain max-h-[500px]"
                />
              </div>
            ) : (
              <div className="bg-gray-100 flex items-center justify-center min-h-[300px]">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                  <span className="text-sm">No image</span>
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="md:w-1/2 p-6 md:p-8">
            <div className="mb-1 flex items-center gap-3">
              {item.status && (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    statusColors[item.status.toLowerCase()] || "bg-gray-100 text-gray-800"
                  }`}
                >
                  {item.status}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              {item.title || <span className="text-gray-400 italic">Untitled</span>}
            </h1>

            {artists.length > 0 && (
              <p className="text-lg text-gray-600 mt-1">
                {artists.map((a: { artist_id: number; display_name: string | null }, i: number) => (
                  <span key={a.artist_id}>
                    {i > 0 && ", "}
                    <Link href={`/artists/${a.artist_id}`} className="hover:text-gray-900 hover:underline">
                      {a.display_name || "Unknown"}
                    </Link>
                  </span>
                ))}
              </p>
            )}

            <div className="mt-6 border-t border-gray-200 pt-6">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
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

            <div className="mt-6">
              <Link
                href={`/search?similar=${item.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Find Similar
              </Link>
            </div>

            <div className="mt-6 border-t border-gray-200 pt-6">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Artists
              </h3>
              {artists.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {artists.map((artist: { artist_id: number; display_name: string | null }) => (
                    <Link
                      key={artist.artist_id}
                      href={`/artists/${artist.artist_id}`}
                      className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                      {artist.display_name || "Unknown"}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">{"\u2014"}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis section */}
      {extended && (extended.ai_description || (extended.style_tags && extended.style_tags.length > 0) || (extended.subject_tags && extended.subject_tags.length > 0) || (extended.mood_tags && extended.mood_tags.length > 0)) && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mt-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            AI Analysis
          </h2>

          {extended.ai_description && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Description
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {extended.ai_description}
              </p>
            </div>
          )}

          {extended.style_tags && extended.style_tags.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Style Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {extended.style_tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {extended.subject_tags && extended.subject_tags.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Subject Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {extended.subject_tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {extended.mood_tags && extended.mood_tags.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Mood Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {extended.mood_tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {extended.vision_analyzed_at && (
            <p className="text-xs text-gray-400 mt-4">
              Analyzed {new Date(extended.vision_analyzed_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
