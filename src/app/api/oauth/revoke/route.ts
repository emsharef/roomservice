import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, string>;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries()) as Record<string, string>;
  } else {
    body = await request.json();
  }

  const { token } = body;

  if (!token) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  await admin
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token)
    .is("revoked_at", null);

  // Per RFC 7009, always return 200 regardless
  return new Response(null, { status: 200 });
}
