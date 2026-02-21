import { fetchContact } from "@/lib/arternal";
import Link from "next/link";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let contact;
  let error: string | null = null;

  try {
    const res = await fetchContact(id);
    contact = res.data;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch contact";
  }

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
          {error || "Contact not found"}
        </div>
      </div>
    );
  }

  const details = [
    { label: "ID", value: String(contact.id) },
    { label: "First Name", value: contact.first_name },
    { label: "Last Name", value: contact.last_name },
    { label: "Display Name", value: contact.display_name },
    { label: "Email", value: contact.email },
    { label: "Phone", value: contact.phone },
    { label: "Phone (Mobile)", value: contact.phone_mobile },
    { label: "Type", value: contact.type },
    { label: "Website", value: contact.website },
    { label: "Company", value: contact.company || null },
  ];

  const addressDetails = [
    { label: "Street", value: contact.primary_street },
    { label: "City", value: contact.primary_city },
    { label: "State", value: contact.primary_state },
    { label: "ZIP", value: contact.primary_zip },
    { label: "Country", value: contact.primary_country },
    { label: "Formatted Address", value: contact.primary_address?.formatted },
  ];

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(num);
  };

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
                {d.label === "Email" && d.value ? (
                  <a href={`mailto:${d.value}`} className="hover:underline text-blue-600">
                    {d.value}
                  </a>
                ) : d.label === "Website" && d.value ? (
                  <a
                    href={d.value.startsWith("http") ? d.value : `https://${d.value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-blue-600"
                  >
                    {d.value}
                  </a>
                ) : (
                  d.value || <span className="text-gray-400 italic">—</span>
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
            <div key={d.label} className={d.label === "Formatted Address" ? "sm:col-span-2" : ""}>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {d.label}
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {d.value || <span className="text-gray-400 italic">—</span>}
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
        {contact.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {contact.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">—</p>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Notes
        </h2>
        {contact.notes.length > 0 ? (
          <ul className="space-y-2">
            {contact.notes.map((note, i) => (
              <li key={i} className="text-sm text-gray-900">{note}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 italic">—</p>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Recent Transactions
        </h2>
        {contact.recent_transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contact.recent_transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{tx.title}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{tx.status}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right font-medium">{formatPrice(tx.total_price)}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{new Date(tx.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">—</p>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Recent Activity
        </h2>
        {contact.recent_activities.length > 0 ? (
          <ul className="space-y-3">
            {contact.recent_activities.map((activity, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 shrink-0">
                  {activity.type}
                </span>
                <span className="text-gray-900 flex-1">
                  {activity.text || <span className="text-gray-400 italic">—</span>}
                </span>
                <span className="text-gray-500 text-xs shrink-0">
                  {new Date(activity.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 italic">—</p>
        )}
      </div>
    </div>
  );
}
