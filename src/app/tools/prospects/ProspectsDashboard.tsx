"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ProspectBatch {
  id: string;
  name: string;
  source_type: string;
  prospect_count: number;
  created_at: string;
  statusSummary: Record<string, number>;
}

interface ParsedRow {
  name: string;
  company: string;
  title: string;
  context: string;
}

const statusColors: Record<string, string> = {
  done: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  parsed: "bg-gray-100 text-gray-700",
  researching: "bg-yellow-100 text-yellow-700",
};

export default function ProspectsDashboard({
  initialBatches,
}: {
  initialBatches: ProspectBatch[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View state
  const [showNewResearch, setShowNewResearch] = useState(false);

  // New research form state
  const [batchName, setBatchName] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "image">("text");
  const [textInput, setTextInput] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  // Parse state
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);

  // Batch creation state
  const [creating, setCreating] = useState(false);

  // Convert file to base64
  const fileToBase64 = useCallback(
    (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Strip data URL prefix to get raw base64
          resolve(dataUrl.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }),
    [],
  );

  // Handle image file selection
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);

    setImageFiles((prev) => [...prev, ...newFiles]);

    // Generate preview URLs
    for (const file of newFiles) {
      const url = URL.createObjectURL(file);
      setImagePreviews((prev) => [...prev, url]);
    }

    e.target.value = "";
  }

  // Remove an image
  function removeImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  }

  // Handle drag and drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return;

    setImageFiles((prev) => [...prev, ...files]);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      setImagePreviews((prev) => [...prev, url]);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Parse names
  async function handleParse() {
    setParsing(true);
    setParseError(null);

    try {
      let body: Record<string, unknown>;

      if (inputMode === "text") {
        if (!textInput.trim()) {
          throw new Error("Please enter at least one name.");
        }
        body = { text: textInput };
      } else {
        if (imageFiles.length === 0) {
          throw new Error("Please upload at least one image.");
        }
        const images = await Promise.all(imageFiles.map(fileToBase64));
        body = { images };
      }

      const res = await fetch("/api/prospects/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setParsedRows(data.parsed || []);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  // Update a parsed row
  function updateRow(
    index: number,
    field: keyof ParsedRow,
    value: string,
  ) {
    setParsedRows((prev) => {
      if (!prev) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  // Remove a parsed row
  function removeRow(index: number) {
    setParsedRows((prev) => {
      if (!prev) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  // Add an empty row
  function addRow() {
    setParsedRows((prev) => [
      ...(prev || []),
      { name: "", company: "", title: "", context: "" },
    ]);
  }

  // Create batch and start research
  async function handleCreateBatch() {
    if (!parsedRows || parsedRows.length === 0) return;
    if (!batchName.trim()) {
      setParseError("Please enter a batch name.");
      return;
    }

    setCreating(true);
    setParseError(null);

    try {
      const res = await fetch("/api/prospects/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: batchName.trim(),
          sourceType: inputMode,
          prospects: parsedRows.filter((r) => r.name.trim()),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      router.push(`/tools/prospects/${data.batchId}`);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  // Reset new research form
  function handleCancel() {
    setShowNewResearch(false);
    setBatchName("");
    setInputMode("text");
    setTextInput("");
    setImageFiles([]);
    // Revoke all preview URLs
    for (const url of imagePreviews) {
      URL.revokeObjectURL(url);
    }
    setImagePreviews([]);
    setParsing(false);
    setParseError(null);
    setParsedRows(null);
    setCreating(false);
  }

  // ---- Render: New Research Flow ----
  if (showNewResearch) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">New Research</h1>
          <button
            onClick={handleCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {/* Batch Name */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Batch Name
            </label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Art Basel Miami 2026"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Input Mode Toggle */}
          {!parsedRows && (
            <>
              <div className="mb-4">
                <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
                  <button
                    onClick={() => setInputMode("text")}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                      inputMode === "text"
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setInputMode("image")}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                      inputMode === "image"
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Image
                  </button>
                </div>
              </div>

              {/* Text Input */}
              {inputMode === "text" && (
                <div className="mb-4">
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder={
                      "Paste names, one per line. Can include company or context (e.g. 'Jane Smith - Gagosian' or 'John Doe, CEO at ArtCo')"
                    }
                    rows={10}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  />
                </div>
              )}

              {/* Image Input */}
              {inputMode === "image" && (
                <div className="mb-4">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 transition-colors hover:border-gray-400 hover:bg-gray-100"
                  >
                    <svg
                      className="mb-2 h-8 w-8 text-gray-400"
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
                    <p className="text-sm text-gray-500">
                      Drag & drop images here, or click to select
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Guest lists, event programs, name badges, etc.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageSelect}
                  />

                  {/* Image previews */}
                  {imagePreviews.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {imagePreviews.map((url, i) => (
                        <div key={i} className="group relative">
                          <img
                            src={url}
                            alt={`Upload ${i + 1}`}
                            className="h-20 w-20 rounded-md border border-gray-200 object-cover"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(i);
                            }}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Parse button */}
              <button
                onClick={handleParse}
                disabled={
                  parsing ||
                  (inputMode === "text" && !textInput.trim()) ||
                  (inputMode === "image" && imageFiles.length === 0)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                {parsing && (
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
                )}
                {parsing ? "Parsing..." : "Parse Names"}
              </button>
            </>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {parseError}
            </div>
          )}

          {/* Parsed results table */}
          {parsedRows && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">
                Parsed Names
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({parsedRows.length})
                </span>
              </h3>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                        Name
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                        Company / Title
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                        Context
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                        {/* Actions */}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {parsedRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) =>
                              updateRow(i, "name", e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={
                              [row.title, row.company]
                                .filter(Boolean)
                                .join(", ") || ""
                            }
                            onChange={(e) => {
                              // Simple split: treat as company if no comma
                              const val = e.target.value;
                              const parts = val.split(",").map((s) => s.trim());
                              if (parts.length >= 2) {
                                updateRow(i, "title", parts[0]);
                                updateRow(i, "company", parts.slice(1).join(", "));
                              } else {
                                updateRow(i, "company", val);
                                updateRow(i, "title", "");
                              }
                            }}
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.context}
                            onChange={(e) =>
                              updateRow(i, "context", e.target.value)
                            }
                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => removeRow(i)}
                            title="Remove"
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={addRow}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
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
                Add Row
              </button>

              {/* Create batch button */}
              <div className="mt-6 flex items-center gap-3 border-t border-gray-200 pt-4">
                <button
                  onClick={handleCreateBatch}
                  disabled={
                    creating ||
                    !batchName.trim() ||
                    parsedRows.filter((r) => r.name.trim()).length === 0
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
                >
                  {creating && (
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
                  )}
                  {creating
                    ? "Creating..."
                    : "Create Batch & Start Research"}
                </button>
                <button
                  onClick={() => {
                    setParsedRows(null);
                    setParseError(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Render: Batch List (default) ----
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Prospect Research
        </h1>
        <button
          onClick={() => setShowNewResearch(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Research
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {initialBatches.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg
              className="mx-auto mb-4 h-10 w-10 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
            <p className="mb-1 text-sm text-gray-500">
              No research batches yet
            </p>
            <p className="mb-4 text-xs text-gray-400">
              Start by creating a new research batch with names to investigate.
            </p>
            <button
              onClick={() => setShowNewResearch(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
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
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Start Research
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                    Batch Name
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                    Source
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                    Count
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                    {/* Actions */}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {initialBatches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() =>
                      router.push(`/tools/prospects/${batch.id}`)
                    }
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {batch.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {batch.source_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(batch.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {batch.prospect_count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(batch.statusSummary).map(
                          ([status, count]) => (
                            <span
                              key={status}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                statusColors[status] ||
                                "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {count} {status}
                            </span>
                          ),
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.25 4.5l7.5 7.5-7.5 7.5"
                        />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
