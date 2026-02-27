"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface SyncLogEntry {
  id: number;
  entity_type: string;
  direction: string;
  status: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  triggered_by: string | null;
}

interface SyncDashboardProps {
  counts: {
    artworks: number;
    artists: number;
    contacts: number;
  };
  lastSyncs: Record<string, SyncLogEntry | null>;
  recentLogs: SyncLogEntry[];
  lastScheduledSync: SyncLogEntry | null;
}

type EntityType = "artworks" | "artists" | "contacts";
type SyncMode = "full" | "incremental";

interface SyncProgress {
  phase: "syncing" | "detailing" | "done";
  processed: number;
  total: number;
  created: number;
  updated: number;
  currentPage?: number;
  errors: string[];
  startedAt: Date | null;
}

export default function SyncDashboard({
  counts,
  lastSyncs,
  recentLogs,
  lastScheduledSync,
}: SyncDashboardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [syncMode, setSyncMode] = useState<SyncMode>("incremental");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [activeEntity, setActiveEntity] = useState<string | null>(null);
  const pauseRef = useRef(false);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  async function handleSync(entity: EntityType) {
    pauseRef.current = false;
    setLoading((prev) => ({ ...prev, [entity]: true }));
    setActiveEntity(entity);
    setResults((prev) => ({ ...prev, [entity]: "" }));

    const prog: SyncProgress = {
      phase: "syncing",
      processed: 0,
      total: 0,
      created: 0,
      updated: 0,
      currentPage: 0,
      errors: [],
      startedAt: new Date(),
    };
    setProgress(prog);

    try {
      // Phase 1: Page-by-page sync
      let offset = 0;
      let hasMore = true;
      let totalRecords = 0;

      while (hasMore && !pauseRef.current) {
        const res = await fetch("/api/sync/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity,
            offset,
            limit: 100,
            sort: "updated_at",
            order: syncMode === "incremental" ? "desc" : "asc",
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Unknown error" }));
          prog.errors.push(data.error || `HTTP ${res.status}`);
          setProgress({ ...prog });
          break;
        }

        const data = await res.json();
        totalRecords = data.total;
        prog.processed += data.processed;
        prog.created += data.created;
        prog.updated += data.updated;
        prog.total = totalRecords;
        prog.currentPage = (prog.currentPage ?? 0) + 1;
        if (data.errors?.length) {
          prog.errors.push(...data.errors);
        }
        setProgress({ ...prog });

        hasMore = data.hasMore;
        offset = data.nextOffset;

        // For incremental: stop if we got fewer new records (all remaining are old)
        if (syncMode === "incremental" && data.processed === 0) {
          break;
        }
      }

      if (pauseRef.current) {
        prog.phase = "done";
        setProgress({ ...prog });
        setResults((prev) => ({
          ...prev,
          [entity]: `Paused: ${prog.processed} synced (${prog.created} created, ${prog.updated} updated)`,
        }));
        setLoading((prev) => ({ ...prev, [entity]: false }));
        setActiveEntity(null);
        return;
      }

      // Phase 2: Detail sync — fetch items needing detail
      const { data: needsDetail } = await supabase
        .from(entity)
        .select("id")
        .is("detail_synced_at", null)
        .limit(10000);

      const detailIds = (needsDetail ?? []).map((r: { id: number }) => r.id);

      if (detailIds.length > 0) {
        prog.phase = "detailing";
        prog.processed = 0;
        prog.total = detailIds.length;
        setProgress({ ...prog });

        for (let i = 0; i < detailIds.length; i++) {
          if (pauseRef.current) break;

          try {
            const res = await fetch("/api/sync/detail", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entity, id: detailIds[i] }),
            });

            if (!res.ok) {
              const data = await res.json().catch(() => ({ error: "Unknown" }));
              prog.errors.push(`detail ${detailIds[i]}: ${data.error || `HTTP ${res.status}`}`);
            }
          } catch (e) {
            prog.errors.push(`detail ${detailIds[i]}: ${String(e)}`);
          }

          prog.processed = i + 1;
          if (prog.processed % 5 === 0 || prog.processed === detailIds.length) {
            setProgress({ ...prog });
          }
        }
      }

      prog.phase = "done";
      setProgress({ ...prog });

      const errorMsg = prog.errors.length > 0 ? ` (${prog.errors.length} errors)` : "";
      setResults((prev) => ({
        ...prev,
        [entity]: `Synced ${entity}: ${prog.created} created, ${prog.updated} updated${errorMsg}`,
      }));
      router.refresh();
    } catch (e) {
      setResults((prev) => ({ ...prev, [entity]: `Error: ${String(e)}` }));
    } finally {
      setLoading((prev) => ({ ...prev, [entity]: false }));
      setActiveEntity(null);
    }
  }

  async function handleSyncAll() {
    const entities: EntityType[] = ["artworks", "artists", "contacts"];
    setLoading((prev) => ({ ...prev, all: true }));
    setResults((prev) => ({ ...prev, all: "" }));

    const summaries: string[] = [];
    for (const entity of entities) {
      if (pauseRef.current) break;
      await handleSync(entity);
      const result = results[entity];
      if (result) summaries.push(result);
    }

    setResults((prev) => ({ ...prev, all: summaries.join(" | ") || "Complete" }));
    setLoading((prev) => ({ ...prev, all: false }));
    router.refresh();
  }

  function handlePause() {
    pauseRef.current = true;
  }

  async function handleTrigger(taskName: "sync" | "analyze") {
    setTriggerLoading(taskName);
    setTriggerResult(null);
    try {
      const res = await fetch("/api/trigger/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskName === "analyze" ? "analyze" : "sync" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTriggerResult(`Error: ${data.error}`);
      } else {
        setTriggerResult(`Triggered ${data.triggered} (run: ${data.id})`);
        router.refresh();
      }
    } catch (e) {
      setTriggerResult(`Error: ${String(e)}`);
    } finally {
      setTriggerLoading(null);
    }
  }

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  }

  function formatDuration(started: string, completed: string | null): string {
    if (!completed) return "-";
    const ms = new Date(completed).getTime() - new Date(started).getTime();
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  function formatElapsed(startedAt: Date | null): string {
    if (!startedAt) return "";
    const ms = Date.now() - startedAt.getTime();
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  function getPercentage(current: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  }

  const entities: { key: EntityType; label: string }[] = [
    { key: "artworks", label: "Artworks" },
    { key: "artists", label: "Artists" },
    { key: "contacts", label: "Contacts" },
  ];

  const isAnySyncing = Object.values(loading).some(Boolean);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Sync Dashboard</h1>

      {/* Overview Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {entities.map(({ key, label }) => (
          <div
            key={key}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-sm font-medium text-gray-500">{label}</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">
              {counts[key].toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Last synced: {formatDate(lastSyncs[key]?.completed_at)}
            </p>
          </div>
        ))}
      </div>

      {/* Scheduled Sync (Trigger.dev) */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Background Sync</h2>
            <p className="mt-1 text-sm text-gray-500">
              Incremental sync runs automatically every 2 hours via Trigger.dev.
              New artworks are auto-analyzed (vision + embeddings).
            </p>
          </div>
          <StatusBadge status="active" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Last Scheduled Sync</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {lastScheduledSync
                ? formatDate(lastScheduledSync.started_at)
                : "Not yet run"}
            </p>
            {lastScheduledSync && (
              <p className="mt-0.5 text-xs text-gray-500">
                Status: {lastScheduledSync.status}
                {lastScheduledSync.records_processed > 0 &&
                  ` — ${lastScheduledSync.records_processed} processed`}
              </p>
            )}
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => handleTrigger("sync")}
              disabled={triggerLoading !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {triggerLoading === "sync" && <Spinner />}
              Trigger Sync Now
            </button>
            <button
              onClick={() => handleTrigger("analyze")}
              disabled={triggerLoading !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-600 bg-white px-4 py-2 text-sm font-medium text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {triggerLoading === "analyze" && <Spinner />}
              Run Analysis
            </button>
          </div>
        </div>
        {triggerResult && (
          <p
            className={`mt-3 text-sm ${
              triggerResult.startsWith("Error") ? "text-red-600" : "text-green-700"
            }`}
          >
            {triggerResult}
          </p>
        )}
      </div>

      {/* Manual Sync Controls */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Manual Sync</h2>

        {/* Mode Toggle */}
        <div className="mb-4 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Mode:</span>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              onClick={() => setSyncMode("incremental")}
              disabled={isAnySyncing}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                syncMode === "incremental"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Incremental
            </button>
            <button
              onClick={() => setSyncMode("full")}
              disabled={isAnySyncing}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                syncMode === "full"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Full
            </button>
          </div>
          <span className="text-xs text-gray-400">
            {syncMode === "incremental"
              ? "Only sync records updated since last sync"
              : "Re-sync all records"}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          {entities.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSync(key)}
              disabled={isAnySyncing}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading[key] && <Spinner />}
              Sync {label}
            </button>
          ))}
          <button
            onClick={handleSyncAll}
            disabled={isAnySyncing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-900 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading.all && <Spinner />}
            Sync All
          </button>
          {isAnySyncing && (
            <button
              onClick={handlePause}
              className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
            >
              Pause
            </button>
          )}
        </div>

        {/* Progress */}
        {progress && activeEntity && progress.phase !== "done" && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-900">
                {progress.phase === "syncing"
                  ? `Syncing ${activeEntity} — page ${progress.currentPage}`
                  : `Fetching ${activeEntity} details`}
              </span>
              <span className="text-gray-500">
                {formatElapsed(progress.startedAt)}
              </span>
            </div>
            <div className="mt-2">
              <div className="h-2 w-full rounded-full bg-gray-200">
                {syncMode === "incremental" && progress.phase === "syncing" ? (
                  <div className="h-2 w-1/3 animate-pulse rounded-full bg-gray-900" />
                ) : (
                  <div
                    className="h-2 rounded-full bg-gray-900 transition-all duration-300"
                    style={{ width: `${getPercentage(progress.processed, progress.total)}%` }}
                  />
                )}
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                {syncMode === "incremental" && progress.phase === "syncing" ? (
                  <span>
                    {progress.processed.toLocaleString()} updated so far
                  </span>
                ) : (
                  <>
                    <span>
                      {progress.processed.toLocaleString()} / {progress.total.toLocaleString()}
                    </span>
                    <span>{getPercentage(progress.processed, progress.total)}%</span>
                  </>
                )}
              </div>
            </div>
            {progress.phase === "syncing" && (
              <p className="mt-2 text-xs text-gray-500">
                {progress.created} created, {progress.updated} updated
                {progress.errors.length > 0 && `, ${progress.errors.length} errors`}
              </p>
            )}
          </div>
        )}

        {/* Results */}
        <div className="mt-3 space-y-1">
          {Object.entries(results).map(
            ([key, msg]) =>
              msg && (
                <p
                  key={key}
                  className={`text-sm ${
                    msg.startsWith("Error") ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {msg}
                </p>
              )
          )}
        </div>
      </div>

      {/* Recent Sync Log */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Sync Log</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Entity Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Direction
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Records
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No sync history yet. Run your first sync above.
                  </td>
                </tr>
              )}
              {recentLogs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {log.entity_type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {log.direction}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {log.records_processed} processed
                    {log.records_created > 0 && `, ${log.records_created} created`}
                    {log.records_updated > 0 && `, ${log.records_updated} updated`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {formatDuration(log.started_at, log.completed_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {formatDate(log.started_at)}
                  </td>
                </tr>
              ))}
              {recentLogs
                .filter((log) => log.status === "error" && log.error)
                .map((log) => (
                  <tr key={`error-${log.id}`} className="bg-red-50">
                    <td colSpan={6} className="px-4 py-2 text-xs text-red-600">
                      Error in {log.entity_type} sync: {log.error}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    running: "bg-blue-100 text-blue-800",
    error: "bg-red-100 text-red-800",
    active: "bg-green-100 text-green-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[status] ?? "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
