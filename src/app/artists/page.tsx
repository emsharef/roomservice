import { createClient } from "@/lib/supabase/server";
import ArtistsList from "./ArtistsList";

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10));
  const search = typeof params.search === "string" ? params.search : "";
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const supabase = await createClient();

  let query = supabase
    .from("artists")
    .select("id, display_name, first_name, last_name, country, work_count, bio, life_dates", { count: "exact" })
    .order("display_name", { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.or(
      `display_name.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    );
  }

  const { data: artists, count, error } = await query;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Artists</h1>
      <ArtistsList
        artists={artists ?? []}
        totalCount={count ?? 0}
        currentPage={page}
        search={search}
        error={error?.message ?? null}
      />
    </div>
  );
}
