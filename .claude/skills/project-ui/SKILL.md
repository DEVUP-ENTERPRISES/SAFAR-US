---
name: project-ui
description: CatoDrive UI standard. Use for ANY change to a screen, component, chart, table, form or style in frontend/, admin-web/, host-web/, partner-web/, catodrive-asset-ioc/, insurance-web/ or the mobile web views — tokens, kit components, the four-state rule, charts, performance, responsive and accessibility rules, and the pre-merge checklist.
---

# CatoDrive UI standard

All six web apps share one design system. `frontend/src` is imported as `@/` by every app; each app's own code is `~/`. Change shared things once, in `frontend/`.

## Tokens — the only source of colour, size and radius

- Defined in `frontend/src/styles/globals.css` (CSS variables, light + `.dark`), mapped in `frontend/tailwind.config.ts`.
- Colour classes: `bg-background` (page), `bg-card` (cards), `bg-subtle` / `bg-muted` (wells, table heads, inputs), `border-border`, `text-foreground` (ink), `text-muted-foreground`, `primary` (brand teal), `success`, `warning`, `destructive`, `ink`. Charts: `hsl(var(--chart-1..5))` via `SERIES` in `components/ui/charts.tsx`.
- Never use raw palette classes (`amber-600`, `emerald-500`, `gray-…`) or hex/rgb in components. Gold rating stars are the one exception.
- Contrast: text at least 4.5:1. Light-mode `--primary` is 26% lightness and `--warning` 34% for that reason; do not lighten them.
- Type: body Instrument Sans (`font-sans`), headings Archivo (`font-display`/`.display`). Scale only: `text-xs` 12, `text-label` 13, `text-sm` 14, `text-base` 16, `text-xl` 20, `text-2xl` 24, `text-3xl` 32. Labels 12–13 semibold, body 14, page title 24 bold (PageHeader). No `text-[11px]`-style one-offs.
- Numbers: `tabular-nums` on every metric, money and number column.
- Spacing: 4 px grid only (`1 2 3 4 6 8 12` → 4/8/12/16/24/32/48). Use `gap-*` on flex/grid, not margins between siblings.
- Radius (`--radius` 12 px): inputs and small buttons `rounded-sm` (8), cards / panels / tables `rounded-lg` (12), pills `rounded-full`. Not `rounded-2xl` or `rounded-[2rem]`.
- Shadows only on floating things (menus, dialogs, toasts, popovers). Cards are flat with a border.

## Kit — `frontend/src/components/ui/` and `frontend/src/features/admin/`

| Need | Use |
|---|---|
| Page title + subtitle + actions | `PageHeader` |
| Panel | `Card` / `CardHeader` / `CardTitle` / `CardContent` |
| One number | `StatTile` (label 13, value 24 tabular; `href` makes it a link; `tone`/`emphasis` for queues) |
| Any list of records | `DataTable` (`features/admin/components/data-table.tsx`) |
| Server-paged admin list | `useAdminList(path, filters)` (`features/admin/hooks/use-admin-list.ts`) → pass `rows`, `isLoading`, `isError`, `onRetry`, `paging` to `DataTable` |
| Card-style list that still pages | `Pager` from `data-table.tsx` |
| Search box | `useDebouncedValue(value)` (`lib/utils/use-debounced-value.ts`, 300 ms) before it reaches a query key |
| Form field | `Field` (label above, hint, error under) + `Input` / `Select` / `Textarea` |
| Button | `Button` variants `primary`, `secondary`, `outline`, `ghost`, `destructive`; `loading` prop |
| Status | `Badge` tones |
| Filters | `Chip`; page tabs `TabBar` / `useTabParam` (`features/admin/components/page-tabs.tsx`) |
| Confirm / destructive action | `useConfirm()` |
| Feedback | `useToast()` |
| States | `Skeleton`, `EmptyState`, `ErrorState` (`components/ui/states.tsx`) |
| Phone menu | `NavSheet` (`components/layout/nav-sheet.tsx`) |

`DataTable` columns: `numeric` (right-aligned, tabular), `sortValue` (sortable header), `hideOnMobile`. Below `sm` it renders a card list, never a sideways table.

## The four-state rule

Every screen or panel that loads data shows all four:
1. **Loading** — `Skeleton` shaped like the content (rows, tiles, chart), never a bare spinner.
2. **Empty** — `EmptyState`: what this is and the one action to take. Distinguish "none yet" from "nothing matches your filter".
3. **Error** — `ErrorState` with a plain sentence and `retry`. A failed load must never look like an empty list.
4. **Success.**

Per-row actions show their spinner only on the row being changed (`mutation.variables`).

## Charts — `frontend/src/components/ui/charts.tsx`

- Use `BarChart`, `LineChart`, `Donut` (5 parts or fewer), `Sparkline`. No other chart library.
- The card title states the question: "Bookings per day, last 14 days", not "Bookings".
- Bars start at zero with light gridlines and short axis values; the brand colour is the main series; values formatted (`currency` prop or `format`); hover and keyboard focus show the value.
- All-zero or no data shows the built-in empty state. Never fake, sample or placeholder numbers — if an API does not exist, show the empty state and say so.

## Performance

- Lists that can pass 50 rows are paged on the server (admin APIs return `meta.total` or a cursor; max 50 per request). Never fetch "limit: 500" — the server caps it.
- If a screen truly needs everything (e.g. a picker), page through it like `adminApi.allVehicles`.
- React Query keys include every filter; `placeholderData: keepPreviousData` for paging; invalidate by the list key (`['admin-list', path]`).
- Memoise heavy tables and charts; images lazy with fixed dimensions; no layout shift.
- The app shell (sidebar, header) lives in layouts and must not unmount on navigation.

## Responsive and accessible

- Check 375, 768, 1280 and 1440 px. The page never scrolls sideways; grids/flex children that hold charts or long text need `min-w-0`.
- On phones: stat tiles two per row, tables become cards, header actions wrap to full width.
- Every control reachable by keyboard with a visible focus ring; `aria-label` on icon-only buttons; Escape closes dialogs; errors use `role="alert"`.

## Pre-merge checklist

- [ ] Spacing on the 4 px grid; fields aligned; primary action bottom-right of forms.
- [ ] No raw palette colours, hex, or one-off pixel sizes; radius and type from the scale.
- [ ] Loading, empty, error and success states all present; error has Retry.
- [ ] Lists page on the server; search debounced; numbers right-aligned and tabular.
- [ ] Charts: title is a question, zero baseline, formatted values, real empty state, no fake data.
- [ ] Checked at 375 / 768 / 1280 / 1440 px with no sideways scroll.
- [ ] `npx tsc --noEmit -p .` passes in every app touched (and `npm run build` where the app's dev server is not running).
- [ ] Behaviour and API calls unchanged unless the change was asked for.
- [ ] Code comments: one line, only when the reason is not obvious.
