import { createClient } from "@/lib/supabase/server";
import InventoryList from "./InventoryList";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  // Read filter/sort URL params
  const filterTitle = typeof params.filter_title === "string" ? params.filter_title : null;
  const filterArtist = typeof params.filter_artist === "string" ? params.filter_artist : null;
  const filterMedium = typeof params.filter_medium === "string" ? params.filter_medium : null;
  const filterYear = typeof params.filter_year === "string" ? params.filter_year : null;
  const filterStatus = typeof params.filter_status === "string" ? params.filter_status : null;
  const sort = typeof params.sort === "string" ? params.sort : "arternal_updated_at";
  const order = typeof params.order === "string" ? params.order : "desc";

  const supabase = await createClient();

  const { data: items, error } = await supabase.rpc("search_inventory", {
    filter_title: filterTitle,
    filter_artist: filterArtist,
    filter_catalog: null,
    filter_medium: filterMedium,
    filter_year: filterYear,
    filter_status: filterStatus,
    sort_column: sort,
    sort_direction: order,
    page_size: pageSize,
    page_offset: offset,
  });

  const totalCount = items && items.length > 0 ? (items[0] as { total_count: number }).total_count : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Inventory</h1>
        <p className="mt-1 text-sm text-gray-500">Browse and search synced artworks.</p>
      </div>
      <InventoryList
        items={items ?? []}
        totalCount={totalCount}
        currentPage={page}
        filters={{
          title: filterTitle ?? "",
          artist: filterArtist ?? "",
          medium: filterMedium ?? "",
          year: filterYear ?? "",
          status: filterStatus ?? "",
        }}
        sort={sort}
        order={order}
        error={error?.message ?? null}
      />
    </div>
  );
}
