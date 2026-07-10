import { Square as SquareIcon, Circle as CircleIcon, Image as ImageIcon, MessageSquare, User as UserIcon } from "lucide-react";
import { TEMPLATES } from "../../lib/creqTemplates";
import { ICONS } from "./ElementRender";

export default function LeftPanel({ onTemplate, onAddText, onAddShape, onAddBadge, onAddIcon, onAddImage, onAddImageUrl, onAddHeadshot, hasHeadshot }) {
  return (
    <div className="p-3 space-y-4">
      <div>
        <div className="ui-label mb-2 px-1">Templates</div>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => onTemplate(t)} data-testid={`tpl-${t.id}`}
              className="rounded-lg overflow-hidden border border-line hover:border-ink transition-colors">
              <div className="aspect-[4/5] p-2 flex flex-col justify-between text-left" style={{ background: t.thumb_bg, color: t.thumb_accent }}>
                <div className="text-[8px] font-mono uppercase tracking-widest opacity-70">{t.tag}</div>
                <div className="font-display font-bold text-[11px] leading-tight">{t.name}</div>
              </div>
              <div className="p-1.5 bg-white text-[10px] text-neutral-600 text-center truncate">{t.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="ui-label mb-2 px-1">Add text</div>
        <div className="space-y-1">
          <TextPreset label="Headline" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 240, text: "Big idea here",
            font: "Archivo Black", size: 128, weight: 900, color: "text", line_height: 1, align: "left" })} sample="Aa" style={{ fontFamily: "Archivo Black", fontSize: 26 }} />
          <TextPreset label="Serif quote" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 320, text: "Your sharp thought",
            font: "Instrument Serif", size: 96, weight: 400, italic: true, color: "accent", line_height: 1.05 })} sample="Aa" style={{ fontFamily: "Instrument Serif", fontSize: 26, fontStyle: "italic" }} />
          <TextPreset label="Subheadline" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 100, text: "Supporting line",
            font: "Inter", size: 40, weight: 600, color: "text" })} sample="Aa" style={{ fontFamily: "Inter", fontSize: 22, fontWeight: 600 }} />
          <TextPreset label="Body" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 240, text: "Long-form paragraph text with balanced line height for easy reading.",
            font: "Inter", size: 28, weight: 400, color: "text", line_height: 1.4 })} sample="Ag" style={{ fontFamily: "Inter", fontSize: 18 }} />
          <TextPreset label="Caption" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 60, text: "SMALL CAPS",
            font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.24, color: "muted" })} sample="AA" style={{ fontFamily: "JetBrains Mono", fontSize: 14 }} />
        </div>
      </div>

      <div>
        <div className="ui-label mb-2 px-1">Elements</div>
        <div className="grid grid-cols-3 gap-1">
          <ElementBtn onClick={() => onAddShape("rect")} title="Rectangle"><SquareIcon size={16} /></ElementBtn>
          <ElementBtn onClick={() => onAddShape("circle")} title="Circle"><CircleIcon size={16} /></ElementBtn>
          <ElementBtn onClick={onAddBadge} title="Badge">Bdg</ElementBtn>
          {Object.keys(ICONS).map((n) => {
            const IC = ICONS[n];
            return <ElementBtn key={n} onClick={() => onAddIcon(n)} title={n}><IC size={16} /></ElementBtn>;
          })}
        </div>
      </div>

      <div>
        <div className="ui-label mb-2 px-1">Image</div>
        <div className="space-y-1.5">
          <button onClick={onAddImage} data-testid="upload-image-btn"
            className="w-full text-left p-3 rounded-lg border border-dashed border-line hover:border-ink hover:bg-neutral-50 flex items-center gap-2 text-xs">
            <ImageIcon size={14} />
            <div className="flex-1">
              <div className="font-medium">Upload from device</div>
              <div className="text-[10px] text-neutral-500">or drag &amp; drop onto canvas</div>
            </div>
          </button>
          <button onClick={onAddImageUrl} data-testid="url-image-btn"
            className="w-full text-left p-2 rounded-md border border-line hover:border-ink flex items-center gap-2 text-xs">
            <MessageSquare size={12} />
            <span className="text-neutral-700">Paste image URL</span>
          </button>
          <button onClick={onAddHeadshot} data-testid="add-headshot-btn"
            className={`w-full text-left p-2 rounded-md border flex items-center gap-2 text-xs ${hasHeadshot ? "border-line hover:border-ink" : "border-line hover:border-ink opacity-70"}`}
            title={hasHeadshot ? "Add your profile photo" : "Upload a headshot in Settings → Profile first"}>
            <UserIcon size={12} />
            <span className="text-neutral-700">Your headshot</span>
            {!hasHeadshot && <span className="ml-auto text-[9px] font-mono text-neutral-400">setup</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

function TextPreset({ label, onClick, sample, style }) {
  return (
    <button onClick={onClick} className="w-full text-left p-2 rounded-md border border-line hover:border-ink flex items-center gap-2">
      <span style={style} className="w-8 text-center">{sample}</span>
      <span className="text-xs text-neutral-700">{label}</span>
    </button>
  );
}

function ElementBtn({ children, onClick }) {
  return <button onClick={onClick} className="aspect-square rounded-md border border-line hover:border-ink flex items-center justify-center text-xs">{children}</button>;
}
