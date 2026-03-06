import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Auth: API key or OAuth token
// ---------------------------------------------------------------------------

async function validateAuth(
  request: NextRequest,
): Promise<{ valid: boolean; error?: string }> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing Authorization: Bearer <token>" };
  }

  const token = authHeader.slice(7);

  // API key auth (rs_live_ prefix)
  if (token.startsWith("rs_live_")) {
    return validateApiKey(token);
  }

  // OAuth token auth
  return validateOAuthToken(token);
}

async function validateApiKey(
  rawKey: string,
): Promise<{ valid: boolean; error?: string }> {
  const prefix = rawKey.slice(0, 16);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const admin = createAdminClient();
  const { data: keyRow } = await admin
    .from("mcp_api_keys")
    .select("id, key_hash, revoked_at")
    .eq("key_prefix", prefix)
    .single();

  if (!keyRow || keyRow.key_hash !== keyHash) {
    return { valid: false, error: "Invalid API key" };
  }

  if (keyRow.revoked_at) {
    return { valid: false, error: "API key has been revoked" };
  }

  // Update last_used_at (fire and forget)
  admin
    .from("mcp_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id)
    .then(() => {});

  return { valid: true };
}

async function validateOAuthToken(
  token: string,
): Promise<{ valid: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: tokenRow } = await admin
    .from("oauth_tokens")
    .select("token_type, expires_at, revoked_at")
    .eq("token", token)
    .eq("token_type", "access")
    .single();

  if (!tokenRow) {
    return { valid: false, error: "Invalid token" };
  }

  if (tokenRow.revoked_at) {
    return { valid: false, error: "Token has been revoked" };
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return { valid: false, error: "Token has expired" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// MCP Streamable HTTP handlers
// ---------------------------------------------------------------------------

async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const auth = await validateAuth(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create fresh server + transport per request (stateless)
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  await server.connect(transport);

  const response = await transport.handleRequest(request);
  return response;
}

export async function POST(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function GET(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleMcpRequest(request);
}
