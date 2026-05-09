import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchContactLists, createContactList } from "@/lib/arternal";

export async function GET() {
  try {
    const response = await fetchContactLists({ limit: "100", sort: "name", order: "asc" });

    const lists = response.data.filter(
      (list) => !list.live && list.name.toLowerCase() !== "selection cart"
    );

    return NextResponse.json({ success: true, data: lists });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  // Auth: must be authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role: admin or staff
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { name?: unknown; description?: unknown };

  if (typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (body.name.length > 255) {
    return NextResponse.json({ error: "name exceeds max length of 255" }, { status: 400 });
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      return NextResponse.json({ error: "description must be a string" }, { status: 400 });
    }
    if (body.description.length > 1000) {
      return NextResponse.json({ error: "description exceeds max length of 1000" }, { status: 400 });
    }
  }

  try {
    const result = await createContactList({
      name: body.name.trim(),
      description: typeof body.description === "string" ? body.description : undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
