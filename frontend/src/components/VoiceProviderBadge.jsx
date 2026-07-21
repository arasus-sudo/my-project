export default function VoiceProviderBadge({ className = "" }) {
  return (
    <span className={`ui-label inline-block px-2 py-0.5 border text-info border-info whitespace-nowrap ${className}`}>
      Twilio + OpenAI
    </span>
  );
}
