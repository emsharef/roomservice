import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseProspectList } from "@/lib/prospects";

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role check (staff or admin)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { text, images, mediaType } = await request.json();

  // Validate: must have either text or images
  if (!text && (!images || !Array.isArray(images) || images.length === 0)) {
    return NextResponse.json(
      { error: "Provide either text or images" },
      { status: 400 },
    );
  }

  try {
    const parsed = await parseProspectList({ text, images, mediaType });
    return NextResponse.json({ success: true, parsed });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
