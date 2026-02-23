"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";

interface InventoryItem {
  id: number;
  title: string | null;
  catalog_number: string | null;
  year: string | null;
  medium: string | null;
  price: number | null;
  price_currency: string | null;
  status: string | null;
  primary_image_url: string | null;
  artist_names: string | null;
  total_count: number;
}

interface Filters {
  title: string;
  artist: string;
  medium: string;
  year: string;
  status: string;
}

type SortableColumn = "title" | "artist" | "medium" | "year" | "price" | "status";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "available", label: "Available" },
  { value: "sold", label: "Sold" },
  { value: "hold", label: "Hold" },
  { value: "on consignment", label: "On Consignment" },
  { value: "nfs", label: "NFS" },
  { value: "n/a", label: "N/A" },
];

function FilterPopover({
  column,
  value,
  onApply,
  onClose,
}: {
  column: SortableColumn;
  value: string;
  onApply: (value: string) => void;
  onClose: () => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onApply(localValue);
  }

  if (column === "status") {
    return (
      <div
        ref={ref}
        className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[160px]"
      >
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onApply(opt.value)}
            className={`block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors ${
              value === opt.value ? "bg-gray-100 font-medium" : ""
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[200px]"
    >
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          placeholder={`Filter by ${column}...`}
          className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <button
          type="submit"
          className="rounded bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Apply
        </button>
      </form>
      {value && (
        <button
          onClick={() => onApply("")}
          className="mt-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: string }) {
  if (!active) {
    return (
      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  if (direction === "asc") {
    return (
      <svg className="w-3.5 h-3.5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-3 h-3 ${active ? "text-gray-900" : "text-gray-400"}`}
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}

function ColumnHeader({
  label,
  column,
  currentSort,
  currentOrder,
  filterValue,
  onSort,
  onFilter,
  align,
  className,
}: {
  label: string;
  column: SortableColumn;
  currentSort: string;
  currentOrder: string;
  filterValue: string;
  onSort: (column: SortableColumn) => void;
  onFilter: (column: SortableColumn, value: string) => void;
  align?: "right";
  className?: string;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const isSorted = currentSort === column;
  const hasFilter = filterValue !== "";

  return (
    <th
      className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider relative ${
        align === "right" ? "text-right" : "text-left"
      } ${className ?? ""}`}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        <button
          onClick={() => onSort(column)}
          className="flex items-center gap-1 hover:text-gray-900 transition-colors group"
        >
          <span>{label}</span>
          <SortIcon active={isSorted} direction={isSorted ? currentOrder : ""} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setFilterOpen(!filterOpen);
          }}
          className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${hasFilter ? "bg-gray-200" : ""}`}
          title={`Filter by ${label}`}
        >
          <FilterIcon active={hasFilter} />
        </button>
      </div>
      {filterOpen && (
        <FilterPopover
          column={column}
          value={filterValue}
          onApply={(value) => {
            onFilter(column, value);
            setFilterOpen(false);
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </th>
  );
}

export default function InventoryList({
  items,
  totalCount,
  currentPage,
  filters,
  sort,
  order,
  error,
}: {
  items: InventoryItem[];
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
  const hasMore = currentPage < totalPages;

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

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
      router.push(qs ? `/inventory?${qs}` : "/inventory");
    },
    [router, searchParams]
  );

  function handleSort(column: SortableColumn) {
    if (sort === column) {
      updateParams({ sort: column, order: order === "asc" ? "desc" : "asc" });
    } else {
      updateParams({ sort: column, order: "asc" });
    }
  }

  function handleFilter(column: SortableColumn, value: string) {
    const filterKey = `filter_${column}`;
    updateParams({ [filterKey]: value });
  }

  function clearFilters() {
    const params = new URLSearchParams();
    router.push("/inventory");
  }

  const formatPrice = (price: number | null, currency: string | null) => {
    if (price === null || price === undefined) return "\u2014";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const statusColors: Record<string, string> = {
    available: "bg-green-100 text-green-800",
    sold: "bg-red-100 text-red-800",
    hold: "bg-yellow-100 text-yellow-800",
    "on consignment": "bg-blue-100 text-blue-800",
  };

  return (
    <div>
      {/* Active filters indicator */}
      {hasActiveFilters && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Filters:</span>
          {filters.title && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              Title: {filters.title}
              <button onClick={() => handleFilter("title", "")} className="hover:text-gray-900">&times;</button>
            </span>
          )}
          {filters.artist && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              Artist: {filters.artist}
              <button onClick={() => handleFilter("artist", "")} className="hover:text-gray-900">&times;</button>
            </span>
          )}
          {filters.medium && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              Medium: {filters.medium}
              <button onClick={() => handleFilter("medium", "")} className="hover:text-gray-900">&times;</button>
            </span>
          )}
          {filters.year && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              Year: {filters.year}
              <button onClick={() => handleFilter("year", "")} className="hover:text-gray-900">&times;</button>
            </span>
          )}
          {filters.status && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              Status: {filters.status}
              <button onClick={() => handleFilter("status", "")} className="hover:text-gray-900">&times;</button>
            </span>
          )}
          <button
            onClick={clearFilters}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear all
          </button>
        </div>
      )}

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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                Image
              </th>
              <ColumnHeader
                label="Title"
                column="title"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.title}
                onSort={handleSort}
                onFilter={handleFilter}
              />
              <ColumnHeader
                label="Artist"
                column="artist"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.artist}
                onSort={handleSort}
                onFilter={handleFilter}
              />
              <ColumnHeader
                label="Medium"
                column="medium"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.medium}
                onSort={handleSort}
                onFilter={handleFilter}
                className="hidden md:table-cell"
              />
              <ColumnHeader
                label="Year"
                column="year"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.year}
                onSort={handleSort}
                onFilter={handleFilter}
                className="hidden sm:table-cell"
              />
              <ColumnHeader
                label="Price"
                column="price"
                currentSort={sort}
                currentOrder={order}
                filterValue=""
                onSort={handleSort}
                onFilter={handleFilter}
                align="right"
              />
              <ColumnHeader
                label="Status"
                column="status"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.status}
                onSort={handleSort}
                onFilter={handleFilter}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  No inventory items found.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => router.push(`/inventory/${item.id}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  {item.primary_image_url ? (
                    <img
                      src={item.primary_image_url}
                      alt={item.title || "Artwork"}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                        />
                      </svg>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {item.title || (
                    <span className="text-gray-400 italic">Untitled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {item.artist_names || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                  {item.medium || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                  {item.year || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                  {formatPrice(item.price, item.price_currency)}
                </td>
                <td className="px-4 py-3">
                  {item.status ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        statusColors[item.status.toLowerCase()] ||
                        "bg-gray-100 text-gray-800"
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
