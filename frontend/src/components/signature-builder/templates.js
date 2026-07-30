// Starter presets — a handful of well-designed starting points, not a
// template marketplace. Each is just a {blocks, style} pair; picking one
// loads it into the builder and the user edits from there.

const block = (type, data, visible = true) => ({ id: `${type}_${Math.random().toString(36).slice(2, 8)}`, type, visible, data });
const contactRow = (kind, value) => ({ id: `c_${Math.random().toString(36).slice(2, 8)}`, kind, label: "", value, link: "" });
const social = (network, url) => ({ id: `s_${Math.random().toString(36).slice(2, 8)}`, network, url, label: "" });

const baseStyle = {
  font: "Arial", fontSizeBase: 13,
  primaryColor: "#111111", secondaryColor: "#6b7280", accentColor: "#3B82F6",
  mutedColor: "#9ca3af", dividerColor: "#e5e7eb",
};

export const SIGNATURE_TEMPLATES = [
  {
    id: "minimal",
    name: "Minimal",
    style: { ...baseStyle },
    blocks: [
      block("identity", { name: "Jordan Lee", title: "Account Executive", department: "", company: "Acme Inc." }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "jordan@acme.com"), contactRow("phone", "+1 555 010 0100")] }),
      block("social", { items: [social("linkedin", "https://linkedin.com/in/jordanlee")] }),
    ],
  },
  {
    id: "classic",
    name: "Classic",
    style: { ...baseStyle, font: "Segoe UI", accentColor: "#1D4ED8" },
    blocks: [
      block("photo", { imageUrl: "", shape: "circle", size: 80 }),
      block("identity", { name: "Priya Sharma", title: "Customer Success Manager", department: "", company: "Acme Inc." }),
      block("tagline", { text: "Here to help you get the most out of Acme." }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "priya@acme.com"), contactRow("mobile", "+1 555 010 0101"), contactRow("website", "acme.com")] }),
      block("social", { items: [social("linkedin", "https://linkedin.com/in/priyasharma"), social("twitter", "https://twitter.com/priyasharma")] }),
    ],
  },
  {
    id: "corporate",
    name: "Corporate",
    style: { ...baseStyle, font: "Helvetica Neue", primaryColor: "#1f2937", accentColor: "#374151" },
    blocks: [
      block("photo", { imageUrl: "", shape: "square", size: 72 }),
      block("identity", { name: "Michael Chen", title: "VP, Finance", department: "Finance", company: "Acme Corporation" }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "michael.chen@acme.com"), contactRow("phone", "+1 555 010 0102"), contactRow("website", "acme.com")] }),
      block("legal", { html: "<p>This email and any attachments are confidential and intended solely for the addressee.</p>" }),
    ],
  },
  {
    id: "modern",
    name: "Modern",
    style: { ...baseStyle, font: "Segoe UI", accentColor: "#6D28D9" },
    blocks: [
      block("identity", { name: "Sam Rivera", title: "Product Marketing Lead", department: "", company: "Acme Inc." }),
      block("tagline", { text: "Building the future of outbound." }),
      block("social", { items: [social("linkedin", "https://linkedin.com/in/samrivera"), social("instagram", "https://instagram.com/acme")] }),
      block("cta", { label: "Visit our site", url: "https://acme.com", style: "outline" }),
    ],
  },
  {
    id: "executive",
    name: "Executive",
    style: { ...baseStyle, font: "Georgia", primaryColor: "#111827", secondaryColor: "#4b5563", accentColor: "#92400E" },
    blocks: [
      block("photo", { imageUrl: "", shape: "rounded", size: 88 }),
      block("identity", { name: "Alexandra Wright", title: "Chief Executive Officer", department: "", company: "Acme Inc." }),
      block("divider", { style: "dashed" }),
      block("contact", { rows: [contactRow("email", "alexandra@acme.com"), contactRow("phone", "+1 555 010 0103")] }),
      block("social", { items: [social("linkedin", "https://linkedin.com/in/alexandrawright")] }),
      block("legal", { html: "<p>Please consider the environment before printing this email.</p>" }),
    ],
  },
  {
    id: "startup",
    name: "Startup",
    style: { ...baseStyle, font: "Trebuchet MS", accentColor: "#EA580C" },
    blocks: [
      block("identity", { name: "Taylor Brooks", title: "Founder & CEO", department: "", company: "Nimbus" }),
      block("tagline", { text: "Shipping fast, thinking big 🚀" }),
      block("cta", { label: "Book a demo", url: "https://nimbus.io/demo", style: "filled" }),
      block("social", { items: [social("twitter", "https://twitter.com/nimbus"), social("linkedin", "https://linkedin.com/company/nimbus")] }),
    ],
  },
  {
    id: "sales",
    name: "Sales",
    style: { ...baseStyle, accentColor: "#0D9488" },
    blocks: [
      block("photo", { imageUrl: "", shape: "circle", size: 80 }),
      block("identity", { name: "Chris Patel", title: "Enterprise Account Executive", department: "Sales", company: "Acme Inc." }),
      block("tagline", { text: "Let's find the right fit for your team." }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "chris@acme.com"), contactRow("mobile", "+1 555 010 0104")] }),
      block("cta", { label: "Book a meeting", url: "https://acme.com/meet/chris", style: "filled" }),
      block("social", { items: [social("linkedin", "https://linkedin.com/in/chrispatel")] }),
    ],
  },
  {
    id: "cto",
    name: "CTO",
    style: { ...baseStyle, font: "Segoe UI", primaryColor: "#0f172a", accentColor: "#0EA5E9" },
    blocks: [
      block("photo", { imageUrl: "", shape: "square", size: 76 }),
      block("identity", { name: "Devon Okafor", title: "Chief Technology Officer", department: "Engineering", company: "Acme Inc." }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "devon@acme.com")] }),
      block("social", { items: [social("github", "https://github.com/devonokafor"), social("linkedin", "https://linkedin.com/in/devonokafor")] }),
    ],
  },
  {
    id: "founder",
    name: "Founder",
    style: { ...baseStyle, font: "Trebuchet MS", accentColor: "#7C3AED" },
    blocks: [
      block("identity", { name: "Riley Kim", title: "Co-Founder", department: "", company: "Nimbus" }),
      block("tagline", { text: "Building the tools we wished we had." }),
      block("contact", { rows: [contactRow("email", "riley@nimbus.io")] }),
      block("cta", { label: "Book a call", url: "https://nimbus.io/call", style: "outline" }),
      block("social", { items: [social("twitter", "https://twitter.com/rileykim"), social("linkedin", "https://linkedin.com/in/rileykim")] }),
    ],
  },
  {
    id: "hr",
    name: "HR",
    style: { ...baseStyle, font: "Verdana", accentColor: "#DB2777" },
    blocks: [
      block("photo", { imageUrl: "", shape: "circle", size: 80 }),
      block("identity", { name: "Morgan Ellis", title: "Head of People", department: "Human Resources", company: "Acme Inc." }),
      block("tagline", { text: "Here to help with anything people-related." }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "morgan@acme.com"), contactRow("phone", "+1 555 010 0110")] }),
    ],
  },
  {
    id: "legal",
    name: "Legal",
    style: { ...baseStyle, font: "Georgia", primaryColor: "#1c1917", accentColor: "#57534e" },
    blocks: [
      block("identity", { name: "Harper Lin", title: "General Counsel", department: "Legal", company: "Acme Corporation" }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "harper.lin@acme.com"), contactRow("phone", "+1 555 010 0111")] }),
      block("legal", {
        html: "<p>This communication is confidential and may be legally privileged. If you are not the intended recipient, please notify the sender and delete this message.</p>",
      }),
    ],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    style: { ...baseStyle, font: "Tahoma", accentColor: "#0891B2" },
    blocks: [
      block("photo", { imageUrl: "", shape: "circle", size: 80 }),
      block("identity", { name: "Dr. Amara Okoye", title: "Clinical Director", department: "", company: "Acme Health" }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "amara.okoye@acmehealth.com"), contactRow("phone", "+1 555 010 0112")] }),
      block("legal", {
        html: "<p>This email may contain confidential patient health information protected by law. If received in error, please delete and notify the sender.</p>",
      }),
    ],
  },
  {
    id: "government",
    name: "Government",
    style: { ...baseStyle, font: "Arial", primaryColor: "#1e293b", accentColor: "#334155" },
    blocks: [
      block("identity", { name: "Jordan Marsh", title: "Program Director", department: "Office of Public Affairs", company: "City of Acme" }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "jmarsh@acmegov.org"), contactRow("phone", "+1 555 010 0113"), contactRow("website", "acmegov.org")] }),
      block("legal", { html: "<p>This is an official communication from the City of Acme. Please consider the environment before printing.</p>" }),
    ],
  },
  {
    id: "education",
    name: "Education",
    style: { ...baseStyle, font: "Verdana", accentColor: "#B45309" },
    blocks: [
      block("photo", { imageUrl: "", shape: "circle", size: 76 }),
      block("identity", { name: "Prof. Ines Dubois", title: "Associate Professor", department: "Department of Computer Science", company: "Acme University" }),
      block("divider", { style: "dashed" }),
      block("contact", { rows: [contactRow("email", "idubois@acme.edu"), contactRow("website", "acme.edu/~idubois")] }),
    ],
  },
  {
    id: "creative",
    name: "Creative",
    style: { ...baseStyle, font: "Trebuchet MS", primaryColor: "#18181b", accentColor: "#F43F5E" },
    blocks: [
      block("photo", { imageUrl: "", shape: "rounded", size: 88 }),
      block("identity", { name: "Nova Reyes", title: "Creative Director", department: "", company: "Studio Nova" }),
      block("tagline", { text: "Design that moves people." }),
      block("social", { items: [social("instagram", "https://instagram.com/studionova"), social("linkedin", "https://linkedin.com/in/novareyes")] }),
      block("cta", { label: "View portfolio", url: "https://studionova.co", style: "outline" }),
    ],
  },
  {
    id: "consulting",
    name: "Consulting",
    style: { ...baseStyle, font: "Helvetica Neue", primaryColor: "#111827", accentColor: "#1D4ED8" },
    blocks: [
      block("photo", { imageUrl: "", shape: "square", size: 76 }),
      block("identity", { name: "Elliot Wren", title: "Senior Consultant", department: "Strategy", company: "Acme Advisory" }),
      block("divider", { style: "solid" }),
      block("contact", { rows: [contactRow("email", "elliot.wren@acmeadvisory.com"), contactRow("mobile", "+1 555 010 0114")] }),
      block("social", { items: [social("linkedin", "https://linkedin.com/in/elliotwren")] }),
      block("legal", { html: "<p>This email and any attachments are confidential and intended solely for the addressee.</p>" }),
    ],
  },
];

export const blankTemplate = () => ({
  style: { ...baseStyle },
  blocks: [
    block("identity", { name: "", title: "", department: "", company: "" }),
    block("contact", { rows: [] }),
  ],
});
