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
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-2 text-gray-500">
          You need admin or staff role to access this area.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-7xl gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/admin/sync"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Sync Dashboard
          </Link>
          {role === "admin" && (
            <Link
              href="/admin/users"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              User Management
            </Link>
          )}
        </nav>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
