/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        // UI chrome (nav/sidebar/buttons/headings/labels/badges/tabs) — Archivo
        // stays loaded separately for Create EQ's canvas font-picker (inline
        // fontFamily styles on user-authored slide content), completely
        // decoupled from this Tailwind utility.
        display: ['"Geist"', "system-ui", "sans-serif"],
        // Reading content — body/forms/tables/chat/docs.
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"Roboto Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        // Deprecated — kept for back-compat with the handful of existing call
        // sites (AppLayout suite-switcher). Don't introduce new usages; prefer
        // `text-tiny` (11px) per the typography design system.
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],

        // ---- Typography design system (Geist/Inter, premium SaaS scale) ----
        tiny: ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0" }],           // 11px — Tiny Metadata
        caption: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0" }],          // 12px — Caption
        table: ["0.8125rem", { lineHeight: "1.35", letterSpacing: "0" }],         // 13px — Table header/rows
        body: ["0.875rem", { lineHeight: "1.5", letterSpacing: "0" }],            // 14px — Body
        input: ["0.875rem", { lineHeight: "1.45", letterSpacing: "0" }],          // 14px — Forms
        button: ["0.875rem", { lineHeight: "1", letterSpacing: "0" }],            // 14px — Buttons
        subheading: ["1rem", { lineHeight: "1.4", letterSpacing: "0" }],          // 16px — Subheading
        "card-title": ["1.125rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }], // 18px — Card Title
        section: ["1.25rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],    // 20px — Section Heading
        "page-title": ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }], // 24px — Page Title
        "app-title": ["1.875rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }], // 30px — Application Title
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        30: "7.5rem",
      },
      // Dark-premium era (superseding the flat-enterprise radius ladder) —
      // softer, more generous corners matching the Dronea/evolt reference
      // brief's rounded pill buttons and floating cards. See CLAUDE.md Brand
      // System section for the full epoch history.
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      // Every color below resolves through a CSS variable defined once in
      // index.css's `:root` (single light theme, vivid blue accent). The
      // `rgb(var(--x) / <alpha-value>)` form is the standard Tailwind
      // pattern that keeps opacity modifiers working (bg-ink/60,
      // border-white/10, etc.) — variables are stored as "R G B" triplets,
      // not hex, for exactly that reason. Nothing here is a hardcoded color;
      // edit index.css to change the actual values.
      colors: {
        bone: "rgb(var(--color-bone) / <alpha-value>)",
        ash: "rgb(var(--color-ash) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          secondary: "rgb(var(--color-ink-secondary) / <alpha-value>)",
          tertiary: "rgb(var(--color-ink-tertiary) / <alpha-value>)",
          muted: "rgb(var(--color-ink-muted) / <alpha-value>)",
          disabled: "rgb(var(--color-ink-disabled) / <alpha-value>)",
        },
        // Vivid blue accent (#0000EE) — see index.css for the actual value.
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          hover: "rgb(var(--color-accent-hover) / <alpha-value>)",
          soft: "rgb(var(--color-accent-soft) / <alpha-value>)",
          foreground: "rgb(var(--color-accent-foreground) / <alpha-value>)",
        },
        brand: {
          from: "rgb(var(--color-accent) / <alpha-value>)",
          to: "rgb(var(--color-brand-to) / <alpha-value>)",
        },
        success: { DEFAULT: "rgb(var(--color-success) / <alpha-value>)", soft: "rgb(var(--color-success) / 0.16)" },
        warning: { DEFAULT: "rgb(var(--color-warning) / <alpha-value>)", soft: "rgb(var(--color-warning) / 0.16)" },
        danger: { DEFAULT: "rgb(var(--color-danger) / <alpha-value>)", soft: "rgb(var(--color-danger) / 0.16)" },
        info: { DEFAULT: "rgb(var(--color-accent) / <alpha-value>)", soft: "rgb(var(--color-accent-soft) / <alpha-value>)" },
        // Raised panel — the token every `bg-white`-as-card-surface call site
        // is swapped to during the page sweep (works correctly in both
        // themes since it resolves through the variable).
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        surfacehover: "rgb(var(--color-surfacehover) / <alpha-value>)",
        sanguine: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          hover: "rgb(var(--color-sanguine-hover) / <alpha-value>)",
          soft: "rgb(var(--color-surfacehover) / <alpha-value>)",
        },
        neutral: {
          50: "rgb(var(--color-neutral-50) / <alpha-value>)",
          100: "rgb(var(--color-neutral-100) / <alpha-value>)",
          200: "rgb(var(--color-neutral-200) / <alpha-value>)",
          300: "rgb(var(--color-neutral-300) / <alpha-value>)",
          400: "rgb(var(--color-neutral-400) / <alpha-value>)",
          500: "rgb(var(--color-neutral-500) / <alpha-value>)",
          600: "rgb(var(--color-neutral-600) / <alpha-value>)",
          700: "rgb(var(--color-neutral-700) / <alpha-value>)",
          800: "rgb(var(--color-neutral-800) / <alpha-value>)",
          900: "rgb(var(--color-neutral-900) / <alpha-value>)",
          950: "rgb(var(--color-neutral-950) / <alpha-value>)",
        },
        // shadcn/ui primitive contract — mapped onto the tokens above so
        // components/ui/* (button, dialog, select, toast, etc.) resolve.
        border: "rgb(var(--color-line) / <alpha-value>)",
        input: "rgb(var(--color-line) / <alpha-value>)",
        ring: "rgb(var(--color-ink) / <alpha-value>)",
        background: "rgb(var(--color-bone) / <alpha-value>)",
        foreground: "rgb(var(--color-ink) / <alpha-value>)",
        primary: { DEFAULT: "rgb(var(--color-ink) / <alpha-value>)", foreground: "rgb(var(--color-bone) / <alpha-value>)" },
        secondary: { DEFAULT: "rgb(var(--color-ash) / <alpha-value>)", foreground: "rgb(var(--color-ink) / <alpha-value>)" },
        muted: { DEFAULT: "rgb(var(--color-surface) / <alpha-value>)", foreground: "rgb(var(--color-ink-muted) / <alpha-value>)" },
        popover: { DEFAULT: "rgb(var(--color-surface) / <alpha-value>)", foreground: "rgb(var(--color-ink) / <alpha-value>)" },
        destructive: { DEFAULT: "rgb(var(--color-danger) / <alpha-value>)", foreground: "#FFFFFF" },
        card: { DEFAULT: "rgb(var(--color-surface) / <alpha-value>)", foreground: "rgb(var(--color-ink) / <alpha-value>)" },
      },
      // Elevation also switches per theme via CSS variables — a black
      // shadow at light-theme opacities is invisible on a near-black dark
      // page, and a dark-theme-strength shadow would look like a heavy smudge
      // on white, so the whole shadow value (not just a color) is themed.
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        "card-lg": "var(--shadow-card-lg)",
        nav: "var(--shadow-nav)",
        modal: "var(--shadow-modal)",
        float: "var(--shadow-float)",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "fade-up": { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "fade-down": { "0%": { opacity: "0", transform: "translateY(-8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { "0%": { opacity: "0", transform: "scale(0.95)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        "slide-left": { "0%": { transform: "translateX(100%)" }, "100%": { transform: "translateX(0)" } },
        "slide-right": { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(0)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "spin-slow": { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
        "pulse-soft": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        orbit: { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
      },
      // Enterprise motion — 150-200ms, simple fade/slide, nothing bouncy.
      // Loading indicators (shimmer/spin-slow/pulse-soft) are continuous
      // state, not enter/exit transitions, so they're exempt from the
      // 150-200ms band.
      animation: {
        "fade-in": "fade-in 0.18s ease-out both",
        "fade-up": "fade-up 0.2s ease-out both",
        "fade-down": "fade-down 0.18s ease-out both",
        "scale-in": "scale-in 0.15s ease-out both",
        "slide-left": "slide-left 0.2s ease-out both",
        "slide-right": "slide-right 0.2s ease-out both",
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "spin-slow": "spin-slow 2s linear infinite",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // Hero orbit visual only — continuous decorative motion, not an
        // enter/exit transition, same exemption as shimmer/spin-slow above.
        "orbit-slow": "orbit 40s linear infinite",
        "orbit-slow-reverse": "orbit 40s linear infinite reverse",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
