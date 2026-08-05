import { Check } from "../../icons";

/* Stepper (onboarding) — docs/design-system.md §8.4. */

export default function Stepper({ steps, currentIndex, className = "" }) {
  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((label, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={label} className="flex items-center" style={{ flex: i < steps.length - 1 ? 1 : "0 0 auto" }}>
            <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
              <span className="inline-grid place-items-center" style={{
                width: 22, height: 22, borderRadius: "var(--radius-full)",
                background: done || current ? "var(--color-primary)" : "var(--bg-active)",
                color: done || current ? "#FFFFFF" : "var(--text-tertiary)",
                fontSize: 11, fontWeight: 600,
              }}>
                {done ? <Check size={12} strokeWidth={2} aria-hidden="true" /> : i + 1}
              </span>
              <span className="truncate" style={{
                fontSize: 11, marginTop: 6, maxWidth: 96, textAlign: "center",
                color: current ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: current ? 500 : 400,
              }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? "var(--color-primary)" : "var(--border-default)", margin: "0 8px 18px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StepperVertical({ steps, currentIndex, className = "" }) {
  const pct = steps.length > 1 ? Math.round((currentIndex / (steps.length - 1)) * 100) : 0;
  return (
    <div className={className}>
      {steps.map((label, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={label} className="flex items-start gap-3" style={{ paddingBottom: i < steps.length - 1 ? 20 : 0, position: "relative" }}>
            {i < steps.length - 1 && (
              <div style={{ position: "absolute", left: 10, top: 22, bottom: 0, width: 1, background: done ? "var(--color-primary)" : "var(--border-default)" }} />
            )}
            <span className="inline-grid place-items-center shrink-0" style={{
              width: 22, height: 22, borderRadius: "var(--radius-full)", zIndex: 1,
              background: done || current ? "var(--color-primary)" : "var(--bg-active)",
              color: done || current ? "#FFFFFF" : "var(--text-tertiary)", fontSize: 11, fontWeight: 600,
            }}>
              {done ? <Check size={12} strokeWidth={2} aria-hidden="true" /> : i + 1}
            </span>
            <span style={{ fontSize: 13, color: current ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: current ? 500 : 400, marginTop: 2 }}>
              {label}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between" style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
        <span>{currentIndex + 1} of {steps.length} completed</span>
        <span className="tnum">{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: "var(--radius-full)", background: "var(--bg-active)", marginTop: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: "var(--radius-full)", background: "var(--color-primary)" }} />
      </div>
    </div>
  );
}
