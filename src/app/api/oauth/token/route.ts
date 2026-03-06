import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes, createHash } from "crypto";

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = createHash("sha256").update(codeVerifier).digest();
  const computed = base64UrlEncode(hash);
  return computed === codeChallenge;
}

function generateToken(): string {
  return randomBytes(48).toString("hex");
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, string>;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries()) as Record<string, string>;
  } else {
    body = await request.json();
  }

  const { grant_type, client_id } = body;

  if (!grant_type || !client_id) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "grant_type and client_id are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Verify client exists
  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id")
    .eq("client_id", client_id)
    .single();

  if (!client) {
    return NextResponse.json(
      { error: "invalid_client" },
      { status: 401 },
    );
  }

  if (grant_type === "authorization_code") {
    return handleAuthorizationCode(admin, body);
  } else if (grant_type === "refresh_token") {
    return handleRefreshToken(admin, body);
  } else {
    return NextResponse.json(
      { error: "unsupported_grant_type" },
      { status: 400 },
    );
  }
}

async function handleAuthorizationCode(
  admin: ReturnType<typeof createAdminClient>,
  body: Record<string, string>,
) {
  const { code, code_verifier, client_id, redirect_uri } = body;

  if (!code || !code_verifier) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "code and code_verifier are required" },
      { status: 400 },
    );
  }

  // Look up code
  const { data: codeRow } = await admin
    .from("oauth_codes")
    .select("*")
    .eq("code", code)
    .single();

  if (!codeRow) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // Verify not expired
  if (new Date(codeRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Authorization code expired" },
      { status: 400 },
    );
  }

  // Verify not used
  if (codeRow.used) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Authorization code already used" },
      { status: 400 },
    );
  }

  // Verify client_id matches
  if (codeRow.client_id !== client_id) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // Verify redirect_uri matches
  if (redirect_uri && codeRow.redirect_uri !== redirect_uri) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // Verify PKCE
  if (!verifyPkce(code_verifier, codeRow.code_challenge)) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400 },
    );
  }

  // Mark code as used
  await admin.from("oauth_codes").update({ used: true }).eq("code", code);

  // Generate tokens
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await admin.from("oauth_tokens").insert([
    {
      token: accessToken,
      token_type: "access",
      client_id: codeRow.client_id,
      user_id: codeRow.user_id,
      scope: codeRow.scope,
      expires_at: accessExpiresAt.toISOString(),
    },
    {
      token: refreshToken,
      token_type: "refresh",
      client_id: codeRow.client_id,
      user_id: codeRow.user_id,
      scope: codeRow.scope,
      expires_at: refreshExpiresAt.toISOString(),
    },
  ]);

  return NextResponse.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
  });
}

async function handleRefreshToken(
  admin: ReturnType<typeof createAdminClient>,
  body: Record<string, string>,
) {
  const { refresh_token, client_id } = body;

  if (!refresh_token) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "refresh_token is required" },
      { status: 400 },
    );
  }

  // Look up refresh token
  const { data: tokenRow } = await admin
    .from("oauth_tokens")
    .select("*")
    .eq("token", refresh_token)
    .eq("token_type", "refresh")
    .single();

  if (!tokenRow) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (tokenRow.client_id !== client_id) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Refresh token expired" },
      { status: 400 },
    );
  }

  if (tokenRow.revoked_at) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Refresh token revoked" },
      { status: 400 },
    );
  }

  // Generate new access token
  const accessToken = generateToken();
  const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await admin.from("oauth_tokens").insert({
    token: accessToken,
    token_type: "access",
    client_id: tokenRow.client_id,
    user_id: tokenRow.user_id,
    scope: tokenRow.scope,
    expires_at: accessExpiresAt.toISOString(),
  });

  return NextResponse.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
  });
}
