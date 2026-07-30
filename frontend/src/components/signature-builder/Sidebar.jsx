import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../ui/accordion";
import { LayoutTemplate, Blocks, Palette, Plus, Sparkles, ShieldCheck } from "lucide-react";
import { BLOCK_REGISTRY } from "./blockRegistry";
import { SIGNATURE_TEMPLATES } from "./templates";
import { FONT_CHOICES } from "./renderHtml";
import AiAssistant from "./panels/AiAssistant";
import ChecksPanel from "./panels/ChecksPanel";

export default function Sidebar({ style, onStyleChange, onAddBlock, onLoadTemplate, blocks, onBlocksChange }) {
  const setStyle = (k) => (e) => onStyleChange({ ...style, [k]: e.target.value });

  return (
    <Accordion type="single" collapsible defaultValue="blocks" className="px-1">
      <AccordionItem value="templates">
        <AccordionTrigger className="px-3">
          <span className="inline-flex items-center gap-2"><LayoutTemplate size={14} /> Templates</span>
        </AccordionTrigger>
        <AccordionContent className="px-3">
          <div className="grid grid-cols-2 gap-2">
            {SIGNATURE_TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => onLoadTemplate(t)} data-testid={`sig-template-${t.id}`}
                className="border border-line rounded-xl p-2.5 text-left hover:border-ink/40 transition-colors">
                <div className="w-full h-1.5 rounded-full mb-2" style={{ background: t.style.accentColor }} />
                <div className="text-caption font-medium">{t.name}</div>
              </button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="blocks">
        <AccordionTrigger className="px-3">
          <span className="inline-flex items-center gap-2"><Blocks size={14} /> Blocks</span>
        </AccordionTrigger>
        <AccordionContent className="px-3">
          <div className="space-y-1.5">
            {Object.entries(BLOCK_REGISTRY).map(([type, def]) => {
              const Icon = def.icon;
              return (
                <button key={type} onClick={() => onAddBlock(type)} data-testid={`sig-add-${type}`}
                  className="w-full flex items-center gap-2 border border-line rounded-xl px-3 py-2 text-caption hover:border-ink/40 hover:bg-ash transition-colors">
                  <Icon size={14} className="text-ink-muted" />
                  <span className="flex-1 text-left">{def.label}</span>
                  <Plus size={12} className="text-ink-muted" />
                </button>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="style">
        <AccordionTrigger className="px-3">
          <span className="inline-flex items-center gap-2"><Palette size={14} /> Style</span>
        </AccordionTrigger>
        <AccordionContent className="px-3 space-y-3">
          <label className="block">
            <span className="text-tiny text-ink-muted">Font</span>
            <select value={style.font} onChange={setStyle("font")} className="w-full mt-1 border border-line rounded-lg px-2 py-1.5 text-caption">
              {FONT_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "primaryColor", label: "Text" },
              { key: "secondaryColor", label: "Muted" },
              { key: "accentColor", label: "Accent" },
            ].map((c) => (
              <label key={c.key} className="block">
                <span className="text-tiny text-ink-muted">{c.label}</span>
                <input type="color" value={style[c.key]} onChange={setStyle(c.key)}
                  className="w-full mt-1 h-8 border border-line rounded-lg cursor-pointer" />
              </label>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="ai">
        <AccordionTrigger className="px-3">
          <span className="inline-flex items-center gap-2"><Sparkles size={14} /> AI Assistant</span>
        </AccordionTrigger>
        <AccordionContent className="px-3">
          <AiAssistant blocks={blocks} onBlocksChange={onBlocksChange} style={style} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="checks">
        <AccordionTrigger className="px-3">
          <span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> Checks</span>
        </AccordionTrigger>
        <AccordionContent className="px-3">
          <ChecksPanel blocks={blocks} style={style} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
