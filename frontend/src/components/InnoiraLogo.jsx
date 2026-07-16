export default function InnoiraLogo({ size = "md", className = "" }) {
  const dims = {
    xs: "h-10 w-10",
    sm: "h-14 w-14",
    md: "h-20 w-20",
    lg: "h-28 w-28",
    xl: "h-40 w-40",
  }[size] || "h-20 w-20";

  return (
    <span className={`inline-flex items-center justify-center leading-none select-none shrink-0 ${className}`} data-testid="innoira-logo">
      <img src="/logo.png" alt="Innoira" className={`${dims} object-contain`} draggable={false} />
    </span>
  );
}
