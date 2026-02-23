import { createClient } from "@/lib/supabase/server";
import ContactsList from "./ContactsList";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const filterName = typeof params.filter_name === "string" ? params.filter_name : null;
  const filterEmail = typeof params.filter_email === "string" ? params.filter_email : null;
  const filterCompany = typeof params.filter_company === "string" ? params.filter_company : null;
  const filterLocation = typeof params.filter_location === "string" ? params.filter_location : null;
  const filterType = typeof params.filter_type === "string" ? params.filter_type : null;
  const sort = typeof params.sort === "string" ? params.sort : "display_name";
  const order = typeof params.order === "string" ? params.order : "asc";

  const supabase = await createClient();

  const { data: contacts, error } = await supabase.rpc("search_contacts", {
    filter_name: filterName,
    filter_email: filterEmail,
    filter_company: filterCompany,
    filter_location: filterLocation,
    filter_type: filterType,
    sort_column: sort,
    sort_direction: order,
    page_size: pageSize,
    page_offset: offset,
  });

  const totalCount = contacts && contacts.length > 0 ? (contacts[0] as { total_count: number }).total_count : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Contacts</h1>
        <p className="mt-1 text-sm text-gray-500">Manage collectors, galleries, and other contacts.</p>
      </div>
      <ContactsList
        contacts={contacts ?? []}
        totalCount={totalCount}
        currentPage={page}
        filters={{
          name: filterName ?? "",
          email: filterEmail ?? "",
          company: filterCompany ?? "",
          location: filterLocation ?? "",
          type: filterType ?? "",
        }}
        sort={sort}
        order={order}
        error={error?.message ?? null}
      />
    </div>
  );
}
