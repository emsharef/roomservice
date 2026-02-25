import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanBusinessCard } from "@/lib/vision";

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

  const { images, mediaType } = await request.json();

  // Validate: 1-2 images
  if (!images || !Array.isArray(images) || images.length < 1 || images.length > 2) {
    return NextResponse.json(
      { error: "Provide 1-2 base64 image strings" },
      { status: 400 },
    );
  }

  // Validate each image size (< 10MB base64 ≈ ~7.5MB raw)
  for (const img of images) {
    if (typeof img !== "string" || img.length > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Each image must be a base64 string under 10MB" },
        { status: 400 },
      );
    }
  }

  try {
    // OCR via Claude Vision
    const cardData = await scanBusinessCard(images, mediaType || "image/jpeg");

    // Build display_name
    const displayName = [cardData.first_name, cardData.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";

    // Duplicate detection: check contacts table by name and email
    const duplicateCandidates: Array<{
      id: number;
      display_name: string;
      email: string | null;
      company: string | null;
      match_reason: string;
      score: number;
    }> = [];

    // Search by email (exact match, highest score)
    if (cardData.email) {
      const { data: emailMatches } = await admin
        .from("contacts")
        .select("id, display_name, email, company")
        .ilike("email", cardData.email)
        .limit(5);

      if (emailMatches) {
        for (const m of emailMatches) {
          duplicateCandidates.push({
            id: m.id,
            display_name: m.display_name,
            email: m.email,
            company: m.company,
            match_reason: "email match",
            score: 0.9,
          });
        }
      }
    }

    // Search by name (ILIKE)
    if (cardData.first_name && cardData.last_name) {
      const { data: nameMatches } = await admin
        .from("contacts")
        .select("id, display_name, email, company")
        .ilike("first_name", cardData.first_name)
        .ilike("last_name", cardData.last_name)
        .limit(5);

      if (nameMatches) {
        const existingIds = new Set(duplicateCandidates.map((d) => d.id));
        for (const m of nameMatches) {
          if (!existingIds.has(m.id)) {
            duplicateCandidates.push({
              id: m.id,
              display_name: m.display_name,
              email: m.email,
              company: m.company,
              match_reason: "name match",
              score: 0.8,
            });
          }
        }
      }
    }

    // Partial name search (display_name ILIKE)
    if (cardData.last_name) {
      const { data: partialMatches } = await admin
        .from("contacts")
        .select("id, display_name, email, company")
        .ilike("display_name", `%${cardData.last_name}%`)
        .limit(5);

      if (partialMatches) {
        const existingIds = new Set(duplicateCandidates.map((d) => d.id));
        for (const m of partialMatches) {
          if (!existingIds.has(m.id)) {
            duplicateCandidates.push({
              id: m.id,
              display_name: m.display_name,
              email: m.email,
              company: m.company,
              match_reason: "partial name match",
              score: 0.5,
            });
          }
        }
      }
    }

    // Sort by score descending, keep top 5
    duplicateCandidates.sort((a, b) => b.score - a.score);
    const topDuplicates = duplicateCandidates.slice(0, 5);

    // Insert into staged_contacts
    const { data: staged, error: insertError } = await admin
      .from("staged_contacts")
      .insert({
        first_name: cardData.first_name,
        last_name: cardData.last_name,
        display_name: displayName,
        email: cardData.email,
        phone: cardData.phone,
        phone_mobile: cardData.phone_mobile,
        type: cardData.title, // job title → type field
        website: cardData.website,
        company: cardData.company,
        primary_street: cardData.street,
        primary_city: cardData.city,
        primary_state: cardData.state,
        primary_zip: cardData.zip,
        primary_country: cardData.country,
        source_images: images,
        ocr_raw_response: cardData,
        ocr_confidence: cardData.confidence,
        duplicate_candidates: topDuplicates,
        status: "draft",
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ success: true, staged_contact: staged });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
