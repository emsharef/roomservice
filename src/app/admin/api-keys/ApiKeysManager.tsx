"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  user_email: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export default function ApiKeysManager({ keys }: { keys: ApiKey[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create key");
      } else {
        setNewKeyValue(data.key);
        setNewKeyName("");
        router.refresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setRevoking(keyId);
    setError(null);

    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to revoke key");
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRevoking(null);
    }
  }

  function copyKey() {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  }

  const activeKeys = keys.filter((k) => !k.revoked);
  const revokedKeys = keys.filter((k) => k.revoked);

  return (
    <div className="space-y-6">
      {/* Create new key */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create API Key</h2>

        {newKeyValue ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="mb-2 text-sm font-medium text-green-800">
                API key created! Copy it now — it won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm text-green-900 border border-green-200">
                  {newKeyValue}
                </code>
                <button
                  onClick={copyKey}
                  className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <button
              onClick={() => setNewKeyValue(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g., Claude Desktop, Cursor)"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Key"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Active keys */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Active Keys ({activeKeys.length})
          </h2>
        </div>

        {activeKeys.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No active API keys. Create one above to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Key</th>
                <th className="px-6 py-3">Created By</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3">Last Used</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeKeys.map((key) => (
                <tr key={key.id}>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{key.name}</td>
                  <td className="px-6 py-3">
                    <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                      {key.key_prefix}...
                    </code>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">{key.user_email}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{formatDate(key.created_at)}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{formatDate(key.last_used_at)}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => handleRevoke(key.id)}
                      disabled={revoking === key.id}
                      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {revoking === key.id ? "Revoking..." : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-400">
              Revoked Keys ({revokedKeys.length})
            </h2>
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-gray-100">
              {revokedKeys.map((key) => (
                <tr key={key.id} className="text-gray-400">
                  <td className="px-6 py-3 text-sm line-through">{key.name}</td>
                  <td className="px-6 py-3">
                    <code className="rounded bg-gray-50 px-2 py-0.5 font-mono text-xs">
                      {key.key_prefix}...
                    </code>
                  </td>
                  <td className="px-6 py-3 text-sm">{key.user_email}</td>
                  <td className="px-6 py-3 text-sm">{formatDate(key.created_at)}</td>
                  <td className="px-6 py-3 text-sm">{formatDate(key.last_used_at)}</td>
                  <td className="px-6 py-3"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Usage instructions */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Usage</h3>
        <p className="mb-3 text-sm text-gray-600">
          Add this MCP server to your Claude Desktop config or other MCP-compatible client:
        </p>
        <pre className="rounded-lg bg-gray-900 p-4 text-xs text-gray-100 overflow-x-auto">
{`{
  "mcpServers": {
    "room-service": {
      "type": "streamable-http",
      "url": "${process.env.NEXT_PUBLIC_SITE_URL || "https://roomservice-tools.vercel.app"}/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}
