import { createClient } from "@/lib/supabase/server";
import ArtistsList from "./ArtistsList";

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const filterName = typeof params.filter_name === "string" ? params.filter_name : null;
  const filterCountry = typeof params.filter_country === "string" ? params.filter_country : null;
  const filterLifeDates = typeof params.filter_life_dates === "string" ? params.filter_life_dates : null;
  const sort = typeof params.sort === "string" ? params.sort : "display_name";
  const order = typeof params.order === "string" ? params.order : "asc";

  const supabase = await createClient();

  const { data: artists, error } = await supabase.rpc("search_artists", {
    filter_name: filterName,
    filter_country: filterCountry,
    filter_life_dates: filterLifeDates,
    sort_column: sort,
    sort_direction: order,
    page_size: pageSize,
    page_offset: offset,
  });

  const totalCount = artists && artists.length > 0 ? (artists[0] as { total_count: number }).total_count : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Artists</h1>
        <p className="mt-1 text-sm text-gray-500">Browse synced artist profiles and biographies.</p>
      </div>
      <ArtistsList
        artists={artists ?? []}
        totalCount={totalCount}
        currentPage={page}
        filters={{
          name: filterName ?? "",
          country: filterCountry ?? "",
          life_dates: filterLifeDates ?? "",
        }}
        sort={sort}
        order={order}
        error={error?.message ?? null}
      />
    </div>
  );
}
