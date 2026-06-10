# Design System - yourboats

## Product Context
- **What this is:** Operations software for Squeaky Clean Boats, covering daily jobs, scheduling, customer records, invoices, payroll, complaints, and administrative review.
- **Who it's for:** Owners, managers, and employees who need to scan work quickly from a marina, office, or phone.
- **Space/industry:** Field-service operations for boat cleaning, with QuickBooks-backed billing.
- **Project type:** Authenticated web app / operations dashboard.

## Aesthetic Direction
- **Direction:** Industrial / utilitarian.
- **Decoration level:** Minimal to intentional.
- **Mood:** Calm, sturdy, and task-first. The app should feel like a dependable operations board: compact, clear, and resistant to visual clutter.
- **Reference sites:** No external research was run; this system is based on the existing product and dashboard conventions.

## Typography
- **Display/Hero:** YC-style system sans stack - crisp, plainspoken, and fast-loading.
- **Body:** `system-ui`, `Avenir Next`, `Avenir`, `Segoe UI`, `Helvetica Neue`, Arial, sans-serif.
- **UI/Labels:** Same system sans stack, semibold for controls and labels.
- **Data/Tables:** SF Mono / Consolas / Liberation Mono / Menlo fallback stack, or tabular system sans for compact numeric scan paths.
- **Code:** SF Mono / Consolas / Liberation Mono / Menlo.
- **Loading:** System fonts only; no downloaded web font required.
- **Scale:** xs 12px, sm 14px, base 16px, lg 18px, xl 20px, 2xl 24px, 3xl 30px.

## Color
- **Approach:** Balanced and operational.
- **Primary:** `hsl(201 100% 36%)` - lake blue for primary actions, active navigation, and current-day emphasis.
- **Secondary:** `hsl(210 40% 96.1%)` - clean cool neutral for secondary surfaces.
- **Neutrals:** Background `#fff`, card `#fff`, foreground `hsl(222.2 84% 4.9%)`, muted `hsl(210 40% 96.1%)`, border `hsl(214.3 31.8% 91.4%)`.
- **Semantic:** success emerald, warning amber, error coral/destructive, info sky.
- **Dark mode:** Preserve contrast first, then reduce saturation on surfaces so status colors remain meaningful.

## Spacing
- **Base unit:** 4px.
- **Density:** Compact-comfortable.
- **Scale:** 2xs 2px, xs 4px, sm 8px, md 16px, lg 24px, xl 32px, 2xl 48px, 3xl 64px.

## Layout
- **Approach:** Grid-disciplined for app pages, with compact card grids for daily operations.
- **Grid:** 1 column mobile, 2 columns tablet, 3 columns for dashboard cards where content supports it.
- **Max content width:** `max-w-screen-xl` inside the authenticated shell.
- **Border radius:** sm 4px, md 6px, lg 8px, full 9999px. Cards should stay at 8px or less.

## Motion
- **Approach:** Minimal-functional.
- **Easing:** enter ease-out, exit ease-in, move ease-in-out.
- **Duration:** micro 75ms, short 150ms, medium 250ms.
- **Interaction rules:** Buttons get immediate hover/active feedback, cards may lift slightly on hover, drag targets must visibly activate, and reduced-motion preferences must be honored.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-10 | Initial design system created | Created by design consultation from the existing yourboats operations app. |
| 2026-06-10 | Restored lake-blue primary, white background, and YC-style system fonts | User preferred the original blue/white direction and a startup-like typographic tone. |
