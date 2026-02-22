import { fetchInventory } from "@/lib/arternal";
import InventoryTable from "./InventoryTable";

const ITEMS_PER_PAGE = 20;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10));
  const search = typeof params.search === "string" ? params.search : "";
  const status = typeof params.status === "string" ? params.status : "";

  const offset = (page - 1) * ITEMS_PER_PAGE;
  const queryParams: Record<string, string> = {
    limit: String(ITEMS_PER_PAGE),
    offset: String(offset),
    type: "inventory",
  };
  if (search) queryParams.search = search;
  if (status) queryParams.status = status;

  let data;
  let error: string | null = null;

  try {
    data = await fetchInventory(queryParams);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch inventory";
  }

  return (
    <div>
      <InventoryTable
        items={data?.data ?? []}
        pagination={data?.pagination ?? null}
        currentPage={page}
        search={search}
        status={status}
        error={error}
      />
    </div>
  );
}
