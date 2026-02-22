import { fetchArtist, fetchArtistWorks } from "@/lib/arternal";
import Link from "next/link";

const ITEMS_PER_PAGE = 20;

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

  let artist;
  let works;
  let error: string | null = null;

  try {
    const [artistRes, worksRes] = await Promise.all([
      fetchArtist(id),
      fetchArtistWorks(id, {
        limit: String(ITEMS_PER_PAGE),
        offset: String(offset),
      }),
    ]);
    artist = artistRes.data;
    works = worksRes;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch artist";
  }

  const pagination = works?.pagination ?? null;
  const totalPages = pagination?.total_pages ?? 1;

  const statusColors: Record<string, string> = {
    available: "bg-green-100 text-green-800",
    sold: "bg-red-100 text-red-800",
    reserved: "bg-yellow-100 text-yellow-800",
    "on loan": "bg-blue-100 text-blue-800",
    "on consignment": "bg-purple-100 text-purple-800",
  };

  const formatPrice = (price: number | null, currency: string | null) => {
    if (price === null) return "-";
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
          {error || "Artist not found"}
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
    { label: "Created", value: artist.created_at ? new Date(artist.created_at).toLocaleDateString() : null },
    { label: "Updated", value: artist.updated_at ? new Date(artist.updated_at).toLocaleDateString() : null },
  ];

  const inventoryStats = Object.entries(artist.statistics?.inventory ?? {});
  const setStats = Object.entries(artist.statistics?.sets ?? {});

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
                {d.value || <span className="text-gray-400 italic">—</span>}
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
          <p className="text-sm text-gray-400 italic">—</p>
        )}
      </div>

      {/* Statistics */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Statistics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Inventory</h3>
            {inventoryStats.length > 0 ? (
              <dl className="space-y-1">
                {inventoryStats.map(([key, count]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <dt className="text-gray-600 capitalize">{key}</dt>
                    <dd className="text-gray-900 font-medium">{count}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-gray-400 italic">—</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Sets</h3>
            {setStats.length > 0 ? (
              <dl className="space-y-1">
                {setStats.map(([key, count]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <dt className="text-gray-600 capitalize">{key}</dt>
                    <dd className="text-gray-900 font-medium">{count}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-gray-400 italic">—</p>
            )}
          </div>
        </div>
      </div>

      {/* Works heading */}
      {pagination && (
        <p className="text-sm text-gray-500 mb-3">
          {parseInt(pagination.total).toLocaleString()} works
          {totalPages > 1 && ` \u00b7 Page ${page} of ${totalPages}`}
        </p>
      )}

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
            {(!works?.data || works.data.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                  No works found for this artist.
                </td>
              </tr>
            )}
            {works?.data?.map((item) => (
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
                  {item.medium || <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                  {item.year || <span className="text-gray-400">-</span>}
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
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
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
            href={pagination.has_more ? `/artists/${id}?page=${page + 1}` : "#"}
            className={`rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors ${
              !pagination.has_more ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}
