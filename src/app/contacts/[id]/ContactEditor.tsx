"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ContactData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  phone_mobile: string | null;
  type: string | null;
  website: string | null;
  company: string | null;
  primary_street: string | null;
  primary_city: string | null;
  primary_state: string | null;
  primary_zip: string | null;
  primary_country: string | null;
  primary_address_formatted: string | null;
  tags: string[];
  roles: string[];
}

type EditableField =
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "website"
  | "company"
  | "type"
  | "primary_street"
  | "primary_city"
  | "primary_state"
  | "primary_zip"
  | "primary_country";

const TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "person", label: "Person" },
  { value: "institution", label: "Institution" },
  { value: "venue", label: "Venue" },
];

export default function ContactEditor({ contact }: { contact: ContactData }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — only used in edit mode
  const [form, setForm] = useState<Record<EditableField, string>>({
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    website: contact.website ?? "",
    company: contact.company ?? "",
    type: contact.type ?? "",
    primary_street: contact.primary_street ?? "",
    primary_city: contact.primary_city ?? "",
    primary_state: contact.primary_state ?? "",
    primary_zip: contact.primary_zip ?? "",
    primary_country: contact.primary_country ?? "",
  });

  // Tags/roles staged for adding (additive only — API can't remove)
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [roleInput, setRoleInput] = useState("");

  function startEditing() {
    setForm({
      first_name: contact.first_name ?? "",
      last_name: contact.last_name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      website: contact.website ?? "",
      company: contact.company ?? "",
      type: contact.type ?? "",
      primary_street: contact.primary_street ?? "",
      primary_city: contact.primary_city ?? "",
      primary_state: contact.primary_state ?? "",
      primary_zip: contact.primary_zip ?? "",
      primary_country: contact.primary_country ?? "",
    });
    setNewTags([]);
    setNewRoles([]);
    setTagInput("");
    setRoleInput("");
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setError(null);
  }

  function addStagedTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (contact.tags.includes(t) || newTags.includes(t)) {
      setTagInput("");
      return;
    }
    setNewTags([...newTags, t]);
    setTagInput("");
  }

  function removeStagedTag(t: string) {
    setNewTags(newTags.filter((x) => x !== t));
  }

  function addStagedRole() {
    const r = roleInput.trim();
    if (!r) return;
    if (contact.roles.includes(r) || newRoles.includes(r)) {
      setRoleInput("");
      return;
    }
    setNewRoles([...newRoles, r]);
    setRoleInput("");
  }

  function removeStagedRole(r: string) {
    setNewRoles(newRoles.filter((x) => x !== r));
  }

  async function save() {
    setSaving(true);
    setError(null);

    // Build the diff: only fields that changed
    const payload: Record<string, unknown> = {};

    function originalValue(field: EditableField): string {
      switch (field) {
        case "first_name": return contact.first_name ?? "";
        case "last_name": return contact.last_name ?? "";
        case "email": return contact.email ?? "";
        case "phone": return contact.phone ?? "";
        case "website": return contact.website ?? "";
        case "company": return contact.company ?? "";
        case "type": return contact.type ?? "";
        case "primary_street": return contact.primary_street ?? "";
        case "primary_city": return contact.primary_city ?? "";
        case "primary_state": return contact.primary_state ?? "";
        case "primary_zip": return contact.primary_zip ?? "";
        case "primary_country": return contact.primary_country ?? "";
      }
    }

    for (const field of Object.keys(form) as EditableField[]) {
      const newVal = form[field].trim();
      const oldVal = originalValue(field);
      if (newVal !== oldVal) {
        payload[field] = newVal === "" ? null : newVal;
      }
    }

    if (newTags.length > 0) payload.tags = newTags;
    if (newRoles.length > 0) payload.roles = newRoles;

    if (Object.keys(payload).length === 0) {
      setIsEditing(false);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || `HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      setIsEditing(false);
      setSaving(false);
      router.refresh();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  function setField(field: EditableField, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  if (!isEditing) {
    return (
      <>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">{contact.display_name}</h1>
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        </div>

        <ViewContactInfo contact={contact} />
        <ViewAddress contact={contact} />
        <ViewTags label="Tags" items={contact.tags} />
        <ViewTags label="Roles" items={contact.roles} />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{contact.display_name}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={cancelEditing}
            disabled={saving}
            className="inline-flex items-center rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Contact Information — editable */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Contact Information
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <FieldText label="First Name" value={form.first_name} onChange={(v) => setField("first_name", v)} maxLength={100} />
          <FieldText label="Last Name" value={form.last_name} onChange={(v) => setField("last_name", v)} maxLength={100} />
          <ReadOnlyField label="Display Name" value={contact.display_name} />
          <FieldText label="Email" value={form.email} onChange={(v) => setField("email", v)} type="email" />
          <FieldText label="Phone" value={form.phone} onChange={(v) => setField("phone", v)} maxLength={50} />
          <ReadOnlyField label="Phone (Mobile)" value={contact.phone_mobile} hint="Read-only" />
          <FieldSelect label="Type" value={form.type} onChange={(v) => setField("type", v)} options={TYPE_OPTIONS} />
          <FieldText label="Website" value={form.website} onChange={(v) => setField("website", v)} type="url" />
          <FieldText label="Company" value={form.company} onChange={(v) => setField("company", v)} maxLength={255} />
        </dl>
      </div>

      {/* Address — editable */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
          Primary Address
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <FieldText label="Street" value={form.primary_street} onChange={(v) => setField("primary_street", v)} maxLength={255} wide />
          <FieldText label="City" value={form.primary_city} onChange={(v) => setField("primary_city", v)} maxLength={100} />
          <FieldText label="State" value={form.primary_state} onChange={(v) => setField("primary_state", v)} maxLength={100} />
          <FieldText label="ZIP" value={form.primary_zip} onChange={(v) => setField("primary_zip", v)} maxLength={20} />
          <FieldText label="Country" value={form.primary_country} onChange={(v) => setField("primary_country", v)} maxLength={100} />
        </dl>
      </div>

      {/* Tags — additive only */}
      <EditTags
        label="Tags"
        existing={contact.tags}
        staged={newTags}
        input={tagInput}
        setInput={setTagInput}
        onAdd={addStagedTag}
        onRemoveStaged={removeStagedTag}
      />

      {/* Roles — additive only */}
      <EditTags
        label="Roles"
        existing={contact.roles}
        staged={newRoles}
        input={roleInput}
        setInput={setRoleInput}
        onAdd={addStagedRole}
        onRemoveStaged={removeStagedRole}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// View components (read-only mode)
// ---------------------------------------------------------------------------

function ViewContactInfo({ contact }: { contact: ContactData }) {
  const fields = [
    { label: "ID", value: contact.id },
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
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
      <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
        Contact Information
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {fields.map((d) => (
          <div key={d.label}>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{d.label}</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {d.isEmail && d.value ? (
                <a href={`mailto:${d.value}`} className="hover:underline text-blue-600">{d.value}</a>
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
                d.value || <span className="text-gray-400 italic">{"—"}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ViewAddress({ contact }: { contact: ContactData }) {
  const fields = [
    { label: "Street", value: contact.primary_street },
    { label: "City", value: contact.primary_city },
    { label: "State", value: contact.primary_state },
    { label: "ZIP", value: contact.primary_zip },
    { label: "Country", value: contact.primary_country },
    { label: "Formatted Address", value: contact.primary_address_formatted, wide: true },
  ];
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
      <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
        Primary Address
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {fields.map((d) => (
          <div key={d.label} className={d.wide ? "sm:col-span-2" : ""}>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{d.label}</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {d.value || <span className="text-gray-400 italic">{"—"}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ViewTags({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
      <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">{label}</h2>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((t) => (
            <span key={t} className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
              {t}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">{"—"}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit-mode field components
// ---------------------------------------------------------------------------

function FieldText({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength?: number;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        {label} {hint && <span className="text-gray-400 normal-case">({hint})</span>}
      </label>
      <div className="text-sm text-gray-700 px-3 py-1.5">
        {value || <span className="text-gray-400 italic">{"—"}</span>}
      </div>
    </div>
  );
}

function EditTags({
  label,
  existing,
  staged,
  input,
  setInput,
  onAdd,
  onRemoveStaged,
}: {
  label: string;
  existing: string[];
  staged: string[];
  input: string;
  setInput: (v: string) => void;
  onAdd: () => void;
  onRemoveStaged: (t: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</h2>
        <span className="text-xs text-gray-400">Add only — remove via Arternal</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {existing.map((t) => (
          <span key={t} className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
            {t}
          </span>
        ))}
        {staged.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
            {t}
            <button
              onClick={() => onRemoveStaged(t)}
              className="text-green-600 hover:text-green-900"
              aria-label={`Remove ${t}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {existing.length === 0 && staged.length === 0 && (
          <p className="text-sm text-gray-400 italic">{"—"}</p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={`Add a ${label.toLowerCase().replace(/s$/, "")}…`}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
