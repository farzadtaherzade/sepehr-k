# EVM Web App — Design Language (corporate restyle, v2)

This document governs the visual restyle. All UI edits must conform. The app is
Persian (fa-IR), fully RTL, uses the Vazirmatn font, Jalali dates with Persian
digits, and Latin digits for amounts. Do not change functionality, routes, API
calls, or component contracts — **visual style only**.

## Palette (CSS variables in globals.css — use Tailwind classes mapped below)

| Token | Value | Tailwind equivalent | Use |
|---|---|---|---|
| `navy-950` | `#081428` | — | sidebar gradient end |
| `navy-900` | `#0B1F3A` | — | sidebar base |
| `navy-800` | `#12294D` | — | sidebar hover / raised |
| `navy-700` | `#1B3A66` | — | sidebar active item |
| `primary-600` | `#1D4ED8` | `bg-blue-700` | primary buttons, active states, links |
| `primary-700` | `#1E40AF` | `hover:bg-blue-800` | primary hover |
| `primary-50` | `#EFF5FF` | `bg-blue-50` | subtle highlights, selected cells |
| `accent-teal` | `#0F766E` | `text-teal-700` | secondary accent only (charts, EVM good state) |
| `surface` | `#FFFFFF` | `bg-white` | cards, panels |
| `canvas` | `#F1F5F9` | `bg-slate-100` → use `#EEF2F7` body | app background |
| `line` | `#E2E8F0` | `border-slate-200` | borders, dividers |
| `ink-900` | `#0F172A` | `text-slate-900` | headings |
| `ink-700` | `#334155` | `text-slate-700` | body |
| `ink-500` | `#64748B` | `text-slate-500` | secondary text |
| `good` | `#059669` | emerald-600 | positive EVM states only |
| `warn` | `#D97706` | amber-600 | warning states only |
| `bad` | `#DC2626` | red-600 | negative states only |

Rules: no gradients except the login brand panel and the sidebar; color is
meaning-carrying (good/warn/bad reserved for EVM health). Primary color is
**blue-700**, never teal, for actions.

## Shape, depth, density

- Cards: `rounded-xl` (12px), `border border-slate-200`, shadow `0 1px 2px rgba(15,23,42,.05), 0 8px 24px -16px rgba(15,23,42,.18)` — defined as `.evm-card` in globals.css.
- Inputs/buttons: `rounded-lg` (8px), height 36px (h-9).
- Page padding: 24px desktop / 12px mobile. Section gap: 16px.
- Tables/grids: dense (34px rows), zebra `#F8FAFC`, header background `#F1F5F9` with `#0F172A` 12px semibold text.
- Borders over shadows for internal structure; one soft shadow per card maximum.

## Typography (Vazirmatn everywhere)

- Page title: 20px/800. Section title: 15px/700. Card title: 14px/700.
- Body/labels: 13px/500. Table cells: 12.5–13px/400–600. Micro text: 11px.
- Numbers keep Latin digits with `tabular-nums`; dates use Persian digits.

## Shell (sidebar + topbar)

- Sidebar: 232px, `bg-navy-900` (gradient to navy-950 at bottom is allowed), white text (`slate-300` idle, white active).
- Active nav item: `bg-navy-700` pill + 2px right-edge accent bar in `primary` (a `#3B82F6`-family light blue that reads on navy: use `#5B8DEF`).
- Sidebar header: app logo mark in `primary-600` rounded-lg + product name; below it an 11px `slate-400` subtitle.
- NEW topbar (content area): 56px white bar, bottom border `line`; shows current page title on the right (RTL start), user chip (avatar initials circle in `primary-50`/`primary-700` text, name + role in 11px) and logout icon button on the left (RTL end). On mobile the topbar hosts the hamburger.
- Sidebar footer user card is removed (moved to topbar).

## Components (src/components/ui.tsx)

- Button primary: `bg-blue-700 hover:bg-blue-800 text-white rounded-lg`; secondary: white + `border-slate-300` + `text-slate-700 hover:bg-slate-50`; danger: `bg-red-600 hover:bg-red-700`; ghost: `text-slate-600 hover:bg-slate-100`.
- Inputs: 1px `slate-300` border, `focus:border-blue-700 focus:ring-2 focus:ring-blue-100`.
- Badges: pill, 1px border, tinted background per tone (keep the existing tones API; retune: slate/teal/amber/red/green tints stay but align to the palette).
- Modal: `rounded-2xl`, header with bottom divider, `text-base font-bold` title, backdrop `bg-slate-900/50`.
- Tabs: active = `text-blue-800 font-semibold` with 2px `border-blue-700` underline; inactive `text-slate-500 hover:text-slate-800`.
- Stat card (dashboard): white card, right-aligned (RTL start) 13px `slate-500` label with a 36px rounded-lg icon chip (`bg-blue-50 text-blue-700`), value 26px/800 `slate-900`, delta/subtext 11px `slate-400`.

## Login

- Split screen: form column (right in RTL) on `#EEF2F7`; brand column (left) with navy gradient (`navy-900 → navy-950`), white product name, one-line value proposition in `slate-300`, and a subtle grid/chart motif drawn with CSS (no images). Brand column hidden below `lg`.
- Form card: white, `rounded-2xl`, fields per component spec, full-width primary button.

## AG Grid (grid-setup.ts)

- Theme params: accentColor `#1D4ED8`, headerBackgroundColor `#F1F5F9`, oddRow `#F8FAFC`, rowHover `#EFF5FF`, selectedRow `#DBEAFE`, borderColor `#E2E8F0`, fontFamily `inherit`, rowHeight 34, headerHeight 44, wrapperBorderRadius 12, fontSize 12.5.

## Charts (LineChart.tsx)

- Series colors: primary `#1D4ED8`, comparison `#64748B`, good `#059669`, warn `#D97706`, bad `#DC2626`, extra `#5B8DEF`. Grid lines `#E2E8F0`, axis text `#64748B` 10–11px.
