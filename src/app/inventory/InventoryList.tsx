"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ColumnHeader, ActiveFilters, Pagination } from "@/components/TableControls";

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
  [key: string]: string;
  title: string;
  artist: string;
  medium: string;
  year: string;
  status: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "available", label: "Available" },
  { value: "sold", label: "Sold" },
  { value: "hold", label: "Hold" },
  { value: "on consignment", label: "On Consignment" },
  { value: "nfs", label: "NFS" },
  { value: "n/a", label: "N/A" },
];

const FILTER_LABELS: Record<string, string> = {
  title: "Title",
  artist: "Artist",
  medium: "Medium",
  year: "Year",
  status: "Status",
};

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
        {totalCount.toLocaleString()} items total
        {totalPages > 1 && ` \u00b7 Page ${currentPage} of ${totalPages}`}
      </p>

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
                sortOnly
              />
              <ColumnHeader
                label="Status"
                column="status"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.status}
                onSort={handleSort}
                onFilter={handleFilter}
                dropdownOptions={STATUS_OPTIONS}
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

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => updateParams({ page: String(page) })}
      />
    </div>
  );
}
