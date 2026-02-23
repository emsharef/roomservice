"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ColumnHeader, ActiveFilters, Pagination } from "@/components/TableControls";

interface ContactItem {
  id: number;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  phone_mobile: string | null;
  type: string | null;
  primary_city: string | null;
  primary_state: string | null;
  primary_country: string | null;
  total_count: number;
}

interface Filters {
  [key: string]: string;
  name: string;
  email: string;
  company: string;
  location: string;
  type: string;
}

const FILTER_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  company: "Company",
  location: "Location",
  type: "Type",
};

export default function ContactsList({
  contacts,
  totalCount,
  currentPage,
  filters,
  sort,
  order,
  error,
}: {
  contacts: ContactItem[];
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
      router.push(qs ? `/contacts?${qs}` : "/contacts");
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
    router.push("/contacts");
  }

  const formatLocation = (contact: ContactItem) => {
    const parts = [
      contact.primary_city,
      contact.primary_state,
      contact.primary_country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
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
        {totalCount.toLocaleString()} contacts total
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
                label="Email"
                column="email"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.email}
                onSort={handleSort}
                onFilter={handleFilter}
                className="hidden sm:table-cell"
              />
              <ColumnHeader
                label="Company"
                column="company"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.company}
                onSort={handleSort}
                onFilter={handleFilter}
                className="hidden lg:table-cell"
              />
              <ColumnHeader
                label="Location"
                column="location"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.location}
                onSort={handleSort}
                onFilter={handleFilter}
                className="hidden md:table-cell"
              />
              <ColumnHeader
                label="Type"
                column="type"
                currentSort={sort}
                currentOrder={order}
                filterValue={filters.type}
                onSort={handleSort}
                onFilter={handleFilter}
                className="hidden md:table-cell"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                  No contacts found.
                </td>
              </tr>
            )}
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                onClick={() => router.push(`/contacts/${contact.id}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">
                    {contact.display_name}
                  </div>
                  {contact.email && (
                    <span className="text-xs text-gray-500 sm:hidden truncate block max-w-[200px]">
                      {contact.email}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell max-w-[200px] truncate">
                  {contact.email || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">
                  {contact.company || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                  {formatLocation(contact) || (
                    <span className="text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                  {contact.type || (
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
