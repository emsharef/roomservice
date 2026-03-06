import { NextResponse } from "next/server";

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002";

export async function GET() {
  return NextResponse.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
  });
}
