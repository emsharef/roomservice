import { createClient } from "@/lib/supabase/server";
import InventoryList from "./InventoryList";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10));
  const search = typeof params.search === "string" ? params.search : "";
  const status = typeof params.status === "string" ? params.status : "";
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const supabase = await createClient();

  let query = supabase
    .from("artworks")
    .select("id, title, catalog_number, year, medium, price, price_currency, status, primary_image_url, artwork_artists(artist_id, display_name)", { count: "exact" })
    .order("arternal_updated_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.or(`title.ilike.%${search}%,catalog_number.ilike.%${search}%`);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data: items, count, error } = await query;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Inventory</h1>
      <InventoryList
        items={items ?? []}
        totalCount={count ?? 0}
        currentPage={page}
        search={search}
        status={status}
        error={error?.message ?? null}
      />
    </div>
  );
}
