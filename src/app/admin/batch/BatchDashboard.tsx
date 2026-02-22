"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface BatchStats {
  total: number;
  withImages: number;
  embedded: number;
  analyzed: number;
}

interface ErrorEntry {
  artworkId: number;
  title: string;
  error: string;
}

interface BatchProgress {
  running: boolean;
  type: "embed" | "analyze" | null;
  current: number;
  total: number;
  currentItem: string;
  startedAt: Date | null;
  errors: ErrorEntry[];
}

type BatchMode = "incremental" | "full";

export default function BatchDashboard({ stats }: { stats: BatchStats }) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<BatchMode>("incremental");
  const [progress, setProgress] = useState<BatchProgress>({
    running: false,
    type: null,
    current: 0,
    total: 0,
    currentItem: "",
    startedAt: null,
    errors: [],
  });
  const pauseRef = useRef(false);

  // Paginated fetch to bypass Supabase PostgREST max_rows (default 1000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchAllRows(
    queryFn: (offset: number, limit: number) => Promise<{ data: any[] | null }>,
    pageSize = 1000,
  ) {
    const all: any[] = [];
    let offset = 0;
    while (true) {
      const { data } = await queryFn(offset, pageSize);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  async function runBatch(type: "embed" | "analyze") {
    pauseRef.current = false;

    // Fetch all artworks that have images (paginated to bypass 1000 row limit)
    const artworks: { id: number; title: string | null; primary_image_url: string }[] =
      await fetchAllRows(async (offset, limit) =>
        await supabase
          .from("artworks")
          .select("id, title, primary_image_url")
          .not("primary_image_url", "is", null)
          .order("id")
          .range(offset, offset + limit - 1),
      );

    if (artworks.length === 0) return;

    let toProcess = artworks;

    if (mode === "incremental") {
      // Fetch all extended rows (paginated), using timestamps not embedding vectors
      const extended: { artwork_id: number; clip_generated_at: string | null; vision_analyzed_at: string | null }[] =
        await fetchAllRows(async (offset, limit) =>
          await supabase
            .from("artworks_extended")
            .select("artwork_id, clip_generated_at, vision_analyzed_at")
            .order("artwork_id")
            .range(offset, offset + limit - 1),
        );

      const processedIds = new Set<number>();
      for (const row of extended) {
        if (type === "embed" && row.clip_generated_at !== null) {
          processedIds.add(row.artwork_id);
        } else if (type === "analyze" && row.vision_analyzed_at !== null) {
          processedIds.add(row.artwork_id);
        }
      }
      toProcess = artworks.filter((a) => !processedIds.has(a.id));
    }

    if (toProcess.length === 0) return;

    setProgress({
      running: true,
      type,
      current: 0,
      total: toProcess.length,
      currentItem: "",
      startedAt: new Date(),
      errors: [],
    });

    if (type === "embed") {
      // Batch embedding: send groups to /api/embed/batch
      // Paid tier: 2M TPM, ~1K tokens/image → batch of 50
      const BATCH_SIZE = 50;
      let processed = 0;

      for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        if (pauseRef.current) break;

        const batch = toProcess.slice(i, i + BATCH_SIZE);
        const batchIds = batch.map((a) => a.id);
        const batchTitle = batch.map((a) => a.title || `Artwork ${a.id}`).join(", ");

        setProgress((prev) => ({
          ...prev,
          current: processed,
          currentItem: `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} artworks`,
        }));

        try {
          const res = await fetch("/api/embed/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ artworkIds: batchIds }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({ error: "Unknown error" }));
            // Mark all items in batch as failed
            for (const item of batch) {
              setProgress((prev) => ({
                ...prev,
                errors: [
                  ...prev.errors,
                  { artworkId: item.id, title: item.title || `Artwork ${item.id}`, error: data.error || `HTTP ${res.status}` },
                ],
              }));
            }
          } else {
            const data = await res.json();
            // Add individual errors from the batch
            if (data.errors && data.errors.length > 0) {
              for (const err of data.errors) {
                const item = batch.find((a) => a.id === err.artworkId);
                setProgress((prev) => ({
                  ...prev,
                  errors: [
                    ...prev.errors,
                    { artworkId: err.artworkId, title: item?.title || `Artwork ${err.artworkId}`, error: err.error },
                  ],
                }));
              }
            }
          }
        } catch (e) {
          for (const item of batch) {
            setProgress((prev) => ({
              ...prev,
              errors: [
                ...prev.errors,
                { artworkId: item.id, title: item.title || `Artwork ${item.id}`, error: String(e) },
              ],
            }));
          }
        }

        processed += batch.length;
        setProgress((prev) => ({ ...prev, current: processed }));

      }
    } else {
      // Vision analysis: still one at a time (Claude doesn't batch)
      const endpoint = "/api/analyze";

      for (let i = 0; i < toProcess.length; i++) {
        if (pauseRef.current) break;

        const item = toProcess[i];
        const title = item.title || `Artwork ${item.id}`;

        setProgress((prev) => ({
          ...prev,
          current: i + 1,
          currentItem: title,
        }));

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ artworkId: item.id }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({ error: "Unknown error" }));
            setProgress((prev) => ({
              ...prev,
              errors: [
                ...prev.errors,
                { artworkId: item.id, title, error: data.error || `HTTP ${res.status}` },
              ],
            }));
          }
        } catch (e) {
          setProgress((prev) => ({
            ...prev,
            errors: [
              ...prev.errors,
              { artworkId: item.id, title, error: String(e) },
            ],
          }));
        }

        // Rate limit delay for Claude
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    setProgress((prev) => ({ ...prev, running: false }));
    router.refresh();
  }

  async function retryFailed() {
    if (progress.errors.length === 0 || !progress.type) return;

    const type = progress.type;
    const failedItems = [...progress.errors];
    pauseRef.current = false;

    setProgress({
      running: true,
      type,
      current: 0,
      total: failedItems.length,
      currentItem: "",
      startedAt: new Date(),
      errors: [],
    });

    const endpoint = type === "embed" ? "/api/embed" : "/api/analyze";

    for (let i = 0; i < failedItems.length; i++) {
      if (pauseRef.current) break;

      const item = failedItems[i];
      setProgress((prev) => ({
        ...prev,
        current: i + 1,
        currentItem: item.title,
      }));

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artworkId: item.artworkId }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Unknown error" }));
          setProgress((prev) => ({
            ...prev,
            errors: [
              ...prev.errors,
              { artworkId: item.artworkId, title: item.title, error: data.error || `HTTP ${res.status}` },
            ],
          }));
        }
      } catch (e) {
        setProgress((prev) => ({
          ...prev,
          errors: [
            ...prev.errors,
            { artworkId: item.artworkId, title: item.title, error: String(e) },
          ],
        }));
      }

      if (type === "analyze") {
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setProgress((prev) => ({ ...prev, running: false }));
    router.refresh();
  }

  function handlePause() {
    pauseRef.current = true;
    setProgress((prev) => ({ ...prev, running: false }));
  }

  function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  function getElapsed(): number {
    if (!progress.startedAt) return 0;
    return Date.now() - progress.startedAt.getTime();
  }

  function getEstimatedRemaining(): string {
    if (!progress.startedAt || progress.current === 0) return "calculating...";
    const elapsed = getElapsed();
    const perItem = elapsed / progress.current;
    const remaining = perItem * (progress.total - progress.current);
    return `~${formatTime(remaining)} remaining`;
  }

  function getPercentage(current: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  }

  const embedRemaining = stats.withImages - stats.embedded;
  const analyzeRemaining = stats.withImages - stats.analyzed;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Batch Processing</h1>

      {/* Mode Toggle */}
      <div className="mb-6 flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700">Mode:</span>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setMode("incremental")}
            disabled={progress.running}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "incremental"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Incremental
          </button>
          <button
            onClick={() => setMode("full")}
            disabled={progress.running}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "full"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Full
          </button>
        </div>
        <span className="text-xs text-gray-400">
          {mode === "incremental"
            ? "Only process unprocessed artworks"
            : "Re-process all artworks with images"}
        </span>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* CLIP Embeddings Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">CLIP Embeddings</h3>
          <div className="mt-3 space-y-1">
            <p className="text-sm text-gray-600">
              <span className="text-2xl font-bold text-gray-900">
                {stats.embedded.toLocaleString()}
              </span>{" "}
              of {stats.withImages.toLocaleString()} complete
            </p>
            <p className="text-sm text-gray-500">
              {embedRemaining.toLocaleString()} remaining
            </p>
          </div>
          <div className="mt-3">
            <div className="h-2.5 w-full rounded-full bg-gray-200">
              <div
                className="h-2.5 rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${getPercentage(stats.embedded, stats.withImages)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {getPercentage(stats.embedded, stats.withImages)}%
            </p>
          </div>
          <button
            onClick={() => runBatch("embed")}
            disabled={progress.running || (mode === "incremental" && embedRemaining === 0)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === "full" ? "Re-embed All" : "Start Embedding"}
          </button>
        </div>

        {/* Claude Vision Analysis Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">Claude Vision Analysis</h3>
          <div className="mt-3 space-y-1">
            <p className="text-sm text-gray-600">
              <span className="text-2xl font-bold text-gray-900">
                {stats.analyzed.toLocaleString()}
              </span>{" "}
              of {stats.withImages.toLocaleString()} complete
            </p>
            <p className="text-sm text-gray-500">
              {analyzeRemaining.toLocaleString()} remaining
            </p>
          </div>
          <div className="mt-3">
            <div className="h-2.5 w-full rounded-full bg-gray-200">
              <div
                className="h-2.5 rounded-full bg-purple-600 transition-all duration-300"
                style={{ width: `${getPercentage(stats.analyzed, stats.withImages)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {getPercentage(stats.analyzed, stats.withImages)}%
            </p>
          </div>
          <button
            onClick={() => runBatch("analyze")}
            disabled={progress.running || (mode === "incremental" && analyzeRemaining === 0)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === "full" ? "Re-analyze All" : "Start Analysis"}
          </button>
        </div>
      </div>

      {/* Progress Section */}
      {(progress.running || progress.current > 0) && progress.type && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {progress.running ? "Processing" : "Batch Complete"}
              {progress.type === "embed" ? " — CLIP Embeddings" : " — Vision Analysis"}
            </h3>
            {progress.running && (
              <button
                onClick={handlePause}
                className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-1.5 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
              >
                Pause
              </button>
            )}
          </div>

          {progress.currentItem && (
            <p className="mt-3 text-sm text-gray-600">
              Currently processing:{" "}
              <span className="font-medium text-gray-900">
                &ldquo;{progress.currentItem}&rdquo;
              </span>
            </p>
          )}

          <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
            <span>
              Progress: {progress.current} / {progress.total}
            </span>
            <span>Elapsed: {formatTime(getElapsed())}</span>
            {progress.running && <span>{getEstimatedRemaining()}</span>}
          </div>

          <div className="mt-3">
            <div className="h-2.5 w-full rounded-full bg-gray-200">
              <div
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  progress.type === "embed" ? "bg-blue-600" : "bg-purple-600"
                }`}
                style={{ width: `${getPercentage(progress.current, progress.total)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {getPercentage(progress.current, progress.total)}%
            </p>
          </div>

          {!progress.running && progress.current > 0 && (
            <p className="mt-3 text-sm font-medium text-green-700">
              Finished processing {progress.current} items
              {progress.errors.length > 0 && ` (${progress.errors.length} errors)`}
            </p>
          )}
        </div>
      )}

      {/* Error List */}
      {progress.errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-red-900">
              Recent Errors ({progress.errors.length})
            </h3>
            {!progress.running && (
              <button
                onClick={retryFailed}
                className="rounded-lg border border-red-300 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Retry Failed
              </button>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {progress.errors.map((err, idx) => (
              <li key={`${err.artworkId}-${idx}`} className="text-sm text-red-700">
                <span className="font-medium">Artwork {err.artworkId}</span>{" "}
                &ldquo;{err.title}&rdquo;:{" "}
                <span className="text-red-600">{err.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
