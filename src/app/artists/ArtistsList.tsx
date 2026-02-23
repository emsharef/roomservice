"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ColumnHeader, ActiveFilters, Pagination } from "@/components/TableControls";

interface ArtistItem {
  id: number;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  work_count: number | null;
  bio: string | null;
  life_dates: string | null;
  total_count: number;
}

interface Filters {
  [key: string]: string;
  name: string;
  country: string;
  life_dates: string;
}

const FILTER_LABELS: Record<string, string> = {
  name: "Name",
  country: "Country",
  life_dates: "Life Dates",
};

export default function ArtistsList({
  artists,
  totalCount,
  currentPage,
  filters,
  sort,
  order,
  error,
}: {
  artists: ArtistItem[];
  totalCount: number;
  currentPage: number;
  filters: Filters;
  sort: string;
  order: string;
  error: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      if (!("page" in updates)) {
        params.delete("page");
      }
      const qs = params.toString();
      router.push(qs ? `/artists?${qs}` : "/artists");
    },
    [router, searchParams]
  );

  function handleSort(column: string) {
    if (sort === column) {
      updateParams({ sort: column, order: order === "asc" ? "desc" : "asc" });
    } else {
      updateParams({ sort: column, order: "asc" });
    }
  }

  function handleFilter(column: string, value: string) {
    updateParams({ [`filter_${column}`]: value });
  }

  function clearFilters() {
    router.push("/artists");
  }

  const truncate = (text: string | null, maxLen: number) => {
    if (!text) return null;
    return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
  };

  return (
    <div>
      <ActiveFilters
        filters={filters}
        labels={FILTER_LABELS}
        onRemove={(key) => handleFilter(key, "")}
        onClearAll={clearFilters}
      />

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <p className="mb-3 text-sm text-gray-500">
        {totalCount.toLocaleString()} artists total
        {totalPages > 1 && ` \u00b7 Page ${currentPage} of ${totalPages}`}
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <ColumnHeader
                label="Name"
                column="name"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.name}
                onSort={handleSort}
                onFilter={handleFilter}
              />
              <ColumnHeader
                label="Country"
                column="country"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.country}
                onSort={handleSort}
                onFilter={handleFilter}
                className="hidden sm:table-cell"
              />
              <ColumnHeader
                label="Works"
                column="works"
                currentSort={sort}
                currentOrder={order}
                filterValue=""
                onSort={handleSort}
                onFilter={handleFilter}
                align="right"
                className="hidden sm:table-cell"
                sortOnly
              />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                Bio
              </th>
              <ColumnHeader
                label="Life Dates"
                column="life_dates"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.life_dates}
                onSort={handleSort}
                onFilter={handleFilter}
                className="hidden md:table-cell"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {artists.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                  No artists found.
                </td>
              </tr>
            )}
            {artists.map((artist) => (
              <tr
                key={artist.id}
                onClick={() => router.push(`/artists/${artist.id}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">
                    {artist.display_name}
                  </div>
                  <div className="text-xs text-gray-500 sm:hidden">
                    {[
                      artist.country,
                      artist.work_count != null
                        ? `${artist.work_count} works`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" \u00b7 ") || null}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                  {artist.country || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium hidden sm:table-cell">
                  {artist.work_count ?? (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell max-w-xs">
                  {truncate(artist.bio, 80) || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                  {artist.life_dates || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => updateParams({ page: String(page) })}
      />
    </div>
  );
}
