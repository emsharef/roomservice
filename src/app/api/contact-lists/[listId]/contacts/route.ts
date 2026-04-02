import { NextRequest, NextResponse } from "next/server";
import { fetchContactListMembers } from "@/lib/arternal";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;

  try {
    const contactIds: string[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await fetchContactListMembers(listId, {
        limit: "100",
        offset: String(offset),
      });
      contactIds.push(...response.data.map((c) => c.id));
      hasMore = response.pagination.has_more;
      offset += 100;
    }

    return NextResponse.json({ success: true, data: contactIds });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}
