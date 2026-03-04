import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — load conversation messages
export async function GET(
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

  // Verify ownership
  const { data: conversation } = await admin
    .from("chat_conversations")
    .select("*")
    .eq("id", id)
    .eq("created_by", user.id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch messages
  const { data: messages, error } = await admin
    .from("chat_messages")
    .select("id, role, content, tool_data, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation, messages: messages || [] });
}

// DELETE — delete conversation and messages (cascade)
export async function DELETE(
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

  // Verify ownership
  const { data: conversation } = await admin
    .from("chat_conversations")
    .select("id")
    .eq("id", id)
    .eq("created_by", user.id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Messages cascade-deleted via FK constraint
  await admin.from("chat_conversations").delete().eq("id", id);

  return NextResponse.json({ success: true });
}
