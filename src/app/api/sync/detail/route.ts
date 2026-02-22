import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchInventoryItem,
  fetchArtist,
  fetchContact,
} from "@/lib/arternal";

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { entity, id } = body as { entity?: string; id?: number };

  if (!entity || !["artworks", "artists", "contacts"].includes(entity)) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    if (entity === "artworks") {
      const result = await fetchInventoryItem(String(id));
      const detail = result.data;
      const { error } = await admin
        .from("artworks")
        .update({
          images: detail.images ?? [],
          detail_synced_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    } else if (entity === "artists") {
      const result = await fetchArtist(String(id));
      const detail = result.data;
      const { error } = await admin
        .from("artists")
        .update({
          statistics: detail.statistics ?? null,
          detail_synced_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    } else {
      const result = await fetchContact(String(id));
      const detail = result.data;
      const { error } = await admin
        .from("contacts")
        .update({
          tags: detail.tags ?? [],
          notes: detail.notes ?? [],
          recent_transactions: detail.recent_transactions ?? [],
          recent_activities: detail.recent_activities ?? [],
          detail_synced_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
