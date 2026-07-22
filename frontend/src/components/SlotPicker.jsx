import { useMemo } from "react";

/** Open slots grouped by day. Shared by the public booking page and the guest's
 *  reschedule page so both offer times identically.
 *
 *  Slots arrive as ISO strings carrying the host's UTC offset; `new Date()` then
 *  renders them in the *visitor's* local zone, which is what a guest expects to see.
 */
export default function SlotPicker({ slots, onPick, emptyMessage = "No open slots right now — check back soon." }) {
  const byDay = useMemo(() => {
    const groups = {};
    for (const iso of slots || []) {
      const day = iso.slice(0, 10);
      (groups[day] = groups[day] || []).push(iso);
    }
    return groups;
  }, [slots]);

  const days = Object.entries(byDay);
  if (!days.length) return <p className="text-sm text-neutral-500">{emptyMessage}</p>;

  return (
    <div className="space-y-4">
      {days.map(([day, times]) => (
        <div key={day}>
          <div className="ui-label mb-2">
            {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "long", month: "short", day: "numeric",
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {times.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                data-testid={`slot-${s}`}
                className="border border-line px-3 py-1.5 rounded-sm text-sm hover:border-ink hover:bg-surfacehover transition-colors duration-150"
              >
                {new Date(s).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** "Add to calendar" — a Google Calendar template link. Works without any OAuth,
 *  and is the fallback for guests whose mail client ignored the .ics attachment. */
export function googleCalendarUrl({ title, start, end, details = "", location = "" }) {
  const fmt = (iso) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
