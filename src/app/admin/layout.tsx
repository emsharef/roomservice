import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-8 text-center text-gray-500">Please log in.</div>
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;
  if (!role || !["admin", "staff"].includes(role)) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">
          You need admin or staff role to access this area.
        </p>
      </div>
    );
  }

  return (
    <div className="-mt-8">
      <div className="border-b border-gray-200">
        <nav className="mx-auto flex max-w-7xl gap-6 px-4 sm:px-6 lg:px-8">
          <AdminTab href="/admin/sync">Sync Dashboard</AdminTab>
          <AdminTab href="/admin/batch">Batch Processing</AdminTab>
          <AdminTab href="/admin/scan">Card Scanner</AdminTab>
          {role === "admin" && (
            <AdminTab href="/admin/users">User Management</AdminTab>
          )}
        </nav>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}

function AdminTab({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
    >
      {children}
    </Link>
  );
}
