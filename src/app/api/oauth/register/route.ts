import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    client_name,
    redirect_uris,
    grant_types,
    token_endpoint_auth_method,
  } = body;

  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "redirect_uris is required" },
      { status: 400 },
    );
  }

  const clientId = randomUUID();

  const admin = createAdminClient();
  const { error } = await admin.from("oauth_clients").insert({
    client_id: clientId,
    client_name: client_name || null,
    redirect_uris,
    grant_types: grant_types || ["authorization_code"],
    token_endpoint_auth_method: token_endpoint_auth_method || "none",
  });

  if (error) {
    return NextResponse.json(
      { error: "server_error", error_description: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: client_name || null,
      redirect_uris,
      grant_types: grant_types || ["authorization_code"],
      token_endpoint_auth_method: token_endpoint_auth_method || "none",
    },
    { status: 201 },
  );
}
