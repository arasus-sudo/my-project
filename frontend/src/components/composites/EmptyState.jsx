import { SearchX } from "../../icons";
import IconSquare from "../primitives/IconSquare";
import Button from "../primitives/Button";

/* EmptyState — docs/design-system.md §4.4.
 * Two distinct variants, not one component with a filtered flag treated as
 * an afterthought: "no data yet" gets a create CTA, "filtered to zero" gets
 * a clear-filters action and MUST NOT show the create CTA (spec is explicit).
 */

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className = "" }) {
  return (
    <div className={`flex flex-col items-center text-center mx-auto ${className}`} style={{ maxWidth: 360, padding: "48px 0" }}>
      <IconSquare icon={Icon} tone="neutral" size={56} className="mb-4" />
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{title}</div>
      {description && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: "20px" }}>{description}</div>
      )}
      {actionLabel && (
        <Button variant="primary" size="md" onClick={onAction} className="mt-5">{actionLabel}</Button>
      )}
    </div>
  );
}

export function EmptyFilteredState({ query, onClear, className = "" }) {
  return (
    <div className={`flex flex-col items-center text-center mx-auto ${className}`} style={{ maxWidth: 360, padding: "48px 0" }}>
      <IconSquare icon={SearchX} tone="neutral" size={44} className="mb-4" />
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
        {query ? `No results for "${query}"` : "No results"}
      </div>
      <Button variant="secondary" size="md" onClick={onClear} className="mt-5">Clear filters</Button>
    </div>
  );
}
