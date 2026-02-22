"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";

interface Column<T> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  items: T[];
  columns: Column<T>[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  search: string;
  basePath: string;
  getRowHref?: (item: T) => string;
  filters?: React.ReactNode;
  error?: string | null;
  emptyMessage?: string;
}

export default function DataTable<T extends { id: number | string }>({
  items,
  columns,
  totalCount,
  currentPage,
  pageSize,
  search: initialSearch,
  basePath,
  getRowHref,
  filters,
  error,
  emptyMessage = "No items found.",
}: DataTableProps<T>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);

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
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, searchParams, basePath]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search });
  };

  const hasActiveFilters = initialSearch || searchParams.toString().length > 0;

  return (
    <div>
      {/* Search + filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Search
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                router.push(basePath);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Clear
            </button>
          )}
        </form>
        {filters}
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results count */}
      <p className="mb-3 text-sm text-gray-500">
        {totalCount.toLocaleString()} items total
        {totalPages > 1 && ` \u00b7 Page ${currentPage} of ${totalPages}`}
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.headerClassName || ""} ${col.className || ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={
                  getRowHref
                    ? () => router.push(getRowHref(item))
                    : undefined
                }
                className={
                  getRowHref
                    ? "hover:bg-gray-50 cursor-pointer transition-colors"
                    : ""
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 ${col.className || ""}`}
                  >
                    {col.render(item)}
                  </td>
                ))}
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
