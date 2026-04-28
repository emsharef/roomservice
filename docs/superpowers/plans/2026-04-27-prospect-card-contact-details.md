# Prospect Card Expanded Contact Details — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a prospect card is expanded in `/tools/prospects/[batchId]`, replace the icon-only contact row with a list of clickable values, each with a copy button.

**Architecture:** Extract a pure formatting helper (`formatContact`) into its own module with vitest unit tests. Add a `ContactDetails` React component to `BatchDetail.tsx` next to the existing `ContactIcons`. Swap which one renders in the existing card-body bottom-row slot based on `isExpanded`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest 1.x.

**Spec:** `docs/superpowers/specs/2026-04-27-prospect-card-contact-details-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/app/tools/prospects/[batchId]/contact-format.ts` | **create** | Pure helper: maps `(channel, value)` → `{ display, href, copyValue }`. No React, no DOM. |
| `src/app/tools/prospects/[batchId]/contact-format.test.ts` | **create** | Vitest unit tests for `formatContact`, one `describe` per channel. |
| `src/app/tools/prospects/[batchId]/BatchDetail.tsx` | **modify** | Add `ContactDetails` component (next to `ContactIcons` at line 144); swap render-slot at line 935–941. |

Helper goes in its own file because it is pure logic with branchy display rules — easiest to test and reason about in isolation, and `BatchDetail.tsx` is already 961 lines.

---

## Task 1: Extract `formatContact` helper with unit tests

**Files:**
- Create: `src/app/tools/prospects/[batchId]/contact-format.ts`
- Create: `src/app/tools/prospects/[batchId]/contact-format.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/tools/prospects/[batchId]/contact-format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatContact } from "./contact-format";

describe("formatContact", () => {
  describe("email", () => {
    it("returns raw value, mailto href, and raw copyValue", () => {
      expect(formatContact("email", "jane@example.com")).toEqual({
        display: "jane@example.com",
        href: "mailto:jane@example.com",
        copyValue: "jane@example.com",
      });
    });
  });

  describe("phone", () => {
    it("returns raw value, tel href, and raw copyValue", () => {
      expect(formatContact("phone", "+1 555 123 4567")).toEqual({
        display: "+1 555 123 4567",
        href: "tel:+1 555 123 4567",
        copyValue: "+1 555 123 4567",
      });
    });
  });

  describe("website", () => {
    it("strips https:// and trailing slash for display", () => {
      expect(formatContact("website", "https://example.com/")).toEqual({
        display: "example.com",
        href: "https://example.com/",
        copyValue: "https://example.com/",
      });
    });

    it("strips http:// for display", () => {
      const r = formatContact("website", "http://example.com/path");
      expect(r.display).toBe("example.com/path");
      expect(r.href).toBe("http://example.com/path");
      expect(r.copyValue).toBe("http://example.com/path");
    });

    it("leaves value untouched when no protocol", () => {
      const r = formatContact("website", "example.com/path");
      expect(r.display).toBe("example.com/path");
      expect(r.href).toBe("example.com/path");
    });
  });

  describe("linkedin", () => {
    it("extracts handle from /in/ path", () => {
      const r = formatContact("linkedin", "https://www.linkedin.com/in/jane-doe/");
      expect(r.display).toBe("@jane-doe");
      expect(r.href).toBe("https://www.linkedin.com/in/jane-doe/");
      expect(r.copyValue).toBe("https://www.linkedin.com/in/jane-doe/");
    });

    it("extracts handle from /company/ path", () => {
      const r = formatContact("linkedin", "https://linkedin.com/company/acme");
      expect(r.display).toBe("@acme");
      expect(r.href).toBe("https://linkedin.com/company/acme");
    });

    it("falls back to stripped URL when no /in/ or /company/ segment", () => {
      const r = formatContact("linkedin", "https://linkedin.com/");
      expect(r.display).toBe("linkedin.com");
      expect(r.href).toBe("https://linkedin.com/");
    });

    it("ignores query string and fragment when extracting handle", () => {
      const r = formatContact("linkedin", "https://linkedin.com/in/jane-doe?utm=foo#section");
      expect(r.display).toBe("@jane-doe");
    });
  });

  describe("instagram", () => {
    it("extracts handle from URL", () => {
      const r = formatContact("instagram", "https://instagram.com/john_doe");
      expect(r.display).toBe("@john_doe");
      expect(r.href).toBe("https://instagram.com/john_doe");
      expect(r.copyValue).toBe("https://instagram.com/john_doe");
    });

    it("extracts handle from URL with trailing slash", () => {
      const r = formatContact("instagram", "https://instagram.com/john_doe/");
      expect(r.display).toBe("@john_doe");
    });

    it("normalizes bare @handle into a URL for href and copyValue", () => {
      expect(formatContact("instagram", "@john_doe")).toEqual({
        display: "@john_doe",
        href: "https://instagram.com/john_doe",
        copyValue: "https://instagram.com/john_doe",
      });
    });

    it("normalizes bare handle (no @) into a URL for href and copyValue", () => {
      expect(formatContact("instagram", "john_doe")).toEqual({
        display: "@john_doe",
        href: "https://instagram.com/john_doe",
        copyValue: "https://instagram.com/john_doe",
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/app/tools/prospects/\[batchId\]/contact-format.test.ts`

Expected: FAIL — module `./contact-format` cannot be resolved (or `formatContact` is undefined).

- [ ] **Step 3: Write the helper**

Create `src/app/tools/prospects/[batchId]/contact-format.ts`:

```ts
export type ContactChannel = "email" | "phone" | "website" | "linkedin" | "instagram";

export interface ContactFormat {
  display: string;
  href: string;
  copyValue: string;
}

function stripUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function formatContact(channel: ContactChannel, value: string): ContactFormat {
  switch (channel) {
    case "email":
      return { display: value, href: `mailto:${value}`, copyValue: value };

    case "phone":
      return { display: value, href: `tel:${value}`, copyValue: value };

    case "website":
      return { display: stripUrl(value), href: value, copyValue: value };

    case "linkedin": {
      const match = value.match(/\/(?:in|company)\/([^/?#]+)/i);
      const display = match ? `@${match[1]}` : stripUrl(value);
      return { display, href: value, copyValue: value };
    }

    case "instagram": {
      const isUrl = /^https?:\/\//i.test(value);
      if (isUrl) {
        const path = value.replace(/[?#].*$/, "").replace(/\/$/, "");
        const handle = path.split("/").pop() || value;
        return {
          display: `@${handle}`,
          href: value,
          copyValue: value,
        };
      }
      const bare = value.replace(/^@/, "");
      const url = `https://instagram.com/${bare}`;
      return { display: `@${bare}`, href: url, copyValue: url };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/app/tools/prospects/\[batchId\]/contact-format.test.ts`

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/tools/prospects/\[batchId\]/contact-format.ts src/app/tools/prospects/\[batchId\]/contact-format.test.ts
git commit -m "Add formatContact helper for prospect contact rows"
```

---

## Task 2: Add `ContactDetails` component and swap render slot

**Files:**
- Modify: `src/app/tools/prospects/[batchId]/BatchDetail.tsx`

This task lands the UI change in one atomic edit: a new component plus the render-slot swap. No automated tests — the component is presentation-only and the formatting logic (already tested in Task 1) is the only branching code.

- [ ] **Step 1: Add the `formatContact` import**

Locate the imports at the top of `src/app/tools/prospects/[batchId]/BatchDetail.tsx` (lines 1–5). Add a new import line after `import Link from "next/link";`:

```tsx
import { formatContact, type ContactChannel } from "./contact-format";
```

- [ ] **Step 2: Add the `ContactDetails` component**

Insert the following block immediately after the closing brace of the `ContactIcons` component (the `}` that ends the function defined at line 144). The new component lives in the same file because it is small, only used here, and benefits from being read alongside `ContactIcons`:

```tsx
// ---------------------------------------------------------------------------
// Contact details (expanded view)
// ---------------------------------------------------------------------------

function ClipboardIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ContactDetails({ prospect }: { prospect: Prospect }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const rows: Array<{
    channel: ContactChannel;
    value: string | null;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      channel: "email",
      value: prospect.email,
      label: "email",
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      ),
    },
    {
      channel: "phone",
      value: prospect.phone,
      label: "phone",
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
        </svg>
      ),
    },
    {
      channel: "linkedin",
      value: prospect.linkedin,
      label: "LinkedIn",
      icon: <span className="block w-3.5 text-center text-[10px] font-bold leading-none">LI</span>,
    },
    {
      channel: "instagram",
      value: prospect.instagram,
      label: "Instagram",
      icon: <span className="block w-3.5 text-center text-[10px] font-bold leading-none">IG</span>,
    },
    {
      channel: "website",
      value: prospect.website,
      label: "website",
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      ),
    },
  ];

  const populated = rows.filter((r): r is typeof r & { value: string } => !!r.value);
  if (populated.length === 0) return null;

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
    } catch (err) {
      console.warn("Copy failed", err);
    }
  };

  return (
    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
      {populated.map(({ channel, value, label, icon }) => {
        const fmt = formatContact(channel, value);
        const isCopied = copiedKey === channel;
        const external = channel !== "email" && channel !== "phone";
        return (
          <div
            key={channel}
            className="group/contact flex items-center gap-2 text-xs text-gray-700"
          >
            <span className="flex w-3.5 shrink-0 items-center justify-center text-gray-400">
              {icon}
            </span>
            <a
              href={fmt.href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="min-w-0 flex-1 truncate hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {fmt.display}
            </a>
            <button
              type="button"
              aria-label={`Copy ${label}`}
              className="shrink-0 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 focus:opacity-100 group-hover/contact:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(channel, fmt.copyValue);
              }}
            >
              {isCopied ? <CheckIcon /> : <ClipboardIcon />}
              <span className="sr-only" aria-live="polite">
                {isCopied ? "Copied" : ""}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Swap the render slot**

Locate the bottom-row block at lines 935–941:

```tsx
                {/* Bottom row: contact icons + tags */}
                {prospect.status === "done" && (
                  <div className="mt-3 space-y-2">
                    <ContactIcons prospect={prospect} />
                    <TagPills prospect={prospect} />
                  </div>
                )}
```

Replace `<ContactIcons prospect={prospect} />` with a conditional that swaps based on `isExpanded` (already in scope at line 860):

```tsx
                {/* Bottom row: contact icons or full details + tags */}
                {prospect.status === "done" && (
                  <div className="mt-3 space-y-2">
                    {isExpanded ? (
                      <ContactDetails prospect={prospect} />
                    ) : (
                      <ContactIcons prospect={prospect} />
                    )}
                    <TagPills prospect={prospect} />
                  </div>
                )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: PASS — no errors. If TypeScript flags the `populated` filter narrowing, replace it with the more verbose form `populated = rows.filter((r) => r.value !== null && r.value !== "")` and assert non-null inside the map (`value!`).

- [ ] **Step 5: Manual UI verification**

Start the dev server: `npm run dev -- -p 3002`

Open `http://localhost:3002/tools/prospects/<batchId>` (use any batch with completed prospects). Verify:

1. **Collapsed cards** still show the icon row exactly as before — no visual change.
2. **Expand a card with all five channels populated** — verify each row renders with the icon, the formatted display value, and (on hover) a copy button. LinkedIn shows `@<slug>`; Instagram shows `@<handle>`; website shows the host without `https://`; email/phone show as-is.
3. **Click an email row** — your mail client opens. Click a website row — the URL opens in a new tab. Click a phone row — the OS handles `tel:`.
4. **Click the copy button on an email row** — the clipboard icon flips to a check for ~1.2s, then back. Paste into another app and confirm it matches the canonical value (full URL for socials, raw value for email/phone).
5. **Click the copy button on the LinkedIn row** — paste somewhere; confirm it copies the **full URL**, not the `@handle` display string.
6. **Expand a card with only one or two channels** — only those rows render, no empty space.
7. **Expand a card and click a row's value** — the expansion stays open (no collapse).
8. **Keyboard:** Tab into a row's link, then again into its copy button. Press Enter on the copy button — should trigger the copy.
9. **Touch device (or DevTools "Toggle device toolbar")** — copy buttons should be visible without hover.

If anything in 1–9 fails, fix and re-verify before committing.

- [ ] **Step 6: Commit**

```bash
git add src/app/tools/prospects/\[batchId\]/BatchDetail.tsx
git commit -m "Show full contact details when prospect card is expanded"
```

---

## Self-review notes

- **Spec coverage:** every section of `2026-04-27-prospect-card-contact-details-design.md` (component structure, render-slot change, row layout, display formatting table for all five channels, `other_socials` exclusion, accessibility, error handling, testing) is implemented across Tasks 1–2.
- **Type consistency:** `ContactChannel` is the single source of truth for channel names; both helper and component import it from `contact-format.ts`.
- **No placeholders:** all code blocks are complete; no "TBD" or "similar to above".
