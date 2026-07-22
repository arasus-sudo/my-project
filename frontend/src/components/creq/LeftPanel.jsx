import { memo, useState } from "react";
import { ChevronDown, Minus as LineIcon, MoveRight, ArrowLeftRight, Circle as DotIcon, Image as ImageIcon, MessageSquare, User as UserIcon } from "lucide-react";
import { TEMPLATES } from "../../lib/creqTemplates";
import { STYLES, LAYOUTS } from "../../lib/creqStyles";
import { ICONS } from "./ElementRender";
import { SHAPE_KINDS, ShapePreview } from "./shapes";
import { IMAGE_FRAMES, FRAME_CATEGORIES, DECORATIVE_PRESETS, ACCENT_ELEMENTS, DESIGN_THEMES, COMPOSITIONS } from "../../lib/creqDesignEngine";
import { BG_PRESETS } from "../../lib/creqBgStyles";
import { CHART_PRESETS, CARD_PRESETS } from "../../lib/creqCharts";

const DECORATIVE_SHAPES = ["scribble", "wavy", "zigzag", "spiral", "leaf", "teardrop", "cross", "plus", "paint-splash", "highlight"];
const SHAPE_ORDER = ["rect", "circle", ...Object.keys(SHAPE_KINDS).filter((k) => !DECORATIVE_SHAPES.includes(k))];

function LeftPanel({ onTemplate, onStyle, onLayout, onAddText, onAddShape, onAddLine, onAddBadge, onAddIcon, onAddImage, onAddImageUrl, onAddHeadshot, onAddAuthorBar, hasHeadshot, onAddCoolshape, onAddAccent, onApplyTheme, onAddFrameImage, onAddBgPreset, onAddChart, onAddCard, onAddComposition, customTemplates }) {
  const [styleAll, setStyleAll] = useState(false);
  // Accordion, one section open at a time — keeps the panel's total height
  // bounded instead of stacking every section's full content at once.
  const [open, setOpen] = useState(null);
  const toggle = (key) => setOpen((cur) => (cur === key ? null : key));

  return (
    <div className="divide-y divide-line">
      <Section title="Templates" isOpen={open === "templates"} onToggle={() => toggle("templates")}>
        <div className="grid grid-cols-2 gap-2">
          {[...(customTemplates || []), ...TEMPLATES].map((t, idx) => (
            <button key={t.id || idx} onClick={() => onTemplate(t)} data-testid={`tpl-${t.id}`}
              className="rounded-lg overflow-hidden border border-line hover:border-ink transition-colors">
              <div className="aspect-[4/5] p-2 flex flex-col justify-between text-left" style={{ background: t.thumb_bg, color: t.thumb_accent }}>
                <div className="text-[8px] font-mono uppercase tracking-widest opacity-70">{t.tag}</div>
                <div className="font-display font-bold text-[11px] leading-tight">{t.name}</div>
              </div>
              <div className="p-1.5 bg-white text-tiny text-ink-tertiary text-center truncate">{t.name}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Design themes" isOpen={open === "themes"} onToggle={() => toggle("themes")}>
        <div className="grid grid-cols-3 gap-1">
          {DESIGN_THEMES.map((th) => {
            const bgType = th.bg?.type || "solid";
            const c1 = bgType === "gradient" ? "linear-gradient(145deg, #f5f5f7, #e8e8ed)" : bgType === "mesh" ? "linear-gradient(135deg, #0A2540, #0F766E)" : "#f5f5f7";
            return (
              <button key={th.id} onClick={() => onApplyTheme(th)}
                title={th.desc}
                className="aspect-[3/2] rounded-md border border-line hover:border-ink hover:ring-1 hover:ring-ink/20 overflow-hidden relative">
                <div className="absolute inset-0" style={{ background: c1 }} />
                <div className="absolute bottom-1 left-1 right-1 flex gap-0.5">
                  <div className="h-1.5 w-1/3 rounded-sm" style={{ background: "linear-gradient(135deg, #3B82F6, #8B5CF6)" }} />
                  <div className="h-1.5 w-1/4 rounded-sm bg-white/40" />
                </div>
                <div className="absolute top-1 left-1 text-[6px] font-mono text-white/70 drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] truncate max-w-[90%] leading-tight">{th.name}</div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Styles &amp; Layouts" isOpen={open === "styles"} onToggle={() => toggle("styles")}>
        <div className="space-y-2">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="ui-label">Styles</span>
              <button onClick={() => setStyleAll(!styleAll)}
                className={`ml-auto text-tiny font-mono px-1.5 py-0.5 rounded border transition-colors ${
                  styleAll ? "border-ink bg-ink text-white" : "border-line text-ink-muted hover:border-ink"
                }`}>
                {styleAll ? "All slides" : "Current"}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {STYLES.map((st) => (
                <button key={st.id} onClick={() => onStyle(st.id, styleAll)}
                  title={st.desc}
                  className="aspect-[3/2] rounded-md border border-line hover:border-ink hover:bg-neutral-50 flex flex-col items-center justify-center gap-0.5 p-1">
                  <div className="w-full h-3/5 rounded-[2px] flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0f0f2, #e4e4e7)" }}>
                    <span className="text-[6px] font-bold text-neutral-600 leading-none">Aa</span>
                  </div>
                  <span className="text-tiny text-ink-muted truncate w-full text-center leading-tight">{st.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="ui-label mb-1.5">Layouts</div>
            <div className="grid grid-cols-4 gap-1">
              {LAYOUTS.map((lay) => {
                const lid = lay.id;
                const svg = lid === "big-number" ? "<rect x='6' y='4' width='16' height='16' rx='1' opacity='0.08'/><text x='14' y='16' text-anchor='middle' font-size='8' font-weight='bold'>86</text>" :
                  lid === "image-left" ? "<rect x='3' y='4' width='7' height='16' rx='1' opacity='0.15'/><rect x='12' y='4' width='9' height='4' rx='0.5'/><rect x='12' y='10' width='9' height='3' rx='0.5' opacity='0.5'/><rect x='12' y='15' width='9' height='2' rx='0.5' opacity='0.3'/>" :
                  lid === "image-right" ? "<rect x='14' y='4' width='7' height='16' rx='1' opacity='0.15'/><rect x='3' y='4' width='9' height='4' rx='0.5'/><rect x='3' y='10' width='9' height='3' rx='0.5' opacity='0.5'/><rect x='3' y='15' width='9' height='2' rx='0.5' opacity='0.3'/>" :
                  lid === "split" ? "<rect x='2' y='4' width='9' height='16' rx='1' opacity='0.12'/><rect x='13' y='4' width='9' height='16' rx='1' opacity='0.12'/><rect x='13' y='16' width='9' height='4' rx='0.5' opacity='0.5'/>" :
                  lid === "quote" ? "<circle cx='5' cy='5' r='2' opacity='0.15'/><rect x='9' y='3' width='12' height='4' rx='0.5'/><rect x='9' y='9' width='12' height='3' rx='0.5' opacity='0.5'/><rect x='9' y='14' width='8' height='2' rx='0.5' opacity='0.3'/>" :
                  lid === "two-column" ? "<rect x='2' y='4' width='8' height='16' rx='0.5' opacity='0.12'/><rect x='12' y='4' width='8' height='16' rx='0.5' opacity='0.12'/><rect x='12' y='16' width='8' height='4' rx='0.5' opacity='0.5'/>" :
                  lid === "checklist" ? "<rect x='3' y='3' width='4' height='4' rx='1' opacity='0.2'/><rect x='9' y='3' width='10' height='4' rx='0.5'/><rect x='3' y='9' width='4' height='4' rx='1' opacity='0.2'/><rect x='9' y='9' width='10' height='4' rx='0.5' opacity='0.7'/><rect x='3' y='15' width='4' height='4' rx='1' opacity='0.2'/><rect x='9' y='15' width='10' height='4' rx='0.5' opacity='0.5'/>" :
                  lid === "timeline" ? "<circle cx='4' cy='5' r='1.5'/><circle cx='4' cy='11' r='1.5'/><circle cx='4' cy='17' r='1.5'/><line x1='4' y1='6.5' x2='4' y2='9.5' opacity='0.2'/><line x1='4' y1='12.5' x2='4' y2='15.5' opacity='0.2'/><rect x='8' y='3' width='11' height='4' rx='0.5'/><rect x='8' y='9' width='11' height='4' rx='0.5' opacity='0.6'/><rect x='8' y='15' width='11' height='4' rx='0.5' opacity='0.3'/>" :
                  lid === "cta" ? "<rect x='3' y='3' width='18' height='3' rx='0.5'/><rect x='3' y='8' width='18' height='2' rx='0.5' opacity='0.5'/><rect x='6' y='14' width='12' height='4' rx='2' opacity='0.2'/>" :
                  lid === "three-column" ? "<rect x='1' y='4' width='6' height='16' rx='0.5' opacity='0.1'/><rect x='9' y='4' width='6' height='16' rx='0.5' opacity='0.1'/><rect x='17' y='4' width='6' height='16' rx='0.5' opacity='0.1'/>" :
                  lid === "grid" ? "<rect x='2' y='3' width='8' height='8' rx='0.5' opacity='0.15'/><rect x='14' y='3' width='8' height='8' rx='0.5' opacity='0.15'/><rect x='2' y='13' width='8' height='8' rx='0.5' opacity='0.15'/><rect x='14' y='13' width='8' height='8' rx='0.5' opacity='0.15'/>" :
                  "<rect x='3' y='3' width='18' height='18' rx='1' opacity='0.08'/>";
                return (
                  <button key={lay.id} onClick={() => onLayout(lay.id)}
                    title={lay.desc}
                    className="aspect-[3/2] rounded-md border border-line hover:border-ink hover:bg-neutral-50 flex items-center justify-center p-1">
                    <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1" dangerouslySetInnerHTML={{ __html: svg }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Backgrounds" isOpen={open === "backgrounds"} onToggle={() => toggle("backgrounds")}>
        <div className="grid grid-cols-3 gap-1">
          {BG_PRESETS.map((bp) => {
            const b = bp.bg || {};
            const previewBg = b.type === "solid" ? (b.color === "bg" ? "#f5f5f7" : b.color === "accent" ? "#3B82F6" : b.color === "muted" ? "#9ca3af" : b.color || "#f5f5f7") :
              b.type === "gradient" ? `linear-gradient(${b.angle || 145}deg, ${b.color === "bg" ? "#f5f5f7" : b.color || "#f5f5f7"}, ${b.color2 === "muted" ? "#d4d4d8" : b.color2 || "#e4e4e7"})` :
              b.type === "mesh" ? `linear-gradient(135deg, ${(b.colors || ["#0A2540","#0F766E"])[0]}, ${(b.colors || ["#0A2540","#0F766E"])[1] || "#0F766E"})` :
              b.type === "noise" ? "#e8e8ea" :
              b.type === "grid" ? "#f0f0f2" :
              b.type === "dots" ? "#f5f5f7" :
              b.type === "radial" ? `radial-gradient(circle, ${b.color === "accent" ? "#3B82F6" : b.color || "#f5f5f7"}, ${b.color2 || "#e4e4e7"})` :
              b.type === "glass" ? "linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.1))" :
              b.type === "abstract" ? "linear-gradient(135deg, #1e1b4b, #312e81)" :
              "#f5f5f7";
            return (
              <button key={bp.id} onClick={() => onAddBgPreset(bp)}
                title={bp.name}
                className="aspect-[3/2] rounded-md border border-line hover:border-ink hover:ring-1 hover:ring-ink/20 overflow-hidden relative">
                <div className="absolute inset-0" style={{ background: previewBg }} />
                <div className="absolute bottom-1 left-1 right-1 text-[6px] font-mono text-neutral-600 truncate leading-tight bg-white/60 px-1 rounded-[1px]">{bp.name}</div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Add text" isOpen={open === "text"} onToggle={() => toggle("text")}>
        <div className="space-y-1">
          <div className="ui-label mb-1">Headings</div>
          <TextPreset label="Display headline" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 240, text: "Big idea here",
            font: "Archivo Black", size: 128, weight: 900, color: "text", line_height: 1, align: "left" })} sample="Aa" style={{ fontFamily: "Archivo Black", fontSize: 26 }} />
          <TextPreset label="Serif quote" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 320, text: "Your sharp thought",
            font: "Instrument Serif", size: 96, weight: 400, italic: true, color: "accent", line_height: 1.05 })} sample="Aa" style={{ fontFamily: "Instrument Serif", fontSize: 26, fontStyle: "italic" }} />
          <TextPreset label="Subheadline" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 100, text: "Supporting line",
            font: "Inter", size: 40, weight: 600, color: "text" })} sample="Aa" style={{ fontFamily: "Inter", fontSize: 22, fontWeight: 600 }} />
          <TextPreset label="Bold condensed" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 180, text: "CONDENSED HEADLINE",
            font: "Bebas Neue", size: 120, weight: 400, color: "accent", letter_spacing: 0.04, line_height: 0.9, align: "left" })} sample="AB" style={{ fontFamily: "Bebas Neue", fontSize: 24 }} />
          <div className="ui-label mb-1 mt-2">Body</div>
          <TextPreset label="Body paragraph" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 240, text: "Long-form paragraph text with balanced line height for easy reading.",
            font: "Inter", size: 28, weight: 400, color: "text", line_height: 1.4 })} sample="Ag" style={{ fontFamily: "Inter", fontSize: 18 }} />
          <TextPreset label="Caption small" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 60, text: "SMALL CAPS",
            font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.24, color: "muted" })} sample="AA" style={{ fontFamily: "JetBrains Mono", fontSize: 14 }} />
          <div className="ui-label mb-1 mt-2">Treatments</div>
          <TextPreset label="Hero number" onClick={() => onAddText({ type: "text", x: 80, y: 200, w: 920, h: 640, text: "86",
            font: "Bebas Neue", size: 420, weight: 400, color: "accent", line_height: 0.85, align: "center" })} sample="#1" style={{ fontFamily: "Bebas Neue", fontSize: 22 }} />
          <TextPreset label="Swiss editorial" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 200, text: "Swiss typography",
            font: "Inter", size: 72, weight: 700, color: "text", letter_spacing: -0.02, line_height: 1.0, align: "left" })} sample="Aa" style={{ fontFamily: "Inter", fontSize: 22, fontWeight: 700 }} />
          <TextPreset label="Mono code" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 100, text: "import { Agent } from 'innoira'",
            font: "JetBrains Mono", size: 32, weight: 500, color: "accent", letter_spacing: 0, line_height: 1.2, align: "left" })} sample="{ }" style={{ fontFamily: "JetBrains Mono", fontSize: 16 }} />
        </div>
      </Section>

      <Section title="Elements" isOpen={open === "elements"} onToggle={() => toggle("elements")}>
        <div className="space-y-3">
          <div>
            <div className="ui-label mb-1.5">Shapes</div>
            <div className="grid grid-cols-4 gap-1">
              {SHAPE_ORDER.map((kind) => (
                <ElementBtn key={kind} onClick={() => onAddShape(kind)}
                  title={kind === "rect" ? "Rectangle" : kind === "circle" ? "Circle" : SHAPE_KINDS[kind].label}
                  testid={`add-shape-${kind}`}>
                  <ShapePreview kind={kind} size={18} />
                </ElementBtn>
              ))}
            </div>
          </div>
          <div>
            <div className="ui-label mb-1.5">Decorative strokes</div>
            <div className="grid grid-cols-4 gap-1">
              {DECORATIVE_SHAPES.map((kind) => (
                <ElementBtn key={kind} onClick={() => onAddShape(kind)}
                  title={SHAPE_KINDS[kind]?.label || kind}
                  testid={`add-shape-${kind}`}>
                  <ShapePreview kind={kind} size={18} />
                </ElementBtn>
              ))}
            </div>
          </div>
          <div>
            <div className="ui-label mb-1.5">Lines &amp; arrows</div>
            <div className="grid grid-cols-4 gap-1">
              <ElementBtn onClick={() => onAddLine()} title="Line / divider" testid="add-line"><LineIcon size={16} /></ElementBtn>
              <ElementBtn onClick={() => onAddLine({ cap_end: "arrow" })} title="Arrow" testid="add-line-arrow"><MoveRight size={16} /></ElementBtn>
              <ElementBtn onClick={() => onAddLine({ cap_start: "arrow", cap_end: "arrow" })} title="Double arrow" testid="add-line-double"><ArrowLeftRight size={16} /></ElementBtn>
              <ElementBtn onClick={() => onAddLine({ cap_start: "dot", cap_end: "dot" })} title="Dotted ends" testid="add-line-dots"><DotIcon size={10} /></ElementBtn>
            </div>
          </div>
          <div>
            <div className="ui-label mb-1.5">Badge &amp; icons</div>
            <div className="grid grid-cols-4 gap-1">
              <ElementBtn onClick={onAddBadge} title="Badge">Bdg</ElementBtn>
              {Object.keys(ICONS).map((n) => {
                const IC = ICONS[n];
                return <ElementBtn key={n} onClick={() => onAddIcon(n)} title={n}><IC size={16} /></ElementBtn>;
              })}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Image" isOpen={open === "image"} onToggle={() => toggle("image")}>
        <div className="space-y-1.5">
          <button onClick={onAddImage} data-testid="upload-image-btn"
            className="w-full text-left p-3 rounded-lg border border-dashed border-line hover:border-ink hover:bg-neutral-50 flex items-center gap-2 text-caption">
            <ImageIcon size={14} />
            <div className="flex-1">
              <div className="font-medium">Upload from device</div>
              <div className="text-tiny text-ink-muted">or drag &amp; drop onto canvas</div>
            </div>
          </button>
          <button onClick={onAddImageUrl} data-testid="url-image-btn"
            className="w-full text-left p-2 rounded-md border border-line hover:border-ink flex items-center gap-2 text-caption">
            <MessageSquare size={12} />
            <span className="text-ink-secondary">Paste image URL</span>
          </button>
          <button onClick={onAddHeadshot} data-testid="add-headshot-btn"
            className={`w-full text-left p-2 rounded-md border flex items-center gap-2 text-caption ${hasHeadshot ? "border-line hover:border-ink" : "border-line hover:border-ink opacity-70"}`}
            title={hasHeadshot ? "Add your profile photo" : "Upload a headshot in Settings → Profile first"}>
            <UserIcon size={12} />
            <span className="text-ink-secondary">Your headshot</span>
            {!hasHeadshot && <span className="ml-auto text-tiny font-mono text-ink-muted">setup</span>}
          </button>
          <button onClick={onAddAuthorBar} data-testid="add-author-bar-btn"
            className={`w-full text-left p-2 rounded-md border flex items-center gap-2 text-caption ${hasHeadshot ? "border-line hover:border-ink" : "border-line hover:border-ink opacity-70"}`}
            title={hasHeadshot ? "Headshot + name + handle, ready to post" : "Upload a headshot in Settings → Profile first"}>
            <UserIcon size={12} />
            <span className="text-ink-secondary">Author bar</span>
            {!hasHeadshot && <span className="ml-auto text-tiny font-mono text-ink-muted">setup</span>}
          </button>
        </div>
      </Section>

      <Section title="Image frames" isOpen={open === "frames"} onToggle={() => toggle("frames")}>
        <div className="space-y-3">
          {FRAME_CATEGORIES.map((cat) => {
            const frames = IMAGE_FRAMES.filter((f) => f.category === cat.key);
            if (!frames.length) return null;
            return (
              <div key={cat.key}>
                <div className="ui-label mb-1 flex items-center gap-1">
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {frames.map((f) => (
                    <button key={f.id} onClick={() => onAddFrameImage && onAddFrameImage(f.id)}
                      title={f.label}
                      className="aspect-square rounded-md border border-line hover:border-ink hover:bg-neutral-50 flex items-center justify-center p-1">
                      <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="url(#frameGrad)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        {frameSvg(f)}
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }}>
          <defs>
            <linearGradient id="frameGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
        </svg>
      </Section>

      <Section title="Decorative" isOpen={open === "decorative"} onToggle={() => toggle("decorative")}>
        <div className="grid grid-cols-4 gap-1">
          {DECORATIVE_PRESETS.map((d, i) => {
            const cat = d.type;
            const colors = ["#f87171","#fb923c","#fbbf24","#a3e635","#34d399","#38bdf8","#818cf8","#c084fc","#f472b6"];
            const c = colors[i % colors.length];
            return (
              <button key={i} onClick={() => onAddCoolshape && onAddCoolshape(d)}
                title={d.name}
                className="aspect-square rounded-md border border-line hover:border-ink hover:bg-neutral-50 flex flex-col items-center justify-center gap-0.5 p-1">
                <svg viewBox="0 0 24 24" className="w-5 h-5" style={{ color: c }}>
                  {cat === "star" && <polygon points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9" fill="currentColor" opacity="0.6" />}
                  {cat === "flower" && <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.4" />}
                  {cat === "ellipse" && <ellipse cx="12" cy="12" rx="8" ry="5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />}
                  {cat === "moon" && <path d="M12 2a10 10 0 1 0 10 10c-4 0-8-4-8-10z" fill="currentColor" opacity="0.6" />}
                  {cat === "wheel" && <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />}
                  {cat === "triangle" && <polygon points="12,3 21,20 3,20" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />}
                  {cat === "polygon" && <polygon points="12,3 20,8 20,17 12,22 4,17 4,8" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />}
                  {cat === "rectangle" && <rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />}
                  {cat === "number" && <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor" opacity="0.7">{(d.index || 0) + 1}</text>}
                  {cat === "misc" && <path d="M12 2 L12 22 M2 12 L22 12" stroke="currentColor" strokeWidth="1" opacity="0.4" />}
                </svg>
                <span className="text-tiny text-ink-muted leading-tight truncate w-full text-center">{d.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Accents" isOpen={open === "accents"} onToggle={() => toggle("accents")}>
        <div className="grid grid-cols-2 gap-1">
          {ACCENT_ELEMENTS.map((a, i) => (
            <button key={i} onClick={() => onAddAccent && onAddAccent(i)}
              title={a.name}
              className="aspect-[4/3] rounded-md border border-line hover:border-ink hover:bg-neutral-50 flex flex-col items-center justify-center gap-0.5 p-1.5">
              <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", opacity: 0.5 }}>
                {i === 0 && <div className="w-5 h-0.5 rounded bg-white" />}
                {i === 1 && <div className="w-3 h-3 bg-white" style={{ clipPath: "polygon(0 0,100% 0,0 100%)", opacity: 0.6 }} />}
                {i === 2 && <div className="w-3 h-3 bg-white" style={{ clipPath: "polygon(100% 100%,100% 0,0 100%)", opacity: 0.6 }} />}
                {(i === 3) && <span className="text-xs font-bold text-white" style={{ fontSize: 10 }}>01</span>}
                {(i === 4) && <><div className="w-1.5 h-1.5 rounded-full bg-white mx-0.5" /><div className="w-1.5 h-1.5 rounded-full bg-white mx-0.5" opacity={0.7} /><div className="w-1.5 h-1.5 rounded-full bg-white mx-0.5" opacity={0.4} /></>}
                {(i === 5) && <div className="w-4 h-4 rounded border border-white" />}
              </div>
              <span className="text-tiny text-ink-muted truncate w-full text-center leading-tight">{a.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Composition" isOpen={open === "composition"} onToggle={() => toggle("composition")}>
        <div className="grid grid-cols-2 gap-1">
          {COMPOSITIONS.map((c, i) => {
            const compSvgs = [
              <svg key={0} viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="1" opacity="0.2"/><rect x="3" y="3" width="18" height="4" rx="1"/></svg>,
              <svg key={1} viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="5" y="7" width="14" height="12" rx="2" opacity="0.3"/><rect x="5" y="7" width="14" height="12" rx="2"/></svg>,
              <svg key={2} viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><polygon points="0,0 24,0 24,10 0,24" opacity="0.2"/><polygon points="0,0 24,0 24,10 0,24" strokeWidth="1.5"/></svg>,
              <svg key={3} viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="2" width="20" height="20" rx="1"/><rect x="4" y="4" width="16" height="16" rx="1" opacity="0.3"/><rect x="6" y="6" width="12" height="12" rx="1" opacity="0.2"/></svg>,
              <svg key={4} viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="4" y="4" width="16" height="16" rx="1" opacity="0.2"/><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/></svg>,
              <svg key={5} viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" opacity="0.15"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
              <svg key={6} viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="6" width="20" height="12" rx="1"/><circle cx="12" cy="12" r="3"/></svg>,
              <svg key={7} viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="4" y="4" width="7" height="16" rx="1"/><rect x="13" y="8" width="7" height="12" rx="1"/></svg>,
            ];
            return (
              <button key={i} onClick={() => onAddComposition && onAddComposition(i)}
                title={c.name}
                className="flex items-center gap-2 p-1.5 rounded border border-line hover:border-ink hover:bg-neutral-50 text-left leading-tight">
                <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-ink-muted">
                  {compSvgs[i % compSvgs.length]}
                </div>
                <span className="text-tiny text-ink-secondary">{c.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Charts" isOpen={open === "charts"} onToggle={() => toggle("charts")}>
        <div className="grid grid-cols-2 gap-1">
          {CHART_PRESETS.map((c, i) => {
            const chartSvg = () => {
              const ct = c.chart_type;
              if (ct === "pie" || ct === "donut") return <svg viewBox="0 0 24 24" className="w-5 h-5"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.15"/><path d="M12 4 A8 8 0 0 1 20 12 L12 12 Z" fill="currentColor" opacity="0.5"/><path d="M12 12 A8 8 0 0 1 4 12 L12 12 Z" fill="currentColor" opacity="0.25"/></svg>;
              if (ct === "line" || ct === "area") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,18 7,12 12,15 17,6 21,9"/></svg>;
              if (ct === "hbar") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="6" y="4" width="14" height="3" rx="1" fill="currentColor" opacity="0.5"/><rect x="10" y="10" width="10" height="3" rx="1" fill="currentColor" opacity="0.5"/><rect x="3" y="16" width="17" height="3" rx="1" fill="currentColor" opacity="0.5"/></svg>;
              if (ct === "stacked-bar") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"><rect x="4" y="6" width="4" height="6" opacity="0.4"/><rect x="4" y="12" width="4" height="5" opacity="0.2"/><rect x="10" y="3" width="4" height="9" opacity="0.4"/><rect x="10" y="12" width="4" height="5" opacity="0.2"/><rect x="16" y="8" width="4" height="7" opacity="0.4"/><rect x="16" y="15" width="4" height="2" opacity="0.2"/></svg>;
              if (ct === "funnel") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"><polygon points="3,6 21,6 17,12 7,12" opacity="0.5"/><polygon points="5,12 19,12 15,18 9,18" opacity="0.3"/></svg>;
              if (c.type === "kpi") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"><rect x="4" y="6" width="16" height="12" rx="2" opacity="0.2"/><text x="12" y="14" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">86%</text></svg>;
              if (c.type === "progress") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"><rect x="2" y="9" width="20" height="6" rx="3" opacity="0.15"/><rect x="2" y="9" width="14" height="6" rx="3" opacity="0.5"/></svg>;
              if (c.type === "timeline") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"><circle cx="5" cy="6" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="5" cy="18" r="2"/><line x1="5" y1="8" x2="5" y2="10"/><line x1="5" y1="14" x2="5" y2="16"/><rect x="10" y="4" width="10" height="4" rx="1" opacity="0.2"/><rect x="10" y="10" width="10" height="4" rx="1" opacity="0.2"/><rect x="10" y="16" width="10" height="4" rx="1" opacity="0.2"/></svg>;
              return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="12" width="3" height="8" rx="1"/><rect x="9" y="8" width="3" height="12" rx="1"/><rect x="14" y="4" width="3" height="16" rx="1"/><rect x="19" y="10" width="3" height="10" rx="1"/></svg>;
            };
            return (
              <button key={i} onClick={() => onAddChart && onAddChart(c)}
                title={c.name}
                className="flex items-center gap-2 p-1.5 rounded border border-line hover:border-ink hover:bg-neutral-50 text-left leading-tight">
                <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-ink-muted">
                  {chartSvg()}
                </div>
                <span className="text-tiny text-ink-secondary">{c.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Cards" isOpen={open === "cards"} onToggle={() => toggle("cards")}>
        <div className="grid grid-cols-2 gap-1">
          {CARD_PRESETS.map((c, i) => {
            const cardSvg = () => {
              if (c.card_style === "glass") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.2" opacity="0.3"/><rect x="3" y="5" width="18" height="14" rx="3" fill="currentColor" opacity="0.08"/></svg>;
              if (c.card_style === "elevated") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none"><rect x="3" y="4" width="18" height="15" rx="2" stroke="currentColor" strokeWidth="0.5" opacity="0.15"/><rect x="4" y="3" width="18" height="15" rx="2" fill="currentColor" opacity="0.06"/><rect x="3" y="4" width="18" height="15" rx="2" fill="currentColor" opacity="0.1"/></svg>;
              if (c.card_style === "bento") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>;
              if (c.card_style === "dashboard") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="5" width="18" height="14" rx="2" opacity="0.2"/><text x="12" y="13" textAnchor="middle" fontSize="6" fontWeight="bold" fill="currentColor">99%</text></svg>;
              if (c.card_style === "split") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none"><polygon points="3,5 21,5 21,19 3,19" fill="currentColor" opacity="0.08"/><polygon points="3,5 21,19 3,19" fill="currentColor" opacity="0.1"/></svg>;
              if (c.card_style === "timeline") return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="5" width="18" height="14" rx="2" opacity="0.15"/><line x1="3" y1="10" x2="21" y2="10" opacity="0.2"/><circle cx="6" cy="7" r="1.5"/><text x="9" y="9" fontSize="3" fill="currentColor">Q1</text></svg>;
              return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="5" width="18" height="14" rx="2" opacity="0.15"/><line x1="3" y1="10" x2="21" y2="10" opacity="0.2"/></svg>;
            };
            return (
              <button key={i} onClick={() => onAddCard && onAddCard(c)}
                title={c.name}
                className="flex items-center gap-2 p-1.5 rounded border border-line hover:border-ink hover:bg-neutral-50 text-left leading-tight">
                <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-ink-muted">
                  {cardSvg()}
                </div>
                <span className="text-tiny text-ink-secondary">{c.name}</span>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

export default memo(LeftPanel);

/** Convert an IMAGE_FRAME definition into an SVG element for the thumbnail. */
function frameSvg(f) {
  if (f.mockup === "browser") return <><rect x="3" y="3" width="18" height="18" rx="2" opacity="0.12"/><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="5" y="5" width="3" height="3" rx="1.5" opacity="0.3"/><rect x="9" y="5" width="3" height="3" rx="1.5" opacity="0.3"/><rect x="13" y="5" width="3" height="3" rx="1.5" opacity="0.3"/></>;
  if (f.mockup === "polaroid") return <><rect x="2" y="2" width="20" height="20" rx="1.5" fill="currentColor" opacity="0.06"/><rect x="2" y="2" width="20" height="20" rx="1.5" opacity="0.5"/><rect x="4" y="3" width="16" height="12" rx="0.5" opacity="0.2"/></>;
  if (f.mockup === "filmstrip") return <><rect x="2" y="6" width="20" height="13" rx="1" fill="currentColor" opacity="0.08"/><rect x="2" y="6" width="20" height="13" rx="1" opacity="0.4"/><circle cx="4" cy="4" r="1"/><circle cx="8" cy="4" r="1"/><circle cx="12" cy="4" r="1"/><circle cx="16" cy="4" r="1"/><circle cx="20" cy="4" r="1"/><circle cx="4" cy="21" r="1"/><circle cx="8" cy="21" r="1"/><circle cx="12" cy="21" r="1"/><circle cx="16" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></>;

  // Use clipExtra if present (e.g. half-circle)
  const clip = f.clipExtra || f.clip;

  if (clip === "circle(50%)") return <circle cx="12" cy="12" r="10"/>;
  if (clip === "ellipse(50% 50%)") return <ellipse cx="12" cy="12" rx="10" ry="8"/>;

  // Polygon-based clips
  if (clip?.startsWith("polygon(")) {
    const pts = clip.replace("polygon(", "").replace(")", "").split(",").map((s) => {
      const [x, y] = s.trim().split(/\s+/);
      return `${+(x?.replace("%","")||0) * 0.24},${+(y?.replace("%","")||0) * 0.24}`;
    }).join(" ");
    return <polygon points={pts} />;
  }

  // Path-based clips
  if (clip?.startsWith("path(")) {
    const d = clip.replace(/^path\(['"]/, "").replace(/['"]\)$/, "");
    const scaled = d.replace(/(\d+(?:\.\d+)?)/g, (m) => (+m * 0.24).toFixed(1));
    return <path d={scaled} />;
  }

  // Fallback: rounded rect based on radius
  const r = Math.min(12, (f.radius || 0) / 4);
  return <rect x="1" y="1" width="22" height="22" rx={r} />;
}

/** One collapsible accordion row — header always visible, content bounded
 * to a max height with its own scroll so no single section can push the
 * panel taller than the viewport. */
function Section({ title, isOpen, onToggle, children }) {
  return (
    <div>
      <button onClick={onToggle} data-testid={`leftpanel-section-${title.toLowerCase().replace(/\s+/g, "-")}`}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surfacehover transition-colors">
        <span className="ui-label">{title}</span>
        <ChevronDown size={14} className={`text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="px-3 pb-3 max-h-[360px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

function TextPreset({ label, onClick, sample, style }) {
  return (
    <button onClick={onClick} className="w-full text-left p-2 rounded-md border border-line hover:border-ink flex items-center gap-2">
      <span style={style} className="w-8 text-center">{sample}</span>
      <span className="text-caption text-ink-secondary">{label}</span>
    </button>
  );
}

function ElementBtn({ children, onClick, title, testid }) {
  return <button onClick={onClick} title={title} data-testid={testid} className="aspect-square rounded-md border border-line hover:border-ink flex items-center justify-center text-caption">{children}</button>;
}
