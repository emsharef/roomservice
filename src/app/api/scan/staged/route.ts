import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
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

  // Fetch all staged contacts (exclude source_images for performance)
  const { data, error } = await admin
    .from("staged_contacts")
    .select(
      "id, first_name, last_name, display_name, email, phone, phone_mobile, type, website, company, primary_street, primary_city, primary_state, primary_zip, primary_country, tags, notes, ocr_confidence, duplicate_candidates, status, arternal_contact_id, error_message, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ staged_contacts: data });
}
