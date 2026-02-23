import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  // 1. Auth check — must be admin
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

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse body
  const body = await request.json();
  const { email, displayName, role } = body as {
    email?: string;
    displayName?: string;
    role?: string;
  };

  if (!email) {
    return NextResponse.json(
      { error: "email is required" },
      { status: 400 }
    );
  }

  if (role && !["admin", "staff", "viewer"].includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Must be one of: admin, staff, viewer" },
      { status: 400 }
    );
  }

  // 3. Invite user via Supabase — sends an email with a link to set their password
  const { data: newUser, error: createError } =
    await admin.auth.admin.inviteUserByEmail(email);

  if (createError) {
    return NextResponse.json(
      { error: createError.message },
      { status: 500 }
    );
  }

  // 4. Update the auto-created user_profile with role and display name
  const { error: updateError } = await admin
    .from("user_profiles")
    .upsert(
      {
        id: newUser.user.id,
        email,
        display_name: displayName || null,
        role: role || "viewer",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    user: { id: newUser.user.id, email },
  });
}
