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

export function validateContactUpdate(payload: ContactUpdateRequest): string | null {
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

export type UpdateContactResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Update a contact in Arternal, then refetch and write the canonical state to Supabase.
 * Validates the payload first; returns a structured result for callers to translate to HTTP/tool responses.
 */
export async function updateContactAndSync(
  id: string,
  payload: ContactUpdateRequest,
): Promise<UpdateContactResult> {
  const validationError = validateContactUpdate(payload);
  if (validationError) {
    return { ok: false, status: 400, error: validationError };
  }

  try {
    await updateContact(id, payload);
  } catch (e) {
    return { ok: false, status: 502, error: String(e) };
  }

  const admin = createAdminClient();
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
      return {
        ok: false,
        status: 500,
        error: `Arternal updated but local DB failed: ${dbError.message}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: `Arternal updated but re-fetch failed: ${String(e)}`,
    };
  }
}
