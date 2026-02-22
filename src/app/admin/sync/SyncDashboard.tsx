"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
}

type EntityType = "artworks" | "artists" | "contacts";
type SyncMode = "full" | "incremental";

export default function SyncDashboard({
  counts,
  lastSyncs,
  recentLogs,
}: SyncDashboardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [syncMode, setSyncMode] = useState<SyncMode>("incremental");

  async function readSSE(url: string, options: RequestInit, key: string) {
    const res = await fetch(url, options);

    if (!res.ok) {
      const data = await res.json();
      setResults((prev) => ({ ...prev, [key]: `Error: ${data.error}` }));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setResults((prev) => ({ ...prev, [key]: "Error: No response stream" }));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const match = line.match(/^data: (.+)$/m);
        if (!match) continue;
        try {
          const data = JSON.parse(match[1]);
          if (data.heartbeat) {
            continue;
          }
          if (data.progress) {
            const p = data.progress;
            if (p.phase === "fetching") {
              const label = p.entity ? `${p.entity}: ` : "";
              setResults((prev) => ({ ...prev, [key]: `${label}Fetching from Arternal...` }));
            } else if (p.phase === "upserting") {
              const pct = p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
              const label = p.entity ? `${p.entity}: ` : "";
              setResults((prev) => ({
                ...prev,
                [key]: `${label}${p.processed}/${p.total} (${pct}%) — ${p.created} created, ${p.updated} updated`,
              }));
            } else if (p.phase === "detailing") {
              const pct = p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
              const label = p.entity ? `${p.entity}: ` : "";
              setResults((prev) => ({
                ...prev,
                [key]: `${label}Fetching details: ${p.processed}/${p.total} (${pct}%)`,
              }));
            }
            continue;
          }
          return data;
        } catch {
          // ignore parse errors
        }
      }
    }
    return null;
  }

  async function handleSync(entity: EntityType) {
    setLoading((prev) => ({ ...prev, [entity]: true }));
    const modeLabel = syncMode === "incremental" ? "incremental" : "full";
    setResults((prev) => ({ ...prev, [entity]: `Starting ${modeLabel} sync...` }));

    try {
      const data = await readSSE(
        "/api/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity, mode: syncMode }),
        },
        entity
      );

      if (!data) {
        setResults((prev) => ({ ...prev, [entity]: "Error: No response" }));
      } else if (data.error) {
        setResults((prev) => ({ ...prev, [entity]: `Error: ${data.error}` }));
      } else {
        const r = data.result;
        const skippedMsg = r.skipped ? `, ${r.skipped} skipped` : "";
        setResults((prev) => ({
          ...prev,
          [entity]: `Synced ${r.processed} ${entity}: ${r.created} created, ${r.updated} updated${skippedMsg}`,
        }));
        router.refresh();
      }
    } catch (e) {
      setResults((prev) => ({ ...prev, [entity]: `Error: ${String(e)}` }));
    } finally {
      setLoading((prev) => ({ ...prev, [entity]: false }));
    }
  }

  async function handleSyncAll() {
    setLoading((prev) => ({ ...prev, all: true }));
    const modeLabel = syncMode === "incremental" ? "incremental" : "full";
    setResults((prev) => ({ ...prev, all: `Starting ${modeLabel} sync...` }));

    try {
      const data = await readSSE(
        "/api/sync/all",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: syncMode }),
        },
        "all"
      );

      if (!data) {
        setResults((prev) => ({ ...prev, all: "Error: No response" }));
      } else if (data.error) {
        setResults((prev) => ({ ...prev, all: `Error: ${data.error}` }));
      } else {
        const summaries = data.results.map(
          (r: { entity: string; processed: number; created: number; updated: number; skipped?: number }) => {
            const skippedMsg = r.skipped ? `, ${r.skipped} skipped` : "";
            return `${r.entity}: ${r.processed} processed (${r.created} created, ${r.updated} updated${skippedMsg})`;
          }
        );
        setResults((prev) => ({ ...prev, all: summaries.join(" | ") }));
        router.refresh();
      }
    } catch (e) {
      setResults((prev) => ({ ...prev, all: `Error: ${String(e)}` }));
    } finally {
      setLoading((prev) => ({ ...prev, all: false }));
    }
  }

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  }

  function formatDuration(
    started: string,
    completed: string | null
  ): string {
    if (!completed) return "-";
    const ms =
      new Date(completed).getTime() - new Date(started).getTime();
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  const entities: { key: EntityType; label: string }[] = [
    { key: "artworks", label: "Artworks" },
    { key: "artists", label: "Artists" },
    { key: "contacts", label: "Contacts" },
  ];

  const isAnySyncing = Object.values(loading).some(Boolean);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Sync Dashboard
      </h1>

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

      {/* Sync Controls */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Trigger Sync
        </h2>

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
              : "Re-sync all records (resumable on failure)"}
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
        </div>

        {/* Results */}
        <div className="mt-3 space-y-1">
          {Object.entries(results).map(
            ([key, msg]) =>
              msg && (
                <p
                  key={key}
                  className={`text-sm ${
                    msg.startsWith("Error")
                      ? "text-red-600"
                      : "text-green-700"
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
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Recent Sync Log
        </h2>
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
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
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
                    {log.records_created > 0 &&
                      `, ${log.records_created} created`}
                    {log.records_updated > 0 &&
                      `, ${log.records_updated} updated`}
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
                    <td
                      colSpan={6}
                      className="px-4 py-2 text-xs text-red-600"
                    >
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
