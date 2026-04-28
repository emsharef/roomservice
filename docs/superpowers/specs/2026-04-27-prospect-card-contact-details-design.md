# Prospect Card — Expanded Contact Details

**Date:** 2026-04-27
**Scope:** `src/app/tools/prospects/[batchId]/BatchDetail.tsx`

## Problem

In the prospect batch view (`/tools/prospects/[batchId]`), each card shows a row of contact icons (`ContactIcons`, BatchDetail.tsx:144). Each icon is a link that triggers an action — `mailto:`, `tel:`, or opens a URL — but the underlying value (email address, phone number, profile URL) is never visible. To see or copy a value, the user has to open mail/phone/browser and read it from there. This breaks the common workflow of pasting an address or URL into another tool.

## Goal

When a card is expanded, replace the icon row with a list of populated contact channels showing their values. Collapsed cards are unchanged. Each row supports both the existing action (one click) and copy-to-clipboard.

Non-goals: tooltips on collapsed icons; in-place edit; changes to `ExpandedPanel` content; surfacing `other_socials`.

## Design

### Component structure

One new component, `ContactDetails`, defined in `BatchDetail.tsx` adjacent to `ContactIcons` (line 144). `ContactIcons` is unchanged and continues to render in the collapsed state.

### Render-slot change

Currently, the card-body bottom row (BatchDetail.tsx:935–941) renders `ContactIcons` + `TagPills` whenever `prospect.status === "done"`, regardless of expansion state:

```tsx
{prospect.status === "done" && (
  <div className="mt-3 space-y-2">
    <ContactIcons prospect={prospect} />
    <TagPills prospect={prospect} />
  </div>
)}
```

Change to swap based on `isExpanded`:

```tsx
{prospect.status === "done" && (
  <div className="mt-3 space-y-2">
    {isExpanded
      ? <ContactDetails prospect={prospect} />
      : <ContactIcons prospect={prospect} />}
    <TagPills prospect={prospect} />
  </div>
)}
```

`ExpandedPanel` (BatchDetail.tsx:275) is unchanged. Contact info stays in the card body so it sits flush with the photo/name and tags; the gray panel below keeps its summary/professional/art-world/sources sections.

### Row layout

Sparse list — only populated channels render. Each row is a single horizontal flex row:

```
[icon w-3.5]  [clickable display value, flex-1, truncates]   [copy button, on hover/focus]
```

- **Icon:** same SVG / letter glyphs already used by `ContactIcons` (lines 149–183), rendered flat in muted gray (no rounded square background).
- **Display value:** rendered as `<a href={href} target="_blank" rel="noopener noreferrer">` (or `mailto:` / `tel:`); hover underline; truncates with ellipsis if it overflows.
- **Copy button:** small clipboard SVG, `aria-label="Copy {channel}"`. Visible when the row is hovered or the button has focus; on touch devices (`@media (hover: none)`) always visible, since hover is unreliable. On click: `navigator.clipboard.writeText(copyValue)`, swap icon to a check glyph for ~1.2s, then revert. Local visual feedback only — no toast.
- Spacing: rows use `space-y-1` for tight density consistent with other card content.

### Display formatting

A pure helper, `formatContact(channel, value): { display, href, copyValue }`. No state, no side effects, easy to unit-test.

| Channel   | `display`                                         | `href`                       | `copyValue`              |
|-----------|---------------------------------------------------|------------------------------|--------------------------|
| email     | raw value                                         | `mailto:{value}`             | raw value                |
| phone     | raw value                                         | `tel:{value}`                | raw value                |
| website   | strip leading `http(s)://` and trailing `/`       | original full URL            | original full URL        |
| linkedin  | `@{slug}` from `/in/{slug}` or `/company/{slug}`; if no match, fall back to stripped URL (same rule as website) | original full URL | original full URL |
| instagram | `@{handle}` — reuse the existing extraction at BatchDetail.tsx:162 (strip leading `@`, take last URL path segment) | if value starts with `http`, the value as-is; else `https://instagram.com/{handle-with-leading-@-stripped}` | same as `href` |

Display rule for the copy button: **copy always equals `copyValue`, never `display`.** The user is shielded from copying a partial handle. This is the explicit design tradeoff for option C in brainstorming.

LinkedIn handle extraction regex (informal): match `/in/([^/?#]+)` or `/company/([^/?#]+)` against the URL path; otherwise treat the value the same way `website` does.

### `other_socials`

Out of scope. `ContactIcons` does not surface this array today, so `ContactDetails` does not either. A future change can add a generic-link row per entry.

### Accessibility

- The display value is an `<a>` — keyboard focusable, visited state available, screen readers announce it as a link.
- The copy button is a `<button>` with `aria-label="Copy email"` (or appropriate channel).
- Copy-button visibility is driven by `:hover`, `:focus-within`, and `:focus` on the row, so keyboard users can reach it.
- After copy, a visible icon swap (clipboard → check) provides feedback. Add `aria-live="polite"` text "Copied" inside the button (visually hidden) so screen readers hear confirmation.

### Error handling

- `navigator.clipboard.writeText` rejects on insecure context or denied permission. Wrap in try/catch; on failure, leave icon as clipboard and log to `console.warn`. No user-facing toast in v1.
- Malformed LinkedIn URLs: handle extraction returns null → fall back to stripped-URL display. Never throws.

## Testing

- Manual: open `/tools/prospects/{batchId}`, expand a card with full contact data; verify each row's display, click action, and copy behavior.
- Manual: expand a card with only one or two channels populated; verify other rows do not render and there is no empty space.
- Manual: expand a card with `linkedin` stored as a bare URL with no `/in/` segment; verify fall-back display.
- Manual: keyboard-only — Tab through rows, confirm copy button is reachable and operable.
- No new automated tests; this is presentation-layer with no business logic beyond the `formatContact` helper. If a test scaffold exists for this file, add unit tests for `formatContact` covering each channel and the LinkedIn fall-back.

## Out of scope

- Tooltip-on-hover for collapsed `ContactIcons`.
- Edit / correct contact info inline.
- Surfacing `other_socials`.
- Layout or content changes to `ExpandedPanel`.
- Toast / global notification system for copy feedback.
