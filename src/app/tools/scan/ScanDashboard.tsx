"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface DuplicateCandidate {
  id: number;
  display_name: string;
  email: string | null;
  company: string | null;
  match_reason: string;
  score: number;
}

interface StagedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  phone_mobile: string | null;
  type: string | null;
  website: string | null;
  company: string | null;
  primary_street: string | null;
  primary_city: string | null;
  primary_state: string | null;
  primary_zip: string | null;
  primary_country: string | null;
  tags: string[];
  notes: string[];
  ocr_confidence: "high" | "medium" | "low" | null;
  duplicate_candidates: DuplicateCandidate[];
  status: "draft" | "approved" | "written" | "error";
  arternal_contact_id: number | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface EditFormData {
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  phone: string;
  phone_mobile: string;
  type: string;
  website: string;
  company: string;
  primary_street: string;
  primary_city: string;
  primary_state: string;
  primary_zip: string;
  primary_country: string;
  tags: string;
  notes: string;
}

export default function ScanDashboard({
  initialContacts,
}: {
  initialContacts: StagedContact[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // Scan state
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Batch state
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);

  // List state
  const [contacts, setContacts] = useState<StagedContact[]>(initialContacts);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [expandedDupId, setExpandedDupId] = useState<string | null>(null);

  // Convert file to base64
  const fileToBase64 = useCallback(
    (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data URL prefix to get raw base64
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }),
    [],
  );

  // Handle front image capture
  function handleFrontCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    fileToBase64(file).then(setFrontImage);
    e.target.value = "";
  }

  // Handle back image capture
  function handleBackCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    fileToBase64(file).then(setBackImage);
    e.target.value = "";
  }

  // Submit scan
  async function handleScan() {
    if (!frontImage) return;
    setScanning(true);
    setScanError(null);

    const images = [frontImage];
    if (backImage) images.push(backImage);

    try {
      const res = await fetch("/api/scan/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      // Add to top of list
      setContacts((prev) => [data.staged_contact, ...prev]);
      // Reset scan zone for next card
      setFrontImage(null);
      setBackImage(null);
    } catch (e) {
      setScanError(String(e));
    } finally {
      setScanning(false);
    }
  }

  // Cancel scan
  function handleCancelScan() {
    setFrontImage(null);
    setBackImage(null);
    setScanError(null);
  }

  // Batch: select multiple photos
  async function handleBatchSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    e.target.value = "";
    setBatchProcessing(true);
    setBatchTotal(fileList.length);
    setBatchDone(0);
    setBatchErrors([]);

    for (let i = 0; i < fileList.length; i++) {
      try {
        const base64 = await fileToBase64(fileList[i]);
        const res = await fetch("/api/scan/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: [base64] }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setContacts((prev) => [data.staged_contact, ...prev]);
      } catch (err) {
        setBatchErrors((prev) => [...prev, `${fileList[i].name}: ${err}`]);
      }
      setBatchDone(i + 1);
    }

    setBatchProcessing(false);
  }

  // Start editing
  function startEdit(contact: StagedContact) {
    setEditingId(contact.id);
    setEditForm({
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      display_name: contact.display_name || "",
      email: contact.email || "",
      phone: contact.phone || "",
      phone_mobile: contact.phone_mobile || "",
      type: contact.type || "",
      website: contact.website || "",
      company: contact.company || "",
      primary_street: contact.primary_street || "",
      primary_city: contact.primary_city || "",
      primary_state: contact.primary_state || "",
      primary_zip: contact.primary_zip || "",
      primary_country: contact.primary_country || "",
      tags: (contact.tags || []).join(", "),
      notes: (contact.notes || []).join("\n"),
    });
  }

  // Save edit
  async function handleSave() {
    if (!editingId || !editForm) return;
    setSaving(true);

    const payload = {
      ...editForm,
      tags: editForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: editForm.notes
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean),
    };

    try {
      const res = await fetch(`/api/scan/staged/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error);
      }

      const data = await res.json();
      setContacts((prev) =>
        prev.map((c) => (c.id === editingId ? data.staged_contact : c)),
      );
      setEditingId(null);
      setEditForm(null);
    } catch (e) {
      alert(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  // Delete
  async function handleDelete(id: string) {
    if (!confirm("Delete this staged contact?")) return;

    try {
      const res = await fetch(`/api/scan/staged/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error);
      }
      setContacts((prev) => prev.filter((c) => c.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setEditForm(null);
      }
      if (expandedDupId === id) {
        setExpandedDupId(null);
      }
    } catch (e) {
      alert(`Delete failed: ${e}`);
    }
  }

  // Approve single
  async function handleApprove(id: string) {
    setApproving((prev) => new Set(prev).add(id));

    try {
      const res = await fetch(`/api/scan/approve/${id}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error);
      }

      // Refresh from server to get updated status
      router.refresh();
      // Optimistically update
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "written" as const } : c)),
      );
    } catch (e) {
      // Refresh to get error status
      router.refresh();
      alert(`Approve failed: ${e}`);
    } finally {
      setApproving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Approve selected (batch)
  async function handleApproveSelected() {
    const draftIds = [...selectedIds].filter((id) => {
      const contact = contacts.find((c) => c.id === id);
      return contact?.status === "draft";
    });

    if (draftIds.length === 0) return;

    for (const id of draftIds) {
      await handleApprove(id);
    }
    setSelectedIds(new Set());
  }

  // Delete selected (batch)
  async function handleDeleteSelected() {
    const deletableIds = [...selectedIds].filter((id) => {
      const contact = contacts.find((c) => c.id === id);
      return contact && ["draft", "error"].includes(contact.status);
    });

    if (deletableIds.length === 0) return;
    if (!confirm(`Delete ${deletableIds.length} staged contact${deletableIds.length === 1 ? "" : "s"}?`)) return;

    for (const id of deletableIds) {
      try {
        const res = await fetch(`/api/scan/staged/${id}`, { method: "DELETE" });
        if (!res.ok) continue;
        setContacts((prev) => prev.filter((c) => c.id !== id));
        if (editingId === id) {
          setEditingId(null);
          setEditForm(null);
        }
        if (expandedDupId === id) {
          setExpandedDupId(null);
        }
      } catch {
        // continue with remaining deletions
      }
    }
    setSelectedIds(new Set());
  }

  // Toggle selection
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Select all drafts
  function toggleSelectAll() {
    const draftIds = contacts
      .filter((c) => c.status === "draft")
      .map((c) => c.id);
    const allSelected = draftIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(draftIds));
    }
  }

  const draftCount = contacts.filter((c) => c.status === "draft").length;
  const selectedDraftCount = [...selectedIds].filter((id) =>
    contacts.find((c) => c.id === id && c.status === "draft"),
  ).length;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Business Card Scanner
      </h1>

      {/* Scan Zone */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Scan Card</h2>

        {/* Batch progress banner */}
        {batchProcessing && (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 animate-spin text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">
                  Processing cards... {batchDone} of {batchTotal}
                </p>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-blue-200">
                  <div
                    className="h-1.5 rounded-full bg-blue-600 transition-all"
                    style={{ width: `${(batchDone / batchTotal) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Batch errors */}
        {!batchProcessing && batchErrors.length > 0 && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">
              {batchErrors.length} card{batchErrors.length === 1 ? "" : "s"} failed to process:
            </p>
            <ul className="mt-1 space-y-0.5">
              {batchErrors.map((err, i) => (
                <li key={i} className="text-xs text-amber-700">{err}</li>
              ))}
            </ul>
            <button
              onClick={() => setBatchErrors([])}
              className="mt-2 text-xs font-medium text-amber-600 hover:text-amber-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {!frontImage ? (
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={batchProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                  />
                </svg>
                Scan Card
              </button>
              <button
                onClick={() => batchFileInputRef.current?.click()}
                disabled={batchProcessing}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                  />
                </svg>
                Load Photos
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFrontCapture}
            />
            <input
              ref={batchFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleBatchSelect}
            />
            <p className="mt-2 text-xs text-gray-400">
              Scan a single card, or load multiple photos to process a batch
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-4">
            {/* Front preview */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Front</p>
              <img
                src={`data:image/jpeg;base64,${frontImage}`}
                alt="Card front"
                className="h-28 rounded border border-gray-200 object-cover"
              />
            </div>

            {/* Back preview or add back button */}
            {backImage ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">Back</p>
                <img
                  src={`data:image/jpeg;base64,${backImage}`}
                  alt="Card back"
                  className="h-28 rounded border border-gray-200 object-cover"
                />
              </div>
            ) : (
              <div className="flex h-28 items-end">
                <button
                  onClick={() => backFileInputRef.current?.click()}
                  disabled={scanning}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  Add Back
                </button>
                <input
                  ref={backFileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleBackCapture}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex h-28 items-end gap-2">
              <button
                onClick={handleScan}
                disabled={scanning}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Scanning...
                  </>
                ) : (
                  "Scan"
                )}
              </button>
              <button
                onClick={handleCancelScan}
                disabled={scanning}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {scanError && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {scanError}
          </div>
        )}
      </div>

      {/* Staged Contacts List */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Staged Contacts
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({contacts.length})
            </span>
          </h2>
          {selectedDraftCount > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteSelected}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
                Delete Selected ({selectedDraftCount})
              </button>
              <button
                onClick={handleApproveSelected}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                Approve Selected ({selectedDraftCount})
              </button>
            </div>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No staged contacts yet. Scan a business card to get started.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3">
                      <input
                        type="checkbox"
                        checked={
                          draftCount > 0 &&
                          contacts
                            .filter((c) => c.status === "draft")
                            .every((c) => selectedIds.has(c.id))
                        }
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Company</th>
                    <th className="px-6 py-3">Duplicates</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map((contact) => (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      isSelected={selectedIds.has(contact.id)}
                      isEditing={editingId === contact.id}
                      editForm={editingId === contact.id ? editForm : null}
                      isApproving={approving.has(contact.id)}
                      isSaving={saving && editingId === contact.id}
                      expandedDupId={expandedDupId}
                      onToggleDup={() =>
                        setExpandedDupId(expandedDupId === contact.id ? null : contact.id)
                      }
                      onToggleSelect={() => toggleSelect(contact.id)}
                      onEdit={() => startEdit(contact)}
                      onDelete={() => handleDelete(contact.id)}
                      onApprove={() => handleApprove(contact.id)}
                      onCancelEdit={() => {
                        setEditingId(null);
                        setEditForm(null);
                      }}
                      onSave={handleSave}
                      onEditFormChange={(field, value) =>
                        setEditForm((prev) =>
                          prev ? { ...prev, [field]: value } : null,
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="divide-y divide-gray-100 md:hidden">
              {contacts.map((contact) => (
                <MobileContactCard
                  key={contact.id}
                  contact={contact}
                  isSelected={selectedIds.has(contact.id)}
                  isEditing={editingId === contact.id}
                  editForm={editingId === contact.id ? editForm : null}
                  isApproving={approving.has(contact.id)}
                  isSaving={saving && editingId === contact.id}
                  expandedDupId={expandedDupId}
                  onToggleDup={() =>
                    setExpandedDupId(expandedDupId === contact.id ? null : contact.id)
                  }
                  onToggleSelect={() => toggleSelect(contact.id)}
                  onEdit={() => startEdit(contact)}
                  onDelete={() => handleDelete(contact.id)}
                  onApprove={() => handleApprove(contact.id)}
                  onCancelEdit={() => {
                    setEditingId(null);
                    setEditForm(null);
                  }}
                  onSave={handleSave}
                  onEditFormChange={(field, value) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, [field]: value } : null,
                    )
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    approved: "bg-blue-100 text-blue-700",
    written: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || colors.draft}`}
    >
      {status}
    </span>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low" | null;
}) {
  if (!confidence) return null;
  const colors: Record<string, string> = {
    high: "bg-green-100 text-green-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[confidence]}`}
    >
      {confidence} confidence
    </span>
  );
}

function DuplicateBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200"
    >
      <svg
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
      {count}
    </button>
  );
}

function DuplicateDetails({
  candidates,
}: {
  candidates: DuplicateCandidate[];
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-800">
            Possible duplicates found
          </p>
          <ul className="mt-2 space-y-1">
            {candidates.map((dup) => (
              <li key={dup.id} className="text-sm text-amber-700">
                <span className="font-medium">{dup.display_name}</span>
                {dup.email && (
                  <span className="text-amber-600"> &middot; {dup.email}</span>
                )}
                {dup.company && (
                  <span className="text-amber-600">
                    {" "}
                    &middot; {dup.company}
                  </span>
                )}
                <span className="ml-2 text-xs text-amber-500">
                  ({dup.match_reason}, {Math.round(dup.score * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// --- Edit Form (shared between desktop and mobile) ---

function EditForm({
  contact,
  editForm,
  isApproving,
  isSaving,
  onApprove,
  onCancelEdit,
  onSave,
  onEditFormChange,
}: {
  contact: StagedContact;
  editForm: EditFormData;
  isApproving: boolean;
  isSaving: boolean;
  onApprove: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditFormChange: (field: keyof EditFormData, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Confidence badge */}
      <div className="flex items-center gap-3">
        <ConfidenceBadge confidence={contact.ocr_confidence} />
      </div>

      {/* Duplicate Warning */}
      {(contact.duplicate_candidates || []).length > 0 && (
        <DuplicateDetails
          candidates={contact.duplicate_candidates as DuplicateCandidate[]}
        />
      )}

      {/* Contact fields grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="First Name"
          value={editForm.first_name}
          onChange={(v) => onEditFormChange("first_name", v)}
        />
        <FormField
          label="Last Name"
          value={editForm.last_name}
          onChange={(v) => onEditFormChange("last_name", v)}
        />
        <FormField
          label="Display Name"
          value={editForm.display_name}
          onChange={(v) => onEditFormChange("display_name", v)}
        />
        <FormField
          label="Email"
          value={editForm.email}
          onChange={(v) => onEditFormChange("email", v)}
          type="email"
        />
        <FormField
          label="Phone"
          value={editForm.phone}
          onChange={(v) => onEditFormChange("phone", v)}
        />
        <FormField
          label="Mobile"
          value={editForm.phone_mobile}
          onChange={(v) => onEditFormChange("phone_mobile", v)}
        />
        <FormField
          label="Company"
          value={editForm.company}
          onChange={(v) => onEditFormChange("company", v)}
        />
        <FormField
          label="Title / Type"
          value={editForm.type}
          onChange={(v) => onEditFormChange("type", v)}
        />
        <FormField
          label="Website"
          value={editForm.website}
          onChange={(v) => onEditFormChange("website", v)}
        />
      </div>

      {/* Address */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
          Address
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Street"
            value={editForm.primary_street}
            onChange={(v) => onEditFormChange("primary_street", v)}
          />
          <FormField
            label="City"
            value={editForm.primary_city}
            onChange={(v) => onEditFormChange("primary_city", v)}
          />
          <FormField
            label="State"
            value={editForm.primary_state}
            onChange={(v) => onEditFormChange("primary_state", v)}
          />
          <FormField
            label="ZIP"
            value={editForm.primary_zip}
            onChange={(v) => onEditFormChange("primary_zip", v)}
          />
          <FormField
            label="Country"
            value={editForm.primary_country}
            onChange={(v) => onEditFormChange("primary_country", v)}
          />
        </div>
      </div>

      {/* Tags & Notes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Tags
          </label>
          <input
            type="text"
            value={editForm.tags}
            onChange={(e) => onEditFormChange("tags", e.target.value)}
            placeholder='e.g. "Art Basel 2026, VIP"'
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          <p className="mt-0.5 text-xs text-gray-400">Comma-separated</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Notes
          </label>
          <textarea
            value={editForm.notes}
            onChange={(e) => onEditFormChange("notes", e.target.value)}
            placeholder="Met at opening, interested in photography..."
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          <p className="mt-0.5 text-xs text-gray-400">One note per line</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={() => {
            onSave();
            // After save succeeds, approve
            setTimeout(() => onApprove(), 500);
          }}
          disabled={isSaving || isApproving}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {isApproving ? "Creating..." : "Approve & Create Contact"}
        </button>
        <button
          onClick={onCancelEdit}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Desktop Table Row ---

function ContactRow({
  contact,
  isSelected,
  isEditing,
  editForm,
  isApproving,
  isSaving,
  expandedDupId,
  onToggleDup,
  onToggleSelect,
  onEdit,
  onDelete,
  onApprove,
  onCancelEdit,
  onSave,
  onEditFormChange,
}: {
  contact: StagedContact;
  isSelected: boolean;
  isEditing: boolean;
  editForm: EditFormData | null;
  isApproving: boolean;
  isSaving: boolean;
  expandedDupId: string | null;
  onToggleDup: () => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditFormChange: (field: keyof EditFormData, value: string) => void;
}) {
  const dupCount = (contact.duplicate_candidates || []).length;
  const showDupDetails = expandedDupId === contact.id && !isEditing;

  return (
    <>
      <tr className={isEditing ? "bg-gray-50" : "hover:bg-gray-50"}>
        <td className="px-6 py-3">
          {contact.status === "draft" && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded border-gray-300"
            />
          )}
        </td>
        <td className="px-6 py-3 font-medium text-gray-900">
          {contact.display_name || "\u2014"}
        </td>
        <td className="px-6 py-3 text-gray-600">{contact.email || "\u2014"}</td>
        <td className="px-6 py-3 text-gray-600">{contact.company || "\u2014"}</td>
        <td className="px-6 py-3">
          <DuplicateBadge count={dupCount} onClick={onToggleDup} />
        </td>
        <td className="px-6 py-3">
          <StatusBadge status={contact.status} />
        </td>
        <td className="px-6 py-3 text-gray-400">
          {new Date(contact.created_at).toLocaleDateString()}
        </td>
        <td className="px-6 py-3">
          <div className="flex items-center gap-1">
            {contact.status === "draft" && (
              <>
                <button
                  onClick={onEdit}
                  title="Edit"
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
                    />
                  </svg>
                </button>
                <button
                  onClick={onApprove}
                  disabled={isApproving}
                  title="Approve"
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600 disabled:opacity-50"
                >
                  {isApproving ? (
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  )}
                </button>
              </>
            )}
            {["draft", "error"].includes(contact.status) && (
              <button
                onClick={onDelete}
                title="Delete"
                className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            )}
            {contact.status === "error" && contact.error_message && (
              <span
                title={contact.error_message}
                className="cursor-help text-xs text-red-500"
              >
                Error
              </span>
            )}
          </div>
        </td>
      </tr>

      {/* Duplicate Details (expanded below row, separate from edit) */}
      {showDupDetails && dupCount > 0 && (
        <tr>
          <td colSpan={8} className="bg-amber-50/50 px-6 py-4">
            <DuplicateDetails
              candidates={contact.duplicate_candidates as DuplicateCandidate[]}
            />
          </td>
        </tr>
      )}

      {/* Edit Form (expanded below row) */}
      {isEditing && editForm && (
        <tr>
          <td colSpan={8} className="bg-gray-50 px-6 py-6">
            <EditForm
              contact={contact}
              editForm={editForm}
              isApproving={isApproving}
              isSaving={isSaving}
              onApprove={onApprove}
              onCancelEdit={onCancelEdit}
              onSave={onSave}
              onEditFormChange={onEditFormChange}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// --- Mobile Card ---

function MobileContactCard({
  contact,
  isSelected,
  isEditing,
  editForm,
  isApproving,
  isSaving,
  expandedDupId,
  onToggleDup,
  onToggleSelect,
  onEdit,
  onDelete,
  onApprove,
  onCancelEdit,
  onSave,
  onEditFormChange,
}: {
  contact: StagedContact;
  isSelected: boolean;
  isEditing: boolean;
  editForm: EditFormData | null;
  isApproving: boolean;
  isSaving: boolean;
  expandedDupId: string | null;
  onToggleDup: () => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditFormChange: (field: keyof EditFormData, value: string) => void;
}) {
  const dupCount = (contact.duplicate_candidates || []).length;
  const showDupDetails = expandedDupId === contact.id && !isEditing;

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5">
          {contact.status === "draft" ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded border-gray-300"
            />
          ) : (
            <div className="h-4 w-4" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">
                {contact.display_name || "\u2014"}
              </p>
              {contact.email && (
                <p className="truncate text-sm text-gray-500">{contact.email}</p>
              )}
              {contact.company && (
                <p className="truncate text-sm text-gray-500">{contact.company}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              {contact.status === "draft" && (
                <>
                  <button
                    onClick={onEdit}
                    title="Edit"
                    className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={onApprove}
                    disabled={isApproving}
                    title="Approve"
                    className="rounded p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600 disabled:opacity-50"
                  >
                    {isApproving ? (
                      <svg
                        className="h-4 w-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    )}
                  </button>
                </>
              )}
              {["draft", "error"].includes(contact.status) && (
                <button
                  onClick={onDelete}
                  title="Delete"
                  className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Badges row */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={contact.status} />
            <DuplicateBadge count={dupCount} onClick={onToggleDup} />
            {contact.status === "error" && contact.error_message && (
              <span
                title={contact.error_message}
                className="cursor-help text-xs text-red-500"
              >
                Error
              </span>
            )}
            <span className="text-xs text-gray-400">
              {new Date(contact.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Duplicate Details (expanded, separate from edit) */}
      {showDupDetails && dupCount > 0 && (
        <div className="mt-3 ml-7">
          <DuplicateDetails
            candidates={contact.duplicate_candidates as DuplicateCandidate[]}
          />
        </div>
      )}

      {/* Edit Form */}
      {isEditing && editForm && (
        <div className="mt-4 ml-7">
          <EditForm
            contact={contact}
            editForm={editForm}
            isApproving={isApproving}
            isSaving={isSaving}
            onApprove={onApprove}
            onCancelEdit={onCancelEdit}
            onSave={onSave}
            onEditFormChange={onEditFormChange}
          />
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
    </div>
  );
}
