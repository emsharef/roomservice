import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ProspectInput {
  name: string;
  company?: string;
  title?: string;
  context?: string;
}

interface CreateBatchBody {
  name: string;
  sourceType: "text" | "image";
  sourceContent?: string;
  sourceImages?: string[];
  prospects: ProspectInput[];
}

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

  // Parse and validate body
  const body: CreateBatchBody = await request.json();

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  if (!body.prospects || !Array.isArray(body.prospects) || body.prospects.length === 0) {
    return NextResponse.json(
      { error: "prospects array is required and must not be empty" },
      { status: 400 },
    );
  }

  // Validate sourceType
  if (!["text", "image"].includes(body.sourceType)) {
    return NextResponse.json(
      { error: "sourceType must be 'text' or 'image'" },
      { status: 400 },
    );
  }

  try {
    // Insert batch
    const { data: batch, error: batchError } = await admin
      .from("prospect_batches")
      .insert({
        name: body.name.trim(),
        source_type: body.sourceType,
        source_content: body.sourceContent || null,
        source_images: body.sourceImages || [],
        prospect_count: body.prospects.length,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        { error: batchError?.message || "Failed to create batch" },
        { status: 500 },
      );
    }

    // Insert prospects
    const prospectRows = body.prospects.map((p) => ({
      batch_id: batch.id,
      input_name: p.name,
      display_name: p.name,
      company: p.company || null,
      title: p.title || null,
      status: "parsed",
      created_by: user.id,
    }));

    const { error: prospectsError } = await admin
      .from("prospects")
      .insert(prospectRows);

    if (prospectsError) {
      return NextResponse.json(
        { error: prospectsError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      count: body.prospects.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

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

  try {
    // Fetch all batches
    const { data: batches, error: batchError } = await admin
      .from("prospect_batches")
      .select("id, name, source_type, prospect_count, created_at")
      .order("created_at", { ascending: false });

    if (batchError) {
      return NextResponse.json(
        { error: batchError.message },
        { status: 500 },
      );
    }

    if (!batches || batches.length === 0) {
      return NextResponse.json({ batches: [] });
    }

    // Fetch all prospects (just id, batch_id, status) to compute summaries
    const { data: prospects, error: prospectsError } = await admin
      .from("prospects")
      .select("id, batch_id, status");

    if (prospectsError) {
      return NextResponse.json(
        { error: prospectsError.message },
        { status: 500 },
      );
    }

    // Build status summary per batch
    const summaryMap: Record<string, Record<string, number>> = {};
    for (const p of prospects || []) {
      if (!summaryMap[p.batch_id]) {
        summaryMap[p.batch_id] = {};
      }
      summaryMap[p.batch_id][p.status] = (summaryMap[p.batch_id][p.status] || 0) + 1;
    }

    const result = batches.map((b) => ({
      ...b,
      statusSummary: summaryMap[b.id] || {},
    }));

    return NextResponse.json({ batches: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
