"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";

interface ArtistItem {
  id: number;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  work_count: number | null;
  bio: string | null;
  life_dates: string | null;
}

export default function ArtistsList({
  artists,
  totalCount,
  currentPage,
  search: initialSearch,
  error,
}: {
  artists: ArtistItem[];
  totalCount: number;
  currentPage: number;
  search: string;
  error: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasMore = currentPage < totalPages;

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search });
  };

  const truncate = (text: string | null, maxLen: number) => {
    if (!text) return null;
    return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
  };

  return (
    <div>
      {/* Search */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artists..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Search
          </button>
          {initialSearch && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                router.push("/artists");
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <p className="mb-3 text-sm text-gray-500">
        {totalCount.toLocaleString()} artists total
        {totalPages > 1 && ` \u00b7 Page ${currentPage} of ${totalPages}`}
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                Country
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                Works
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                Bio
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                Life Dates
              </th>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => updateParams({ page: String(currentPage - 1) })}
            disabled={currentPage <= 1}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex gap-1">
            {generatePageNumbers(currentPage, totalPages).map((p, i) =>
              p === "..." ? (
                <span
                  key={`ellipsis-${i}`}
                  className="px-3 py-2 text-sm text-gray-500"
                >
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => updateParams({ page: String(p) })}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    p === currentPage
                      ? "bg-gray-900 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {p}
                </button>
              )
            )}
          </div>
          <button
            onClick={() => updateParams({ page: String(currentPage + 1) })}
            disabled={!hasMore}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  ) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}
