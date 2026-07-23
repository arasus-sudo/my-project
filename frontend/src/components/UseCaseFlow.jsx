import { useReveal } from "../lib/useReveal";

/** Replaces the old static per-use-case illustration with a real, honest
 * visual: the actual agents in the handoff, revealed one at a time as the
 * card scrolls into view (evolt.dev-style scroll-triggered fade+slide,
 * done with a plain IntersectionObserver + CSS transitions — see
 * lib/useReveal.js). Concrete product data, not decorative stock art. */
export default function UseCaseFlow({ agents, iconMap }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className="w-full">
      {agents.map((name, i) => {
        const Icon = iconMap[name];
        const isLast = i === agents.length - 1;
        return (
          <div key={name} className="flex gap-3 sm:gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center shrink-0 transition-all duration-500 ease-out ${
                  visible ? "opacity-100 translate-y-0 border-accent bg-accent-soft text-accent" : "opacity-0 translate-y-2 border-line bg-surface text-ink-muted"
                }`}
                style={{ transitionDelay: `${i * 140}ms` }}
              >
                {Icon && <Icon size={16} strokeWidth={1.75} />}
              </div>
              {!isLast && (
                <div
                  className={`w-px flex-1 min-h-[24px] sm:min-h-[28px] my-1 transition-colors duration-500 ${visible ? "bg-accent/30" : "bg-line"}`}
                  style={{ transitionDelay: `${i * 140 + 80}ms` }}
                />
              )}
            </div>
            <div
              className={`pb-5 sm:pb-6 pt-2 transition-all duration-500 ease-out ${visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}`}
              style={{ transitionDelay: `${i * 140}ms` }}
            >
              <div className="font-display font-semibold text-sm">{name}</div>
              {isLast && (
                <span className="inline-flex items-center gap-1.5 mt-1 text-tiny text-ink-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-soft" /> live handoff
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
