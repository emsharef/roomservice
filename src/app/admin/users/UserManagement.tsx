"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
}

interface UserManagementProps {
  users: UserProfile[];
  currentUserId: string;
}

export default function UserManagement({
  users,
  currentUserId,
}: UserManagementProps) {
  const router = useRouter();
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdatingRole(userId);
    setRoleError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        setRoleError(data.error ?? "Failed to update role");
      } else {
        router.refresh();
      }
    } catch (e) {
      setRoleError(String(e));
    } finally {
      setUpdatingRole(null);
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    setDeletingUser(userId);
    setRoleError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setRoleError(data.error ?? "Failed to delete user");
      } else {
        router.refresh();
      }
    } catch (e) {
      setRoleError(String(e));
    } finally {
      setDeletingUser(null);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
        >
          {showInvite ? "Cancel" : "Invite User"}
        </button>
      </div>

      {showInvite && (
        <InviteForm
          onComplete={() => {
            setShowInvite(false);
            router.refresh();
          }}
        />
      )}

      {roleError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {roleError}
        </div>
      )}

      {/* User list table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Display Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Created
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No users found.
                </td>
              </tr>
            )}
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <tr key={user.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {user.email}
                    {isSelf && (
                      <span className="ml-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        you
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {user.display_name ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <select
                      value={user.role}
                      onChange={(e) =>
                        handleRoleChange(user.id, e.target.value)
                      }
                      disabled={isSelf || updatingRole === user.id}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="admin">admin</option>
                      <option value="staff">staff</option>
                      <option value="viewer">viewer</option>
                    </select>
                    {updatingRole === user.id && (
                      <span className="ml-2 text-xs text-gray-400">
                        Saving...
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    {!isSelf && (
                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        disabled={deletingUser === user.id}
                        className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {deletingUser === user.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InviteForm({ onComplete }: { onComplete: () => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to invite user");
      } else {
        setSuccess(`Invite sent to ${data.user.email}. They'll receive an email to set their password.`);
        setTimeout(() => onComplete(), 1500);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Invite New User
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="invite-email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="invite-name"
              className="block text-sm font-medium text-gray-700"
            >
              Display Name
            </label>
            <input
              id="invite-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label
              htmlFor="invite-role"
              className="block text-sm font-medium text-gray-700"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="admin">admin</option>
              <option value="staff">staff</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sending invite..." : "Send Invite"}
        </button>
      </form>
    </div>
  );
}
