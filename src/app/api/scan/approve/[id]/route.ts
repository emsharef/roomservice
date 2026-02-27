import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createContact } from "@/lib/arternal";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  // Fetch staged contact
  const { data: staged, error: fetchError } = await admin
    .from("staged_contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !staged) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["draft", "error"].includes(staged.status)) {
    return NextResponse.json(
      { error: "Can only approve draft or errored contacts" },
      { status: 400 },
    );
  }

  // Mark as approved (in progress)
  await admin
    .from("staged_contacts")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    // Map fields to Arternal format
    const contactData: Record<string, unknown> = {
      first_name: staged.first_name,
      last_name: staged.last_name,
      email: staged.email,
      phone: staged.phone,
      phone_mobile: staged.phone_mobile,
      website: staged.website,
      company: staged.company,
      primary_street: staged.primary_street,
      primary_city: staged.primary_city,
      primary_state: staged.primary_state,
      primary_zip: staged.primary_zip,
      primary_country: staged.primary_country,
    };

    // Include tags and notes if present
    if (staged.tags && staged.tags.length > 0) {
      contactData.tags = staged.tags;
    }
    const notes = [...(staged.notes || [])];
    if (staged.type) {
      notes.unshift(`Role: ${staged.type}`);
    }
    if (notes.length > 0) {
      contactData.notes = notes;
    }

    // Remove null/undefined values
    for (const key of Object.keys(contactData)) {
      if (contactData[key] == null) {
        delete contactData[key];
      }
    }

    // Create contact in Arternal
    const arternaResult = await createContact(
      contactData as Parameters<typeof createContact>[0],
    );
    const arternaContactId = arternaResult.data.id;

    // Upsert into local contacts table (mirror)
    const displayName = [staged.first_name, staged.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";

    await admin.from("contacts").upsert(
      {
        id: arternaContactId,
        first_name: staged.first_name,
        last_name: staged.last_name,
        display_name: displayName,
        email: staged.email,
        phone: staged.phone,
        phone_mobile: staged.phone_mobile,
        type: staged.type,
        website: staged.website,
        company: staged.company,
        primary_street: staged.primary_street,
        primary_city: staged.primary_city,
        primary_state: staged.primary_state,
        primary_zip: staged.primary_zip,
        primary_country: staged.primary_country,
        tags: staged.tags || [],
        notes: staged.notes || [],
        synced_at: new Date().toISOString(),
        detail_synced_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    // Upsert contacts_extended row
    await admin.from("contacts_extended").upsert(
      {
        contact_id: arternaContactId,
        enrichment_status: "pending",
      },
      { onConflict: "contact_id" },
    );

    // Update staged contact: written
    await admin
      .from("staged_contacts")
      .update({
        status: "written",
        arternal_contact_id: arternaContactId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      arternal_contact_id: arternaContactId,
    });
  } catch (e) {
    // Set error status
    await admin
      .from("staged_contacts")
      .update({
        status: "error",
        error_message: String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
