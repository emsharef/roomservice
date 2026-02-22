import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

async function getCounts() {
  const supabase = await createClient();
  const [artworks, artists, contacts] = await Promise.all([
    supabase.from("artworks").select("*", { count: "exact", head: true }),
    supabase.from("artists").select("*", { count: "exact", head: true }),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
  ]);
  return {
    artworks: artworks.count ?? 0,
    artists: artists.count ?? 0,
    contacts: contacts.count ?? 0,
  };
}

const sections = [
  {
    title: "Inventory",
    description: "Browse artworks, search by title or catalog number, and filter by status.",
    href: "/inventory",
    countKey: "artworks" as const,
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    ),
  },
  {
    title: "Artists",
    description: "View artist profiles, biographies, and their associated works.",
    href: "/artists",
    countKey: "artists" as const,
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    title: "Contacts",
    description: "Manage collectors, galleries, and other contacts.",
    href: "/contacts",
    countKey: "contacts" as const,
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
];

const tools = [
  {
    title: "AI Search",
    description: "Find artworks by visual similarity or text description using AI embeddings.",
    href: "/search",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    title: "Sync & Admin",
    description: "Sync data from Arternal, manage users, and run batch AI processing.",
    href: "/admin",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.181" />
      </svg>
    ),
  },
];

export default async function Home() {
  const counts = await getCounts();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Your gallery data at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-primary-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 group-hover:bg-primary-100 transition-colors">
                {section.icon}
              </div>
              <svg className="h-5 w-5 text-gray-300 group-hover:text-primary-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-semibold text-gray-900">
                {counts[section.countKey].toLocaleString()}
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {section.title}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {section.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Tools
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition-all hover:shadow-md hover:border-primary-200"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
                {tool.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{tool.title}</p>
                <p className="text-xs text-gray-500 truncate">{tool.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
