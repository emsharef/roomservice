import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contactId = parseInt(id, 10);

  const supabase = await createClient();

  const [contactResult, extendedResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single(),
    supabase
      .from("contacts_extended")
      .select("collector_brief, inferred_preferences, enrichment_status")
      .eq("contact_id", contactId)
      .single(),
  ]);

  const { data: contact, error } = contactResult;
  const extended = extendedResult.data;

  if (error || !contact) {
    return (
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to contacts
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error?.message || "Contact not found"}
        </div>
      </div>
    );
  }

  const details = [
    { label: "ID", value: String(contact.id) },
    { label: "First Name", value: contact.first_name },
    { label: "Last Name", value: contact.last_name },
    { label: "Display Name", value: contact.display_name },
    { label: "Email", value: contact.email, isEmail: true },
    { label: "Phone", value: contact.phone },
    { label: "Phone (Mobile)", value: contact.phone_mobile },
    { label: "Type", value: contact.type },
    { label: "Website", value: contact.website, isLink: true },
    { label: "Company", value: contact.company },
  ];

  const addressDetails = [
    { label: "Street", value: contact.primary_street },
    { label: "City", value: contact.primary_city },
    { label: "State", value: contact.primary_state },
    { label: "ZIP", value: contact.primary_zip },
    { label: "Country", value: contact.primary_country },
    { label: "Formatted Address", value: contact.primary_address_formatted, wide: true },
  ];

  const tags: string[] = contact.tags ?? [];
  const notes: string[] = contact.notes ?? [];
  const recentTransactions: { id: number; title: string; status: string; total_price: string; created_at: string }[] = contact.recent_transactions ?? [];
  const recentActivities: { type: string; text: string | null; created_at: string }[] = contact.recent_activities ?? [];

  return (
    <div>
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to contacts
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 mb-6">{contact.display_name}</h1>

      {/* Contact Details */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Contact Information
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {d.label}
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {d.isEmail && d.value ? (
                  <a href={`mailto:${d.value}`} className="hover:underline text-blue-600">
                    {d.value}
                  </a>
                ) : d.isLink && d.value ? (
                  <a
                    href={d.value.startsWith("http") ? d.value : `https://${d.value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-blue-600"
                  >
                    {d.value}
                  </a>
                ) : (
                  d.value || <span className="text-gray-400 italic">{"\u2014"}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Address */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Primary Address
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {addressDetails.map((d) => (
            <div key={d.label} className={d.wide ? "sm:col-span-2" : ""}>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {d.label}
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {d.value || <span className="text-gray-400 italic">{"\u2014"}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Tags */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Tags
        </h2>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">{"\u2014"}</p>
        )}
      </div>

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Recent Transactions
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-3 py-2 text-sm text-gray-900">{tx.title}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{tx.status}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 text-right">
                      {tx.total_price ? `$${(Number(tx.total_price) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activities */}
      {recentActivities.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Recent Activities
          </h2>
          <ul className="space-y-3">
            {recentActivities.map((act, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 shrink-0">
                  {act.type}
                </span>
                <span className="text-sm text-gray-700 flex-1">
                  {act.text || <span className="text-gray-400 italic">{"\u2014"}</span>}
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(act.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes */}
      {notes.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Notes
          </h2>
          <ul className="space-y-2">
            {notes.map((note, i) => (
              <li key={i} className="text-sm text-gray-700 bg-gray-50 rounded p-3">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Enrichment from contacts_extended */}
      {extended && (extended.collector_brief || extended.inferred_preferences) && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            AI Enrichment
          </h2>

          {extended.collector_brief && typeof extended.collector_brief === "object" && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Collector Brief
              </h3>
              <pre className="text-sm text-gray-700 bg-gray-50 rounded p-3 overflow-x-auto">
                {JSON.stringify(extended.collector_brief, null, 2)}
              </pre>
            </div>
          )}

          {extended.inferred_preferences && typeof extended.inferred_preferences === "object" && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Inferred Preferences
              </h3>
              <pre className="text-sm text-gray-700 bg-gray-50 rounded p-3 overflow-x-auto">
                {JSON.stringify(extended.inferred_preferences, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
