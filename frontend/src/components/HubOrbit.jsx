import { Workflow } from "lucide-react";

/** Live animated stand-in for the old static hero illustration — one hub
 * node with the agent roster orbiting it, connected by a dashed track.
 * Pure CSS transform animation (no canvas/JS loop): the outer ring rotates
 * via `animate-orbit-slow` and each icon counter-rotates at the same speed
 * (`animate-orbit-slow-reverse`) so the glyphs stay upright while still
 * visibly circling — the classic CSS orbit trick. Percentage-based
 * positioning means it scales with the container at any breakpoint. */
export default function HubOrbit({ agents }) {
  const radius = 36; // percent of container
  return (
    <div className="relative w-full aspect-square max-w-md mx-auto">
      <svg className="absolute inset-0 w-full h-full text-line" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1.5 3" />
      </svg>

      {/* Pulsing hub rings */}
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <div className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-accent/30 animate-pulse-soft" />
        <div className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-accent/20 animate-pulse-soft [animation-delay:0.7s]" />
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-accent text-white flex items-center justify-center shadow-card-lg">
          <Workflow size={28} strokeWidth={1.75} />
        </div>
      </div>

      <div className="absolute inset-0 animate-orbit-slow" aria-hidden="true">
        {agents.map((a, i) => {
          const angle = (2 * Math.PI * i) / agents.length - Math.PI / 2;
          const left = 50 + radius * Math.cos(angle);
          const top = 50 + radius * Math.sin(angle);
          const Icon = a.icon;
          return (
            <div key={a.name} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
              <div className="animate-orbit-slow-reverse w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-surface border border-line shadow-card flex items-center justify-center" title={a.name}>
                <Icon size={20} strokeWidth={1.75} className="text-ink-secondary" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
