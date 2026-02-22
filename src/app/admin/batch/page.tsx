"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

export default function BatchPage() {
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
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
  const supabase = createClient();

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { count: total } = await supabase
        .from("artworks")
        .select("*", { count: "exact", head: true });

      const { count: withImages } = await supabase
        .from("artworks")
        .select("*", { count: "exact", head: true })
        .not("primary_image_url", "is", null);

      const { count: embedded } = await supabase
        .from("artworks_extended")
        .select("*", { count: "exact", head: true })
        .not("clip_embedding", "is", null);

      const { count: analyzed } = await supabase
        .from("artworks_extended")
        .select("*", { count: "exact", head: true })
        .not("vision_analyzed_at", "is", null);

      setStats({
        total: total || 0,
        withImages: withImages || 0,
        embedded: embedded || 0,
        analyzed: analyzed || 0,
      });
    } catch (e) {
      console.error("Failed to load stats:", e);
    } finally {
      setStatsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBatch(type: "embed" | "analyze") {
    pauseRef.current = false;

    // Fetch artworks that have images
    const { data: artworks } = await supabase
      .from("artworks")
      .select("id, title, primary_image_url")
      .not("primary_image_url", "is", null);

    if (!artworks || artworks.length === 0) {
      alert("No artworks with images found.");
      return;
    }

    // Fetch artworks_extended to find which ones are unprocessed
    const column = type === "embed" ? "clip_embedding" : "vision_analyzed_at";
    const { data: extended } = await supabase
      .from("artworks_extended")
      .select("artwork_id, clip_embedding, vision_analyzed_at");

    // Build a set of artwork IDs that have already been processed
    const processedIds = new Set<number>();
    if (extended) {
      for (const row of extended) {
        if (type === "embed" && row.clip_embedding !== null) {
          processedIds.add(row.artwork_id);
        } else if (type === "analyze" && row.vision_analyzed_at !== null) {
          processedIds.add(row.artwork_id);
        }
      }
    }

    // Filter to only unprocessed artworks with images
    const unprocessed = artworks.filter((a) => !processedIds.has(a.id));

    if (unprocessed.length === 0) {
      alert("All artworks have already been processed!");
      return;
    }

    setProgress({
      running: true,
      type,
      current: 0,
      total: unprocessed.length,
      currentItem: "",
      startedAt: new Date(),
      errors: [],
    });

    const endpoint = type === "embed" ? "/api/embed" : "/api/analyze";

    for (let i = 0; i < unprocessed.length; i++) {
      if (pauseRef.current) break;

      const item = unprocessed[i];
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
              {
                artworkId: item.id,
                title,
                error: data.error || `HTTP ${res.status}`,
              },
            ],
          }));
        }
      } catch (e) {
        setProgress((prev) => ({
          ...prev,
          errors: [
            ...prev.errors,
            {
              artworkId: item.id,
              title,
              error: String(e),
            },
          ],
        }));
      }

      // Delay between requests to avoid overwhelming APIs
      if (type === "analyze") {
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setProgress((prev) => ({ ...prev, running: false }));
    loadStats();
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
              {
                artworkId: item.artworkId,
                title: item.title,
                error: data.error || `HTTP ${res.status}`,
              },
            ],
          }));
        }
      } catch (e) {
        setProgress((prev) => ({
          ...prev,
          errors: [
            ...prev.errors,
            {
              artworkId: item.artworkId,
              title: item.title,
              error: String(e),
            },
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
    loadStats();
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

  const embedRemaining = stats
    ? stats.withImages - stats.embedded
    : 0;
  const analyzeRemaining = stats
    ? stats.withImages - stats.analyzed
    : 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Batch Processing</h1>
        <button
          onClick={loadStats}
          disabled={statsLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {statsLoading && <Spinner />}
          Refresh Stats
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* CLIP Embeddings Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">
              CLIP Embeddings
            </h3>
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
                  style={{
                    width: `${getPercentage(stats.embedded, stats.withImages)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {getPercentage(stats.embedded, stats.withImages)}%
              </p>
            </div>
            <button
              onClick={() => runBatch("embed")}
              disabled={progress.running || embedRemaining === 0}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start Embedding Batch
            </button>
          </div>

          {/* Claude Vision Analysis Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">
              Claude Vision Analysis
            </h3>
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
                  style={{
                    width: `${getPercentage(stats.analyzed, stats.withImages)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {getPercentage(stats.analyzed, stats.withImages)}%
              </p>
            </div>
            <button
              onClick={() => runBatch("analyze")}
              disabled={progress.running || analyzeRemaining === 0}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start Analysis Batch
            </button>
          </div>
        </div>
      )}

      {statsLoading && !stats && (
        <div className="mb-8 flex items-center justify-center py-12">
          <Spinner />
          <span className="ml-2 text-sm text-gray-500">Loading stats...</span>
        </div>
      )}

      {/* Progress Section */}
      {(progress.running || progress.current > 0) && progress.type && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {progress.running ? "Processing" : "Batch Complete"}
              {progress.type === "embed"
                ? " - CLIP Embeddings"
                : " - Vision Analysis"}
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
                style={{
                  width: `${getPercentage(progress.current, progress.total)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {getPercentage(progress.current, progress.total)}%
            </p>
          </div>

          {!progress.running && progress.current > 0 && (
            <p className="mt-3 text-sm font-medium text-green-700">
              Finished processing {progress.current} items
              {progress.errors.length > 0 &&
                ` (${progress.errors.length} errors)`}
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
              <li
                key={`${err.artworkId}-${idx}`}
                className="text-sm text-red-700"
              >
                <span className="font-medium">
                  Artwork {err.artworkId}
                </span>{" "}
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

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
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
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
