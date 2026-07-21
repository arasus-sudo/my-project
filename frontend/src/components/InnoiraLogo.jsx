// The wordmark asset is ~4:1 (cropped from the original square logo.png,
// which carried ~77% transparent padding and made every square-box placement
// render a tiny mark inside invisible whitespace). Sizes are heights; width
// follows the image's own aspect. variant="light" swaps in the white-text
// version for dark (bg-ink) surfaces.
export default function InnoiraLogo({ size = "md", variant = "dark", className = "" }) {
  const dims = {
    xs: "h-5",
    sm: "h-7",
    md: "h-9",
    lg: "h-12",
    xl: "h-16",
  }[size] || "h-9";

  const src = variant === "light" ? "/logo-wordmark-light.png" : "/logo-wordmark.png";

  return (
    <span className={`inline-flex items-center leading-none select-none shrink-0 ${className}`} data-testid="innoira-logo">
      <img src={src} alt="Innoira Agentic Suite" className={`${dims} w-auto object-contain`} draggable={false} />
    </span>
  );
}
