import { NextResponse } from "next/server";
import { fetchContactLists } from "@/lib/arternal";

export async function GET() {
  try {
    const response = await fetchContactLists({ limit: "100", sort: "name", order: "asc" });

    const lists = response.data.filter(
      (list) => !list.live && list.name.toLowerCase() !== "selection cart"
    );

    return NextResponse.json({ success: true, data: lists });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}
