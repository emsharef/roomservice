import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateContact, fetchContact, type ContactUpdateRequest } from "@/lib/arternal";

const STRING_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "website",
  "company",
  "primary_street",
  "primary_city",
  "primary_state",
  "primary_zip",
  "primary_country",
] as const;

const MAX_LENGTHS: Record<string, number> = {
  first_name: 100,
  last_name: 100,
  phone: 50,
  company: 255,
  primary_street: 255,
  primary_city: 100,
  primary_state: 100,
  primary_zip: 20,
  primary_country: 100,
};

const VALID_TYPES = ["person", "institution", "venue"] as const;

function validate(payload: ContactUpdateRequest): string | null {
  for (const field of STRING_FIELDS) {
    const val = payload[field];
    if (val === undefined) continue;
    if (val !== null && typeof val !== "string") {
      return `${field} must be a string or null`;
    }
    const max = MAX_LENGTHS[field];
    if (max && typeof val === "string" && val.length > max) {
      return `${field} exceeds max length of ${max}`;
    }
  }

  if (payload.email !== undefined && payload.email !== null && payload.email !== "") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      return "email is not a valid email address";
    }
  }

  if (payload.type !== undefined && payload.type !== null) {
    if (!VALID_TYPES.includes(payload.type as (typeof VALID_TYPES)[number])) {
      return `type must be one of: ${VALID_TYPES.join(", ")}`;
    }
  }

  if (payload.tags !== undefined) {
    if (!Array.isArray(payload.tags) || !payload.tags.every((t) => typeof t === "string")) {
      return "tags must be an array of strings";
    }
  }

  if (payload.roles !== undefined) {
    if (!Array.isArray(payload.roles) || !payload.roles.every((r) => typeof r === "string")) {
      return "roles must be an array of strings";
    }
  }

  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const payload = (await request.json()) as ContactUpdateRequest;
  const validationError = validate(payload);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Send to Arternal
  try {
    await updateContact(id, payload);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  // Re-fetch from Arternal to get the canonical state, then update Supabase
  try {
    const fresh = await fetchContact(id);
    const c = fresh.data;
    const { error: dbError } = await admin
      .from("contacts")
      .update({
        first_name: c.first_name,
        last_name: c.last_name,
        display_name: c.display_name,
        email: c.email,
        phone: c.phone,
        phone_mobile: c.phone_mobile,
        type: c.type,
        website: c.website,
        company: c.company,
        primary_street: c.primary_address?.street ?? null,
        primary_city: c.primary_address?.city ?? null,
        primary_state: c.primary_address?.state ?? null,
        primary_zip: c.primary_address?.zip ?? null,
        primary_country: c.primary_address?.country ?? null,
        primary_address_formatted: c.primary_address?.formatted ?? null,
        tags: c.tags ?? [],
        roles: c.roles ?? [],
        synced_at: new Date().toISOString(),
        detail_synced_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (dbError) {
      return NextResponse.json(
        { error: `Arternal updated but local DB failed: ${dbError.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: `Arternal updated but re-fetch failed: ${String(e)}` },
      { status: 500 },
    );
  }
}
