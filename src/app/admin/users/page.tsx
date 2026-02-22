import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import UserManagement from "./UserManagement";

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
}

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // Verify the current user is an admin (not just staff)
  const { data: currentProfile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (currentProfile?.role !== "admin") {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-2 text-gray-500">
          Only admins can manage users.
        </p>
      </div>
    );
  }

  // Fetch all user profiles
  const { data: users } = await admin
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <UserManagement
      users={(users as UserProfile[]) ?? []}
      currentUserId={user!.id}
    />
  );
}
