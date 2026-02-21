import { fetchInventoryItem } from "@/lib/arternal";
import Link from "next/link";
import ImageGallery from "./ImageGallery";

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let item;
  let error: string | null = null;

  try {
    const res = await fetchInventoryItem(id);
    item = res.data;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch item";
  }

  if (error || !item) {
    return (
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to inventory
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error || "Item not found"}
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
    if (price === null) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const images = (item.images ?? []).map((img) => ({
    url: img.url,
    label: img.is_primary ? "Primary" : img.type || "Alternate view",
  }));

  const details = [
    { label: "Catalog #", value: item.catalog_number },
    { label: "Year", value: item.year },
    { label: "Medium", value: item.medium },
    { label: "Dimensions", value: item.dimensions },
    { label: "Edition", value: item.edition },
    { label: "Type", value: item.type },
    { label: "Created", value: item.created_at ? new Date(item.created_at).toLocaleDateString() : null },
    { label: "Updated", value: item.updated_at ? new Date(item.updated_at).toLocaleDateString() : null },
  ];

  return (
    <div>
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to inventory
      </Link>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="md:flex">
          {/* Images */}
          <div className="md:w-1/2">
            <ImageGallery images={images} title={item.title || "Artwork"} />
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

            {item.artists.length > 0 && (
              <p className="text-lg text-gray-600 mt-1">
                {item.artists.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && ", "}
                    <Link href={`/artists/${a.id}`} className="hover:text-gray-900 hover:underline">
                      {a.display_name}
                    </Link>
                  </span>
                ))}
              </p>
            )}

            {item.price !== null && (
              <p className="text-2xl font-bold text-gray-900 mt-4">
                {formatPrice(item.price, item.price_currency)}
              </p>
            )}

            <div className="mt-6 border-t border-gray-200 pt-6">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {details
                  .filter((d) => d.value)
                  .map((d) => (
                    <div key={d.label}>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {d.label}
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">{d.value}</dd>
                    </div>
                  ))}
              </dl>
            </div>

            {item.artists.length > 0 && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Artists
                </h3>
                <div className="flex flex-wrap gap-2">
                  {item.artists.map((artist) => (
                    <Link
                      key={artist.id}
                      href={`/artists/${artist.id}`}
                      className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                      {artist.display_name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
