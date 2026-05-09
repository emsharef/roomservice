"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ColumnHeader, ActiveFilters, Pagination } from "@/components/TableControls";

interface ContactItem {
  id: string;
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

interface ContactList {
  id: string;
  name: string;
  contact_count: number;
}

const FILTER_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  company: "Company",
  location: "Location",
  type: "Type",
  list: "List",
};

export default function ContactsList({
  contacts,
  totalCount,
  currentPage,
  filters,
  sort,
  order,
  error,
  contactLists,
  activeListId,
}: {
  contacts: ContactItem[];
  totalCount: number;
  currentPage: number;
  filters: Filters;
  sort: string;
  order: string;
  error: string | null;
  contactLists?: ContactList[];
  activeListId?: string | null;
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

  function handleListFilter(listId: string) {
    updateParams({ filter_list: listId });
  }

  function clearFilters() {
    router.push("/contacts");
  }

  // List management state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [listMutating, setListMutating] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name) return;
    setListMutating(true);
    setListError(null);
    try {
      const res = await fetch("/api/contact-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: newListDescription.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setListError(data.error || `HTTP ${res.status}`);
        return;
      }
      setShowCreateForm(false);
      setNewListName("");
      setNewListDescription("");
      router.refresh();
    } catch (e) {
      setListError(String(e));
    } finally {
      setListMutating(false);
    }
  }

  async function handleDeleteList() {
    if (!activeListId) return;
    setListMutating(true);
    setListError(null);
    try {
      const res = await fetch(`/api/contact-lists/${activeListId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setListError(data.error || `HTTP ${res.status}`);
        return;
      }
      setShowDeleteConfirm(false);
      // Clear the filter since the list no longer exists
      updateParams({ filter_list: "" });
    } catch (e) {
      setListError(String(e));
    } finally {
      setListMutating(false);
    }
  }

  const activeListName = activeListId
    ? contactLists?.find((l) => l.id === activeListId)?.name ?? activeListId
    : null;

  // Batch mode state
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddToList, setShowAddToList] = useState(false);
  const [addToListSearch, setAddToListSearch] = useState("");
  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [batchMutating, setBatchMutating] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);

  // Reset selection on URL change (page/filter changes)
  const searchKey = searchParams.toString();
  useEffect(() => {
    setSelectedIds(new Set());
    setShowAddToList(false);
    setShowRemoveConfirm(false);
    setBatchError(null);
  }, [searchKey]);

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));
  const someOnPageSelected = contacts.some((c) => selectedIds.has(c.id));

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const c of contacts) next.delete(c.id);
      } else {
        for (const c of contacts) next.add(c.id);
      }
      return next;
    });
  }

  function exitBatchMode() {
    setBatchMode(false);
    setSelectedIds(new Set());
    setShowAddToList(false);
    setShowRemoveConfirm(false);
    setBatchError(null);
  }

  async function batchAddToList(listId: string, listName: string) {
    if (selectedIds.size === 0) return;
    setAddingToListId(listId);
    setBatchError(null);
    setBatchSuccess(null);
    try {
      const res = await fetch(`/api/contact-lists/${listId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBatchError(data.error || `HTTP ${res.status}`);
        return;
      }
      const count = selectedIds.size;
      setBatchSuccess(`Added ${count} contact${count === 1 ? "" : "s"} to "${listName}"`);
      setShowAddToList(false);
      setAddToListSearch("");
      setBatchMode(false);
      setSelectedIds(new Set());
      router.refresh();
      setTimeout(() => setBatchSuccess(null), 4000);
    } catch (e) {
      setBatchError(String(e));
    } finally {
      setAddingToListId(null);
    }
  }

  async function batchRemoveFromList() {
    if (!activeListId || selectedIds.size === 0) return;
    setBatchMutating(true);
    setBatchError(null);
    setBatchSuccess(null);
    try {
      const res = await fetch(`/api/contact-lists/${activeListId}/contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBatchError(data.error || `HTTP ${res.status}`);
        return;
      }
      const count = selectedIds.size;
      setBatchSuccess(`Removed ${count} contact${count === 1 ? "" : "s"} from "${activeListName}"`);
      setShowRemoveConfirm(false);
      setBatchMode(false);
      setSelectedIds(new Set());
      router.refresh();
      setTimeout(() => setBatchSuccess(null), 4000);
    } catch (e) {
      setBatchError(String(e));
    } finally {
      setBatchMutating(false);
    }
  }

  const filteredAddLists = (contactLists ?? []).filter((l) =>
    addToListSearch.trim() ? l.name.toLowerCase().includes(addToListSearch.toLowerCase()) : true
  );

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
        filters={{ ...filters, ...(activeListName ? { list: activeListName } : {}) }}
        labels={FILTER_LABELS}
        onRemove={(key) => key === "list" ? updateParams({ filter_list: "" }) : handleFilter(key, "")}
        onClearAll={clearFilters}
      />

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          {totalCount.toLocaleString()} contacts{activeListName ? ` in "${activeListName}"` : " total"}
          {totalPages > 1 && ` \u00b7 Page ${currentPage} of ${totalPages}`}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {contactLists && contactLists.length > 0 && (
            <select
              value={activeListId ?? ""}
              onChange={(e) => handleListFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-2 py-1 text-gray-700 bg-white min-w-0 max-w-[60vw] sm:max-w-none"
            >
              <option value="">All contacts</option>
              {contactLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.contact_count})
                </option>
              ))}
            </select>
          )}
          {activeListId && (
            <button
              onClick={() => { setShowDeleteConfirm(true); setListError(null); }}
              className="inline-flex items-center gap-1 text-sm border border-red-300 text-red-700 rounded-md px-2 py-1 hover:bg-red-50 whitespace-nowrap"
            >
              Delete list
            </button>
          )}
          <button
            onClick={() => { setShowCreateForm(true); setListError(null); }}
            className="inline-flex items-center gap-1 text-sm border border-gray-300 text-gray-700 rounded-md px-2 py-1 hover:bg-gray-50 bg-white whitespace-nowrap"
          >
            + New list
          </button>
          {!batchMode && (
            <button
              onClick={() => { setBatchMode(true); setBatchError(null); }}
              className="inline-flex items-center gap-1 text-sm border border-gray-300 text-gray-700 rounded-md px-2 py-1 hover:bg-gray-50 bg-white whitespace-nowrap"
            >
              Select
            </button>
          )}
        </div>
      </div>

      {batchSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          {batchSuccess}
        </div>
      )}

      {batchMode && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-blue-900 font-medium">
            {selectedIds.size} selected
            {activeListName && <span className="text-blue-700 font-normal"> &middot; in &ldquo;{activeListName}&rdquo;</span>}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setShowAddToList(true); setAddToListSearch(""); setBatchError(null); }}
              disabled={selectedIds.size === 0 || batchMutating}
              className="inline-flex items-center gap-1 text-sm rounded-md bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              Add to list
            </button>
            {activeListId && (
              <button
                onClick={() => { setShowRemoveConfirm(true); setBatchError(null); }}
                disabled={selectedIds.size === 0 || batchMutating}
                className="inline-flex items-center gap-1 text-sm rounded-md border border-red-300 text-red-700 bg-white px-3 py-1 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
              >
                Remove from list
              </button>
            )}
            <button
              onClick={exitBatchMode}
              disabled={batchMutating}
              className="inline-flex items-center gap-1 text-sm rounded-md border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {batchError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {batchError}
        </div>
      )}

      {showAddToList && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">
              Add {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"} to a list
            </h3>
            <button
              onClick={() => { setShowAddToList(false); setAddToListSearch(""); }}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <input
            type="text"
            value={addToListSearch}
            onChange={(e) => setAddToListSearch(e.target.value)}
            placeholder="Search lists…"
            autoFocus
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-3"
          />
          <div className="max-h-72 overflow-y-auto -mx-1">
            {filteredAddLists.length === 0 ? (
              <p className="text-sm text-gray-500 italic px-1 py-2">No matching lists</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredAddLists.map((list) => (
                  <li key={list.id}>
                    <button
                      onClick={() => batchAddToList(list.id, list.name)}
                      disabled={addingToListId !== null}
                      className="w-full flex items-center justify-between px-1 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="text-sm text-gray-900">{list.name}</span>
                      <span className="text-xs text-gray-500">
                        {addingToListId === list.id ? "Adding…" : `${list.contact_count} contacts`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {showRemoveConfirm && activeListName && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-medium text-red-900 mb-1">
            Remove {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"} from &ldquo;{activeListName}&rdquo;?
          </h3>
          <p className="text-sm text-red-800 mb-3">The contacts will remain in the CRM.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={batchRemoveFromList}
              disabled={batchMutating}
              className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {batchMutating ? "Removing…" : "Remove"}
            </button>
            <button
              onClick={() => setShowRemoveConfirm(false)}
              disabled={batchMutating}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-900 mb-3">New contact list</h3>
          {listError && (
            <p className="mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{listError}</p>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Name</label>
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                maxLength={255}
                placeholder="e.g. VIP Collectors"
                autoFocus
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Description (optional)</label>
              <input
                type="text"
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                maxLength={1000}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateList}
                disabled={listMutating || newListName.trim() === ""}
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {listMutating ? "Creating\u2026" : "Create"}
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewListName(""); setNewListDescription(""); setListError(null); }}
                disabled={listMutating}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && activeListName && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-medium text-red-900 mb-1">Delete &ldquo;{activeListName}&rdquo;?</h3>
          <p className="text-sm text-red-800 mb-3">The list will be removed in Arternal. Contacts in the list will not be deleted.</p>
          {listError && (
            <p className="mb-3 rounded bg-white border border-red-200 px-3 py-2 text-xs text-red-700">{listError}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteList}
              disabled={listMutating}
              className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {listMutating ? "Deleting\u2026" : "Delete"}
            </button>
            <button
              onClick={() => { setShowDeleteConfirm(false); setListError(null); }}
              disabled={listMutating}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {batchMode && (
                <th className="px-3 py-2 w-10 text-left">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                    }}
                    onChange={toggleSelectAllOnPage}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    aria-label="Select all on page"
                  />
                </th>
              )}
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
                <td colSpan={batchMode ? 6 : 5} className="px-4 py-12 text-center text-sm text-gray-500">
                  No contacts found.
                </td>
              </tr>
            )}
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                onClick={() => {
                  if (batchMode) {
                    toggleSelection(contact.id);
                  } else {
                    router.push(`/contacts/${contact.id}`);
                  }
                }}
                className={`hover:bg-gray-50 cursor-pointer transition-colors ${batchMode && selectedIds.has(contact.id) ? "bg-blue-50" : ""}`}
              >
                {batchMode && (
                  <td className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelection(contact.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      aria-label={`Select ${contact.display_name}`}
                    />
                  </td>
                )}
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
