import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncArtworks, syncArtists, syncContacts } from "@/lib/sync";

export async function POST(request: NextRequest) {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Role check (staff or admin)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse entity type
  const body = await request.json();
  const { entity } = body as { entity?: string };

  if (!entity || !["artworks", "artists", "contacts"].includes(entity)) {
    return NextResponse.json(
      { error: "Invalid entity type. Must be one of: artworks, artists, contacts" },
      { status: 400 },
    );
  }

  // 4. Log sync start
  const { data: logEntry } = await admin
    .from("sync_log")
    .insert({
      entity_type: entity,
      direction: "pull",
      triggered_by: user.id,
    })
    .select()
    .single();

  // 5. Run sync
  try {
    let result;
    switch (entity) {
      case "artworks":
        result = await syncArtworks();
        break;
      case "artists":
        result = await syncArtists();
        break;
      case "contacts":
        result = await syncContacts();
        break;
    }

    // 6. Update sync log on success
    if (logEntry) {
      await admin
        .from("sync_log")
        .update({
          status: "completed",
          records_processed: result!.processed,
          records_created: result!.created,
          records_updated: result!.updated,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return NextResponse.json({ success: true, result });
  } catch (e) {
    // Update sync log on error
    if (logEntry) {
      await admin
        .from("sync_log")
        .update({
          status: "error",
          error: String(e),
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
