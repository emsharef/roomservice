import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes, createHash } from "crypto";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized", status: 401, user: null };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return { error: "Forbidden", status: 403, user: null };
  }

  return { error: null, status: 200, user };
}

/** GET — List all API keys */
export async function GET() {
  const auth = await verifyAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data: keys, error } = await admin
    .from("mcp_api_keys")
    .select("id, key_prefix, name, user_id, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach user emails
  const userIds = [...new Set((keys || []).map((k) => k.user_id))];
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, email, display_name")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles || []).map((p) => [p.id, p]),
  );

  const enriched = (keys || []).map((k) => ({
    ...k,
    user_email: profileMap.get(k.user_id)?.email ?? null,
    user_name: profileMap.get(k.user_id)?.display_name ?? null,
  }));

  return NextResponse.json({ keys: enriched });
}

/** POST — Create a new API key */
export async function POST(request: NextRequest) {
  const auth = await verifyAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { name } = await request.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  // Generate key: rs_live_<32 random hex chars>
  const random = randomBytes(16).toString("hex");
  const rawKey = `rs_live_${random}`;
  const prefix = rawKey.slice(0, 16);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mcp_api_keys")
    .insert({
      user_id: auth.user!.id,
      key_hash: keyHash,
      key_prefix: prefix,
      name,
    })
    .select("id, key_prefix, name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return the raw key ONCE — it will never be retrievable again
  return NextResponse.json({ key: rawKey, ...data });
}

/** DELETE — Revoke an API key */
export async function DELETE(request: NextRequest) {
  const auth = await verifyAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { keyId } = await request.json();
  if (!keyId || typeof keyId !== "string") {
    return NextResponse.json(
      { error: "keyId is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("mcp_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .is("revoked_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
