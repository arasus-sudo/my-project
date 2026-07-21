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
      // Enterprise radius ladder — 4px (stock `rounded`), 6px (stock
      // `rounded-md`), 8px (stock `rounded-lg` and `xl` below), capping at
      // 12px (`3xl`). These three keys are already the dominant radius
      // vocabulary across the whole app (buttons/cards/inputs/modals), so
      // this one change shrinks corners app-wide without per-component edits.
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.625rem",
        "3xl": "0.75rem",
      },
      colors: {
        bone: "#F5F5F7",
        ash: "#FAFAFA",
        line: "#E5E5E7",
        // Text-color hierarchy. `DEFAULT` is unchanged (#1D1D1F) so every
        // existing text-ink/bg-ink/border-ink call site keeps rendering
        // identically — the secondary/tertiary/muted/disabled steps are
        // additive, giving a real contrast hierarchy (never pure black):
        // Primary ~15.5:1, Secondary ~8.9:1, Tertiary ~5.4:1 (all WCAG AA+),
        // Muted ~3.9:1 (AA-large only — timestamps/secondary metadata, never
        // primary reading content), Disabled intentionally very subtle.
        ink: {
          DEFAULT: "#1D1D1F",
          secondary: "#48484A",
          tertiary: "#6E6E73",
          muted: "#8E8E93",
          disabled: "#D2D2D7",
        },
        // Solid brand blue — for text/border/ring/small-fill contexts where a
        // gradient can't render (e.g. `text-accent`, `ring-accent`). Actual
        // gradient buttons/fills use the `.bg-brand-gradient` class in
        // index.css (from `brand.from` to `brand.to`), not this token.
        accent: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
          soft: "#EEF2FF",
          foreground: "#FFFFFF",
        },
        brand: {
          from: "#3B82F6",
          to: "#8B5CF6",
        },
        success: { DEFAULT: "#30D158", soft: "#E8F8ED" },
        warning: { DEFAULT: "#FF9F0A", soft: "#FFF3E0" },
        danger: { DEFAULT: "#FF453A", soft: "#FFE8E6" },
        info: { DEFAULT: "#3B82F6", soft: "#EEF2FF" },
        surface: "#FFFFFF",
        surfacehover: "#F5F5F7",
        sanguine: { DEFAULT: "#1D1D1F", hover: "#000000", soft: "#F5F5F7" },
        neutral: {
          50: "#F9F9FB",
          100: "#F5F5F7",
          200: "#E5E5E7",
          300: "#D2D2D7",
          400: "#A1A1A6",
          500: "#8E8E93",
          600: "#6E6E73",
          700: "#48484A",
          800: "#363638",
          900: "#1D1D1F",
          950: "#0D0D0F",
        },
        // shadcn/ui primitive contract — mapped onto the tokens above so
        // components/ui/* (button, dialog, select, toast, etc.) resolve.
        border: "#E5E5E7",
        input: "#E5E5E7",
        ring: "#1D1D1F",
        background: "#F5F5F7",
        foreground: "#1D1D1F",
        primary: { DEFAULT: "#1D1D1F", foreground: "#FFFFFF" },
        secondary: { DEFAULT: "#FAFAFA", foreground: "#1D1D1F" },
        muted: { DEFAULT: "#F5F5F7", foreground: "#8E8E93" },
        popover: { DEFAULT: "#FFFFFF", foreground: "#1D1D1F" },
        destructive: { DEFAULT: "#FF453A", foreground: "#FFFFFF" },
        card: { DEFAULT: "#FFFFFF", foreground: "#1D1D1F" },
      },
      // Near-invisible elevation — enterprise UIs lean on borders/surface
      // contrast, not shadow depth. `card`/`card-hover`/`nav` were already
      // subtle; `card-lg`/`modal`/`float` are toned down here to match.
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        "card-hover": "0 2px 6px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.02)",
        "card-lg": "0 4px 14px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.02)",
        nav: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        modal: "0 8px 24px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)",
        float: "0 2px 10px rgba(0,0,0,0.05)",
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
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
