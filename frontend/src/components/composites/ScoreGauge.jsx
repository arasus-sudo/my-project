import { Check } from "../../icons";

/* ScoreGauge — docs/design-system.md §4.6.
 * Circular gauge, band-toned arc, always accompanied by a labeled band word
 * and a short evidence list — a bare number is not a complete score display
 * any more than a bare KPI is (§1.4).
 */

function bandFor(score) {
  if (score >= 80) return { tone: "success", word: "High confidence", color: "var(--color-success)" };
  if (score >= 60) return { tone: "primary", word: "Good confidence", color: "var(--color-primary)" };
  if (score >= 40) return { tone: "warning", word: "Moderate confidence", color: "var(--color-warning)" };
  return { tone: "danger", word: "Low confidence", color: "var(--color-danger)" };
}

export default function ScoreGauge({ score, size = 108, evidence = [], className = "" }) {
  const band = bandFor(score);
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-active)" strokeWidth={8} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={band.color} strokeWidth={8}
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset var(--dur-slower) var(--ease-out)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum" style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            {score}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>/100</span>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: band.color, marginTop: 8 }}>{band.word}</div>
      {evidence.length > 0 && (
        <ul className="mt-3 space-y-1.5" style={{ textAlign: "left" }}>
          {evidence.slice(0, 4).map((e, i) => (
            <li key={i} className="flex items-start gap-1.5" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              <Check size={14} strokeWidth={1.75} aria-hidden="true" style={{ color: band.color, flexShrink: 0, marginTop: 2 }} />
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
