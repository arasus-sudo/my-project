const PROVIDER_META = {
  retell: { label: "Retell", className: "text-neutral-600 border-neutral-300" },
  twilio_openai: { label: "Twilio + OpenAI", className: "text-blue-700 border-blue-500" },
};

export default function VoiceProviderBadge({ provider, className = "" }) {
  const meta = PROVIDER_META[provider] || PROVIDER_META.retell;
  return (
    <span className={`ui-label inline-block px-2 py-0.5 border whitespace-nowrap ${meta.className} ${className}`}>
      {meta.label}
    </span>
  );
}
