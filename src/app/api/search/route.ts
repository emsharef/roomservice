import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchArtworks, hybridSearchArtworks } from "@/lib/search";

export async function POST(request: NextRequest) {
  // Auth check (any authenticated user can search)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await request.json();

    // Use hybrid search when there's a text query (not image/similar)
    if (params.query && !params.imageUrl && !params.artworkId) {
      const { keywordResults, semanticResults, keywordTotal } = await hybridSearchArtworks(params);
      return NextResponse.json({ success: true, keywordResults, semanticResults, keywordTotal });
    }

    // Fall back to semantic-only for image/similar searches
    const results = await searchArtworks(params);
    return NextResponse.json({ success: true, results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
