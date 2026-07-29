// Original, single-color illustrations for CreateEQ — NOT sourced from unDraw
// (there's no reliable, fetchable static-asset API for it, and reusing brand
// assets without verified access would be dishonest). Each is a small React
// SVG component in the same flat, monochrome, recolorable style unDraw made
// popular: one `color` prop, varying fill-opacity per shape for depth, so it
// tints cleanly to any deck's accent color. Registered as the "illustration"
// icon-set in creqIconSets.js and rendered through the same icon-element path
// as every other icon set — no new element type, no static file serving.

const S = (props) => ({ viewBox: "0 0 200 200", width: props.width, height: props.height, fill: "none", xmlns: "http://www.w3.org/2000/svg" });

function Teamwork(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <circle cx="70" cy="70" r="22" fill={c} fillOpacity="0.9" />
      <circle cx="130" cy="70" r="22" fill={c} fillOpacity="0.6" />
      <path d="M40 150c0-24 18-38 30-38s30 14 30 38" fill={c} fillOpacity="0.9" />
      <path d="M100 150c0-24 18-38 30-38s30 14 30 38" fill={c} fillOpacity="0.6" />
      <circle cx="155" cy="45" r="14" fill={c} fillOpacity="0.3" />
      <path d="M140 40h30l-6 14h-18z" fill={c} fillOpacity="0.3" />
    </svg>
  );
}

function Handshake(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <rect x="20" y="90" width="55" height="30" rx="8" fill={c} fillOpacity="0.5" />
      <rect x="125" y="90" width="55" height="30" rx="8" fill={c} fillOpacity="0.5" />
      <path d="M75 100l20-8 20 8 20-8 15 6-15 14-20-6-20 8-20-8z" fill={c} fillOpacity="0.9" />
      <circle cx="100" cy="60" r="16" fill={c} fillOpacity="0.3" />
    </svg>
  );
}

function GrowthChart(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <rect x="30" y="130" width="24" height="40" rx="3" fill={c} fillOpacity="0.4" />
      <rect x="70" y="105" width="24" height="65" rx="3" fill={c} fillOpacity="0.6" />
      <rect x="110" y="75" width="24" height="95" rx="3" fill={c} fillOpacity="0.8" />
      <rect x="150" y="45" width="24" height="125" rx="3" fill={c} fillOpacity="1" />
      <path d="M30 100l40-25 40 15 60-50" stroke={c} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M150 40h20v20" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function Dashboard(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <rect x="25" y="35" width="150" height="130" rx="10" fill={c} fillOpacity="0.12" />
      <rect x="40" y="50" width="55" height="35" rx="4" fill={c} fillOpacity="0.7" />
      <rect x="105" y="50" width="55" height="35" rx="4" fill={c} fillOpacity="0.4" />
      <path d="M40 140l25-20 20 12 30-28 45 16" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ShieldLock(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <path d="M100 30l60 22v45c0 40-26 65-60 78-34-13-60-38-60-78V52z" fill={c} fillOpacity="0.25" />
      <path d="M100 30l60 22v45c0 40-26 65-60 78-34-13-60-38-60-78V52z" stroke={c} strokeWidth="4" fill="none" />
      <rect x="78" y="98" width="44" height="34" rx="6" fill={c} fillOpacity="0.9" />
      <path d="M86 98v-14a14 14 0 0128 0v14" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function SecureCloud(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <path d="M60 130a30 30 0 01-6-59 40 40 0 0178-8 26 26 0 01-4 67z" fill={c} fillOpacity="0.35" />
      <rect x="85" y="115" width="30" height="24" rx="5" fill={c} fillOpacity="0.9" />
      <path d="M91 115v-9a9 9 0 0118 0v9" stroke={c} strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function RocketLaunchIllustration(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <path d="M100 20c22 14 32 42 28 78l-28 14-28-14c-4-36 6-64 28-78z" fill={c} fillOpacity="0.85" />
      <circle cx="100" cy="60" r="12" fill={c} fillOpacity="0.3" />
      <path d="M72 98l-20 30 26-6z" fill={c} fillOpacity="0.5" />
      <path d="M128 98l20 30-26-6z" fill={c} fillOpacity="0.5" />
      <path d="M92 112l-10 40 18-14 18 14-10-40z" fill={c} fillOpacity="0.6" />
    </svg>
  );
}

function TrendUpIllustration(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <path d="M30 150l35-40 30 20 50-60 25 15" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M140 60h30v30" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="65" cy="110" r="7" fill={c} fillOpacity="0.8" />
      <circle cx="95" cy="130" r="7" fill={c} fillOpacity="0.8" />
    </svg>
  );
}

function CloudSync(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <path d="M55 120a28 28 0 01-4-55 38 38 0 0174-6 24 24 0 01-6 61z" fill={c} fillOpacity="0.3" />
      <path d="M85 100a20 20 0 0130-8m10 8a20 20 0 01-30 8" stroke={c} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M112 87l3 5-6 1M118 107l-3-5 6-1" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ServerStack(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <rect x="45" y="40" width="110" height="34" rx="6" fill={c} fillOpacity="0.9" />
      <rect x="45" y="83" width="110" height="34" rx="6" fill={c} fillOpacity="0.6" />
      <rect x="45" y="126" width="110" height="34" rx="6" fill={c} fillOpacity="0.35" />
      <circle cx="62" cy="57" r="4" fill="#fff" />
      <circle cx="62" cy="100" r="4" fill="#fff" />
      <circle cx="62" cy="143" r="4" fill="#fff" />
    </svg>
  );
}

function IdeaLightbulb(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <circle cx="100" cy="80" r="42" fill={c} fillOpacity="0.3" />
      <path d="M82 118h36v14a6 6 0 01-6 6H88a6 6 0 01-6-6z" fill={c} fillOpacity="0.9" />
      <path d="M100 20v14M50 45l10 10M150 45l-10 10M35 90h14M151 90h14" stroke={c} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarSchedule(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <rect x="35" y="45" width="130" height="110" rx="10" fill={c} fillOpacity="0.15" />
      <rect x="35" y="45" width="130" height="30" rx="10" fill={c} fillOpacity="0.9" />
      <rect x="55" y="30" width="8" height="24" rx="4" fill={c} />
      <rect x="137" y="30" width="8" height="24" rx="4" fill={c} />
      <path d="M65 115l18 18 35-40" stroke={c} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function AutomationFlow(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <circle cx="45" cy="60" r="16" fill={c} fillOpacity="0.9" />
      <circle cx="100" cy="140" r="16" fill={c} fillOpacity="0.6" />
      <circle cx="155" cy="60" r="16" fill={c} fillOpacity="0.9" />
      <path d="M58 70l30 55M142 70l-30 55" stroke={c} strokeWidth="4" fill="none" />
      <path d="M61 60h78" stroke={c} strokeWidth="4" fill="none" strokeDasharray="6 6" />
    </svg>
  );
}

function ChatCommunication(props) {
  const c = props.color;
  return (
    <svg {...S(props)}>
      <path d="M35 55h95a12 12 0 0112 12v40a12 12 0 01-12 12H90l-25 22v-22H35a12 12 0 01-12-12V67a12 12 0 0112-12z" fill={c} fillOpacity="0.85" />
      <path d="M100 85h65a10 10 0 0110 10v30a10 10 0 01-10 10h-8v18l-20-18h-37a10 10 0 01-10-10v-8" fill={c} fillOpacity="0.35" />
    </svg>
  );
}

export const ILLUSTRATIONS = [
  { name: "Teamwork", category: "Teamwork", Component: Teamwork },
  { name: "Handshake", category: "Teamwork", Component: Handshake },
  { name: "GrowthChart", category: "Analytics", Component: GrowthChart },
  { name: "Dashboard", category: "Analytics", Component: Dashboard },
  { name: "ShieldLock", category: "Security", Component: ShieldLock },
  { name: "SecureCloud", category: "Security", Component: SecureCloud },
  { name: "RocketLaunch", category: "Growth", Component: RocketLaunchIllustration },
  { name: "TrendUp", category: "Growth", Component: TrendUpIllustration },
  { name: "CloudSync", category: "Cloud & Tech", Component: CloudSync },
  { name: "ServerStack", category: "Cloud & Tech", Component: ServerStack },
  { name: "IdeaLightbulb", category: "General", Component: IdeaLightbulb },
  { name: "CalendarSchedule", category: "General", Component: CalendarSchedule },
  { name: "AutomationFlow", category: "AI & Automation", Component: AutomationFlow },
  { name: "ChatCommunication", category: "AI & Automation", Component: ChatCommunication },
];

export const ILLUSTRATION_CATEGORIES = [...new Set(ILLUSTRATIONS.map((i) => i.category))];
