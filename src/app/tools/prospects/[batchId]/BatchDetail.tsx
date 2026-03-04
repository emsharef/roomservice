"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Batch {
  id: string;
  name: string;
  source_type: string;
  prospect_count: number;
  created_at: string;
}

interface Prospect {
  id: string;
  batch_id: string;
  input_name: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  photo_url: string | null;
  linkedin: string | null;
  instagram: string | null;
  other_socials: string[];
  research_brief: any;
  research_summary: string | null;
  confidence: "high" | "medium" | "low" | null;
  style_preferences: string[];
  subject_preferences: string[];
  mood_preferences: string[];
  known_artists: string[];
  engagement_level: string | null;
  board_memberships: string[];
  collection_mentions: string[];
  art_events: string[];
  advisory_roles: string[];
  foundations: string[];
  notable_giving: string[];
  sources: Array<{ url: string; title: string; relevance: string }> | null;
  status: "parsed" | "researching" | "done" | "error" | "skipped";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter = "all" | "done" | "error" | "parsed";
type SortKey = "name" | "company" | "location" | "confidence" | "status" | "created";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayName(p: Prospect): string {
  return p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.input_name;
}

function confidenceBadge(c: Prospect["confidence"]) {
  if (!c) return null;
  const map: Record<string, string> = {
    high: "bg-green-100 text-green-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[c]}`}>
      {c}
    </span>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Silhouette placeholder
// ---------------------------------------------------------------------------

function AvatarPlaceholder() {
  return (
    <svg className="h-full w-full text-gray-300" viewBox="0 0 80 80" fill="currentColor">
      <rect width="80" height="80" fill="#f3f4f6" />
      <circle cx="40" cy="30" r="14" />
      <ellipse cx="40" cy="72" rx="24" ry="20" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Photo with error fallback
// ---------------------------------------------------------------------------

function ProspectPhoto({ url, name, onFailed }: { url: string | null; name: string; onFailed?: () => void }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) return <AvatarPlaceholder />;

  return (
    <img
      src={url}
      alt={name}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true);
        onFailed?.();
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Contact icons
// ---------------------------------------------------------------------------

function ContactIcons({ prospect }: { prospect: Prospect }) {
  const items: { label: string; href: string | null; icon: React.ReactNode }[] = [
    {
      label: "Email",
      href: prospect.email ? `mailto:${prospect.email}` : null,
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      ),
    },
    {
      label: "LinkedIn",
      href: prospect.linkedin,
      icon: <span className="text-[10px] font-bold leading-none">LI</span>,
    },
    {
      label: "Instagram",
      href: prospect.instagram ? (prospect.instagram.startsWith("http") ? prospect.instagram : `https://instagram.com/${prospect.instagram.replace(/^@/, "")}`) : null,
      icon: <span className="text-[10px] font-bold leading-none">IG</span>,
    },
    {
      label: "Website",
      href: prospect.website,
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      ),
    },
    {
      label: "Phone",
      href: prospect.phone ? `tel:${prospect.phone}` : null,
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {items.map((item) => {
        const active = !!item.href;
        if (active) {
          return (
            <a
              key={item.label}
              href={item.href!}
              target="_blank"
              rel="noopener noreferrer"
              title={item.label}
              onClick={(e) => e.stopPropagation()}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200"
            >
              {item.icon}
            </a>
          );
        }
        return (
          <span
            key={item.label}
            title={`No ${item.label.toLowerCase()}`}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-50 text-gray-300"
          >
            {item.icon}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag pills
// ---------------------------------------------------------------------------

function TagPills({ prospect }: { prospect: Prospect }) {
  const [expanded, setExpanded] = useState(false);

  const tags: { label: string; cls: string }[] = [];

  for (const s of prospect.style_preferences ?? []) {
    tags.push({ label: s, cls: "bg-violet-100 text-violet-700" });
  }
  for (const s of prospect.subject_preferences ?? []) {
    tags.push({ label: s, cls: "bg-sky-100 text-sky-700" });
  }
  for (const s of prospect.mood_preferences ?? []) {
    tags.push({ label: s, cls: "bg-amber-100 text-amber-700" });
  }
  for (const a of prospect.known_artists ?? []) {
    tags.push({ label: a, cls: "bg-rose-100 text-rose-700" });
  }

  if (tags.length === 0) return null;

  const maxShow = 5;
  const visible = expanded ? tags : tags.slice(0, maxShow);
  const remaining = tags.length - maxShow;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((t, i) => (
        <span
          key={i}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t.cls}`}
        >
          {t.label}
        </span>
      ))}
      {remaining > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
        >
          {expanded ? "show less" : `+${remaining} more`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded detail panel
// ---------------------------------------------------------------------------

function ExpandedPanel({ prospect }: { prospect: Prospect }) {
  const brief = prospect.research_brief || {};
  const professional = brief.professional || {};
  const notes = brief.notes;

  const artWorldSections: { label: string; items: string[] }[] = [
    { label: "Board Memberships", items: prospect.board_memberships ?? [] },
    { label: "Collection Mentions", items: prospect.collection_mentions ?? [] },
    { label: "Art Events", items: prospect.art_events ?? [] },
    { label: "Advisory Roles", items: prospect.advisory_roles ?? [] },
    { label: "Known Artists", items: prospect.known_artists ?? [] },
  ];

  const philanthropySections: { label: string; items: string[] }[] = [
    { label: "Foundations", items: prospect.foundations ?? [] },
    { label: "Notable Giving", items: prospect.notable_giving ?? [] },
  ];

  return (
    <div
      className="border-t border-gray-100 bg-gray-50 px-4 pb-4 pt-3"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Full summary */}
      {prospect.research_summary && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Summary
          </h4>
          <p className="text-sm leading-relaxed text-gray-700">{prospect.research_summary}</p>
        </div>
      )}

      {/* Professional */}
      {(professional.current_role || professional.career_highlights?.length || professional.industry) && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Professional
          </h4>
          <div className="space-y-1 text-sm text-gray-700">
            {professional.current_role && <p><span className="font-medium">Current Role:</span> {professional.current_role}</p>}
            {professional.industry && <p><span className="font-medium">Industry:</span> {professional.industry}</p>}
            {professional.career_highlights?.length > 0 && (
              <div>
                <span className="font-medium">Career Highlights:</span>
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-gray-600">
                  {professional.career_highlights.map((h: string, i: number) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Art World */}
      {artWorldSections.some((s) => s.items.length > 0) && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Art World
          </h4>
          <div className="space-y-2 text-sm text-gray-700">
            {artWorldSections
              .filter((s) => s.items.length > 0)
              .map((s) => (
                <div key={s.label}>
                  <span className="font-medium">{s.label}:</span>
                  <ul className="ml-4 mt-0.5 list-disc space-y-0.5 text-gray-600">
                    {s.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Philanthropy */}
      {philanthropySections.some((s) => s.items.length > 0) && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Philanthropy
          </h4>
          <div className="space-y-2 text-sm text-gray-700">
            {philanthropySections
              .filter((s) => s.items.length > 0)
              .map((s) => (
                <div key={s.label}>
                  <span className="font-medium">{s.label}:</span>
                  <ul className="ml-4 mt-0.5 list-disc space-y-0.5 text-gray-600">
                    {s.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {prospect.sources && prospect.sources.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Sources
          </h4>
          <ol className="ml-4 list-decimal space-y-1 text-sm">
            {prospect.sources.map((src, i) => (
              <li key={i}>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {src.title || src.url}
                </a>
                {src.relevance && (
                  <span className="ml-1 text-xs text-gray-400">- {src.relevance}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Notes
          </h4>
          <p className="text-sm text-gray-700">{typeof notes === "string" ? notes : JSON.stringify(notes)}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BatchDetail({
  batch,
  initialProspects,
}: {
  batch: Batch;
  initialProspects: Prospect[];
}) {
  const router = useRouter();

  // Local state
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Track broken photo URLs detected by <img> onError
  const [brokenPhotoIds, setBrokenPhotoIds] = useState<Set<string>>(new Set());

  // Research loop state
  const [running, setRunning] = useState(false);
  const [runMode, setRunMode] = useState<"research" | "fill-gaps">("research");
  const [paused, setPaused] = useState(false);
  const pauseRef = useRef(false);
  const [currentProspect, setCurrentProspect] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Counts
  const counts = {
    all: prospects.length,
    done: prospects.filter((p) => p.status === "done").length,
    error: prospects.filter((p) => p.status === "error").length,
    parsed: prospects.filter((p) => p.status === "parsed").length,
    gaps: prospects.filter((p) => p.status === "done" && (!p.photo_url || !p.email || brokenPhotoIds.has(p.id))).length,
  };

  // Filtered + sorted prospects
  const filtered = (
    filter === "all"
      ? prospects
      : prospects.filter((p) => p.status === filter)
  ).slice().sort((a, b) => {
    switch (sortBy) {
      case "name":
        return (a.last_name || displayName(a)).localeCompare(b.last_name || displayName(b));
      case "company":
        return (a.company || "").localeCompare(b.company || "");
      case "location":
        return (a.location || "").localeCompare(b.location || "");
      case "confidence": {
        const order = { high: 0, medium: 1, low: 2 };
        const ac = a.confidence ? order[a.confidence] : 3;
        const bc = b.confidence ? order[b.confidence] : 3;
        return ac - bc;
      }
      case "status": {
        const sOrder = { done: 0, researching: 1, parsed: 2, error: 3, skipped: 4 };
        return (sOrder[a.status] ?? 5) - (sOrder[b.status] ?? 5);
      }
      case "created":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      default:
        return 0;
    }
  });

  // ------ Research loop ------

  const runResearch = useCallback(
    async (targetStatus: "parsed" | "error") => {
      const targets = prospects.filter((p) => p.status === targetStatus);
      if (targets.length === 0) return;

      setRunning(true);
      setRunMode("research");
      setPaused(false);
      pauseRef.current = false;
      setProgress({ done: 0, total: targets.length });

      for (let i = 0; i < targets.length; i++) {
        // Check for pause
        while (pauseRef.current) {
          await delay(300);
        }

        // If we were fully stopped (component unmounted, etc.) bail
        if (!pauseRef.current && i > 0) {
          // small inter-request delay
        }

        const prospect = targets[i];
        setCurrentProspect(displayName(prospect));

        // Mark as researching locally
        setProspects((prev) =>
          prev.map((p) =>
            p.id === prospect.id ? { ...p, status: "researching" as const, error_message: null } : p,
          ),
        );

        try {
          // Use AbortController with 120s timeout to prevent mobile Safari killing the fetch
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 120_000);

          const res = await fetch(`/api/prospects/research/${prospect.id}`, {
            method: "POST",
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!res.ok) {
            const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(data.error || `HTTP ${res.status}`);
          }

          const data = await res.json();
          const enrichment = data.enrichment;

          // Merge enrichment into local state
          setProspects((prev) =>
            prev.map((p) => {
              if (p.id !== prospect.id) return p;
              return {
                ...p,
                first_name: enrichment.first_name || null,
                last_name: enrichment.last_name || null,
                display_name: enrichment.display_name || null,
                email: enrichment.email || null,
                phone: enrichment.phone || null,
                website: enrichment.website || null,
                company: enrichment.company || null,
                title: enrichment.title || null,
                location: enrichment.location || null,
                photo_url: enrichment.photo_url || null,
                linkedin: enrichment.linkedin || null,
                instagram: enrichment.instagram || null,
                other_socials: enrichment.other_socials ?? [],
                research_summary: enrichment.summary,
                confidence: enrichment.confidence,
                style_preferences: enrichment.collection_profile?.style_preferences ?? [],
                subject_preferences: enrichment.collection_profile?.subject_preferences ?? [],
                mood_preferences: enrichment.collection_profile?.mood_preferences ?? [],
                known_artists: enrichment.art_world?.known_artists ?? [],
                engagement_level: enrichment.collection_profile?.engagement_level ?? null,
                board_memberships: enrichment.art_world?.board_memberships ?? [],
                collection_mentions: enrichment.art_world?.collection_mentions ?? [],
                art_events: enrichment.art_world?.art_events ?? [],
                advisory_roles: enrichment.art_world?.advisory_roles ?? [],
                foundations: enrichment.philanthropy?.foundations ?? [],
                notable_giving: enrichment.philanthropy?.notable_giving ?? [],
                sources: enrichment.sources ?? [],
                research_brief: {
                  professional: enrichment.professional,
                  notes: enrichment.notes,
                },
                status: "done" as const,
                error_message: null,
              };
            }),
          );
        } catch (e) {
          // The fetch may have timed out on the client, but the server may have completed.
          // Re-check the prospect's actual status from the DB before marking as error.
          try {
            await delay(3000); // give the server a moment to finish if still running
            const checkRes = await fetch(`/api/prospects/research/${prospect.id}`);
            if (checkRes.ok) {
              const { prospect: dbProspect } = await checkRes.json();
              if (dbProspect && dbProspect.status === "done") {
                // Server completed successfully — use the DB data
                setProspects((prev) =>
                  prev.map((p) => (p.id === prospect.id ? { ...dbProspect } : p)),
                );
                continue; // skip the error state, move to next prospect
              }
            }
          } catch {
            // Status check itself failed — fall through to error state
          }

          setProspects((prev) =>
            prev.map((p) =>
              p.id === prospect.id
                ? { ...p, status: "error" as const, error_message: String(e) }
                : p,
            ),
          );
        }

        setProgress({ done: i + 1, total: targets.length });

        // Wait 2 seconds between calls (skip after last)
        if (i < targets.length - 1) {
          await delay(2000);
        }
      }

      setRunning(false);
      setCurrentProspect(null);
      router.refresh();
    },
    [prospects, router],
  );

  function handlePause() {
    pauseRef.current = true;
    setPaused(true);
  }

  function handleResume() {
    pauseRef.current = false;
    setPaused(false);
  }

  // ------ Fill gaps loop ------

  const runFillGaps = useCallback(async () => {
    const targets = prospects.filter(
      (p) => p.status === "done" && (!p.photo_url || !p.email || brokenPhotoIds.has(p.id)),
    );
    if (targets.length === 0) return;

    setRunning(true);
    setRunMode("fill-gaps");
    setPaused(false);
    pauseRef.current = false;
    setProgress({ done: 0, total: targets.length });

    for (let i = 0; i < targets.length; i++) {
      while (pauseRef.current) {
        await delay(300);
      }

      const prospect = targets[i];
      setCurrentProspect(displayName(prospect));

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 65_000);

        const res = await fetch(`/api/prospects/fill-gaps/${prospect.id}`, {
          method: "POST",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        if (data.updated && data.fields) {
          // Merge only the filled fields into local state
          setProspects((prev) =>
            prev.map((p) => {
              if (p.id !== prospect.id) return p;
              const updates: Partial<Prospect> = {};
              if (data.fields.photo_url) updates.photo_url = data.fields.photo_url;
              if (data.fields.email) updates.email = data.fields.email;
              if (data.fields.phone) updates.phone = data.fields.phone;
              if (data.fields.instagram) updates.instagram = data.fields.instagram;
              return { ...p, ...updates };
            }),
          );
        }
      } catch (e) {
        // Fill-gaps errors are non-critical — just skip to the next
        console.warn(`Fill gaps failed for ${displayName(prospect)}:`, e);
      }

      setProgress({ done: i + 1, total: targets.length });

      if (i < targets.length - 1) {
        await delay(1000);
      }
    }

    setRunning(false);
    setCurrentProspect(null);
    router.refresh();
  }, [prospects, router, brokenPhotoIds]);

  // ------ Render ------

  const hasParsed = counts.parsed > 0;
  const hasErrors = counts.error > 0;

  const filterTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "done", label: "Done", count: counts.done },
    { key: "error", label: "Errors", count: counts.error },
    { key: "parsed", label: "Parsed", count: counts.parsed },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/tools/prospects"
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Batches
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{batch.name}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {new Date(batch.created_at).toLocaleDateString()} &middot; {batch.prospect_count} prospects
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Start Research */}
            {!running && hasParsed && (
              <button
                onClick={() => runResearch("parsed")}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
              >
                Start Research
              </button>
            )}

            {/* Pause / Resume */}
            {running && !paused && (
              <button
                onClick={handlePause}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Pause
              </button>
            )}
            {running && paused && (
              <button
                onClick={handleResume}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
              >
                Resume
              </button>
            )}

            {/* Retry Failed */}
            {!running && hasErrors && (
              <button
                onClick={() => runResearch("error")}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
              >
                Retry Failed
              </button>
            )}

            {/* Fill Gaps */}
            {!running && counts.gaps > 0 && (
              <button
                onClick={runFillGaps}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                Fill Gaps ({counts.gaps})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar (shown during research) */}
      {running && (
        <div className="sticky top-0 z-10 mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {runMode === "fill-gaps" ? "Filling gaps" : "Researching"} {progress.done} / {progress.total}...
              {currentProspect && (
                <span className="ml-2 font-normal text-gray-500">{currentProspect}</span>
              )}
            </span>
            {paused && (
              <span className="text-xs font-medium text-yellow-600">Paused</span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-gray-900 transition-all duration-500"
              style={{
                width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%",
              }}
            />
          </div>
        </div>
      )}

      {/* Status filter tabs + sort */}
      <div className="mb-4 flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                filter === tab.key
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}{" "}
              <span
                className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${
                  filter === tab.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 pb-1 text-sm text-gray-500">
          <span>Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            <option value="name">Name</option>
            <option value="company">Company</option>
            <option value="location">Location</option>
            <option value="confidence">Confidence</option>
            <option value="status">Status</option>
            <option value="created">Date Added</option>
          </select>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((prospect) => {
          const isExpanded = expandedId === prospect.id;
          const name = displayName(prospect);

          return (
            <div
              key={prospect.id}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
            >
              {/* Card body */}
              <div
                className="cursor-pointer p-4"
                onClick={() => setExpandedId(isExpanded ? null : prospect.id)}
              >
                <div className="flex gap-3">
                  {/* Photo */}
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    <ProspectPhoto
                      url={prospect.photo_url}
                      name={name}
                      onFailed={() => setBrokenPhotoIds((prev) => new Set(prev).add(prospect.id))}
                    />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Name */}
                    <p
                      className={`text-sm font-semibold text-gray-900 ${
                        prospect.status === "skipped" ? "line-through" : ""
                      }`}
                    >
                      {name}
                    </p>

                    {/* Title @ Company */}
                    {(prospect.title || prospect.company) && (
                      <p className="truncate text-xs text-gray-500">
                        {[prospect.title, prospect.company].filter(Boolean).join(" @ ")}
                      </p>
                    )}

                    {/* Location */}
                    {prospect.location && (
                      <p className="truncate text-xs text-gray-400">{prospect.location}</p>
                    )}

                    {/* Confidence + Status indicators */}
                    <div className="mt-1 flex items-center gap-2">
                      {confidenceBadge(prospect.confidence)}

                      {prospect.status === "researching" && (
                        <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
                          <Spinner className="h-3 w-3" />
                          Researching...
                        </span>
                      )}
                      {prospect.status === "parsed" && (
                        <span className="text-xs text-gray-400">Pending</span>
                      )}
                      {prospect.status === "error" && (
                        <span className="max-w-[160px] truncate text-xs text-red-600" title={prospect.error_message || undefined}>
                          {prospect.error_message || "Error"}
                        </span>
                      )}
                    </div>

                    {/* Summary (2-line clamp) */}
                    {prospect.research_summary && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600">
                        {prospect.research_summary}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom row: contact icons + tags */}
                {prospect.status === "done" && (
                  <div className="mt-3 space-y-2">
                    <ContactIcons prospect={prospect} />
                    <TagPills prospect={prospect} />
                  </div>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && prospect.status === "done" && (
                <ExpandedPanel prospect={prospect} />
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state for filtered view */}
      {filtered.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No prospects match this filter.</p>
        </div>
      )}
    </div>
  );
}
