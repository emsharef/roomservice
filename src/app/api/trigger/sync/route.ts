import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tasks } from "@trigger.dev/sdk/v3";

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

  const body = await request.json().catch(() => ({}));
  const { task: taskName } = body as { task?: string };

  try {
    if (taskName === "analyze") {
      const handle = await tasks.trigger("analyze-new-artworks", {});
      return NextResponse.json({ triggered: "analyze-new-artworks", id: handle.id });
    }

    // Default: trigger sync
    const handle = await tasks.trigger("scheduled-sync", {});
    return NextResponse.json({ triggered: "scheduled-sync", id: handle.id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
