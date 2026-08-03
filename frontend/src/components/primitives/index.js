/* Tier 2 primitives — docs/design-system.md §22.
 * Import from here so screens never reach past the barrel into a file. */
export { default as Button } from "./Button";
export { default as IconSquare } from "./IconSquare";
export { default as StatusPill, toneForStatus, STATUS_TONE } from "./StatusPill";
export { Spinner, Skeleton, SkeletonText, Divider, Kbd } from "./Feedback";
