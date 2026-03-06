import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ApiKeysManager from "./ApiKeysManager";

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const { data: keys } = await admin
    .from("mcp_api_keys")
    .select("id, key_prefix, name, user_id, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  // Attach user info
  const userIds = [...new Set((keys || []).map((k) => k.user_id))];
  let profileMap = new Map<string, { email: string; display_name: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, email, display_name")
      .in("id", userIds);
    profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  }

  const enriched = (keys || []).map((k) => ({
    id: k.id,
    key_prefix: k.key_prefix,
    name: k.name,
    user_email: profileMap.get(k.user_id)?.email ?? "Unknown",
    created_at: k.created_at,
    last_used_at: k.last_used_at,
    revoked: !!k.revoked_at,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage MCP API keys for external LLM integrations (Claude Desktop, Cursor, etc.)
          </p>
        </div>
      </div>

      <ApiKeysManager keys={enriched} />
    </div>
  );
}
