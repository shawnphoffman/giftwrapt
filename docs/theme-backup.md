# Theme backup (pre-preset-reset)

Snapshot of `src/styles.css` theme tokens taken before applying shadcn preset `b2oWHw1Hc`.
Kept as a reference so we can re-introduce custom colors intentionally if the preset loses anything we wanted.

## `:root` (light)

```css
--background: oklch(1 0 0);
--foreground: oklch(0.141 0.005 285.823);
--card: oklch(1 0 0);
--card-foreground: oklch(0.141 0.005 285.823);
--popover: oklch(1 0 0);
--popover-foreground: oklch(0.141 0.005 285.823);
--primary: oklch(0.648 0.2 131.684);
--primary-foreground: oklch(0.986 0.031 120.757);
/* --secondary: oklch(0.967 0.001 286.375); */
/* --secondary-foreground: oklch(0.21 0.006 285.885); */
--secondary: oklch(0.21 0.006 285.885);
--secondary-foreground: oklch(0.967 0.001 286.375);
--muted: oklch(0.967 0.001 286.375);
--muted-foreground: oklch(0.552 0.016 285.938);
--accent: oklch(0.967 0.001 286.375);
--accent-foreground: oklch(0.21 0.006 285.885);
--destructive: oklch(0.577 0.245 27.325);
--destructive-foreground: oklch(0.985 0 0);
--border: oklch(0.92 0.004 286.32);
--input: oklch(0.92 0.004 286.32);
--ring: oklch(0.841 0.238 128.85);
--chart-1: oklch(0.871 0.15 154.449);
--chart-2: oklch(0.723 0.219 149.579);
--chart-3: oklch(0.627 0.194 149.214);
--chart-4: oklch(0.527 0.154 150.069);
--chart-5: oklch(0.448 0.119 151.328);
--radius: 0.625rem;
--sidebar: oklch(0.985 0 0);
--sidebar-foreground: oklch(0.141 0.005 285.823);
--sidebar-primary: oklch(0.648 0.2 131.684);
--sidebar-primary-foreground: oklch(0.986 0.031 120.757);
--sidebar-accent: oklch(0.967 0.001 286.375);
--sidebar-accent-foreground: oklch(0.21 0.006 285.885);
--sidebar-border: oklch(0.92 0.004 286.32);
--sidebar-ring: oklch(0.841 0.238 128.85);
```

## `.dark`

```css
--background: oklch(0.141 0.005 285.823);
--foreground: oklch(0.985 0 0);
--card: oklch(0.141 0.005 285.823);
--card-foreground: oklch(0.985 0 0);
--popover: oklch(0.141 0.005 285.823);
--popover-foreground: oklch(0.985 0 0);
--primary: oklch(0.63 0.17 149);
/* --primary-foreground: oklch(0.986 0.031 120.757); */
--primary-foreground: oklch(0.205 0 0);
/* --secondary: oklch(0.205 0 0); */
--secondary: oklch(0.258 0.092 26.042);
--secondary-foreground: oklch(0.922 0 0);
--muted: oklch(0.274 0.006 286.033);
--muted-foreground: oklch(0.705 0.015 286.067);
--accent: oklch(0.19 0 90);
--accent-foreground: oklch(0.985 0 0);
--destructive: oklch(0.538 0.201 29.234);
--destructive-foreground: oklch(0.985 0 0);
--border: oklch(0.274 0.006 286.033);
--input: oklch(0.274 0.006 286.033);
--ring: oklch(0.39 0.09 153);
--chart-1: oklch(0.871 0.15 154.449);
--chart-2: oklch(0.723 0.219 149.579);
--chart-3: oklch(0.627 0.194 149.214);
--chart-4: oklch(0.527 0.154 150.069);
--chart-5: oklch(0.448 0.119 151.328);
--sidebar: oklch(0.21 0.006 285.885);
--sidebar-foreground: oklch(0.985 0 0);
/* --sidebar-primary: oklch(0.768 0.233 130.85); */
--sidebar-primary: oklch(0.72 0.19 150);
--sidebar-primary-foreground: oklch(0.986 0.031 120.757);
--sidebar-accent: oklch(0.274 0.006 286.033);
--sidebar-accent-foreground: oklch(0.985 0 0);
--sidebar-border: oklch(0.274 0.006 286.033);
--sidebar-ring: oklch(0.405 0.101 131.063);
```

## Known deviations (for history)

- `--primary` was green in both light and dark (should have been neutral/brand-neutral, greens belong in accent).
- `--secondary` was inverted in light mode (dark bg, light fg) and reddish in dark mode.
- `--accent` was near-neutral, not actually used as an accent.
- `--ring` was green; the reset moves it back to neutral gray.
- All 5 `--chart-*` tokens were green hues (no series differentiation).
