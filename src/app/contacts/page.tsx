import { fetchContacts } from "@/lib/arternal";
import ContactsTable from "./ContactsTable";

const ITEMS_PER_PAGE = 20;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10));
  const search = typeof params.search === "string" ? params.search : "";

  const offset = (page - 1) * ITEMS_PER_PAGE;
  const queryParams: Record<string, string> = {
    limit: String(ITEMS_PER_PAGE),
    offset: String(offset),
  };
  if (search) queryParams.search = search;

  let data;
  let error: string | null = null;

  try {
    data = await fetchContacts(queryParams);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch contacts";
  }

  return (
    <div>
      <ContactsTable
        contacts={data?.data ?? []}
        pagination={data?.pagination ?? null}
        currentPage={page}
        search={search}
        error={error}
      />
    </div>
  );
}
