import { useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import DOMPurify from "dompurify";
import {
  Bold, Italic, List, ListOrdered, Link2, Unlink, Undo2, Redo2, Braces,
} from "lucide-react";

/** The merge fields the sender substitutes at send time (see sender._render). */
export const MERGE_FIELDS = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{last_name}}", label: "Last name" },
  { token: "{{company}}", label: "Company" },
  { token: "{{title}}", label: "Title" },
  { token: "{{personalized_opener}}", label: "Opener" },
];

/** We now store and send HTML, so this is the XSS boundary. Everything is
 *  sanitized on the way in AND on the way out — a draft can arrive from the LLM,
 *  from a paste, or from the database, and none of those are trusted. */
const ALLOWED_TAGS = ["div", "p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "a", "span"];
const ALLOWED_ATTR = ["href", "target", "rel", "class", "style"];

// `style` is required so the draft chain's inline-styled typography (real font
// stack, line-height, paragraph spacing — see draft_chain.to_html) survives
// loading into the editor. DOMPurify doesn't restrict style *properties* by
// default once the attribute is allowed, so a property allowlist runs as a
// second layer: it can only ever narrow a style attribute, never widen one, and
// it's inert against anything that isn't a `style` value in the first place.
// Registered once at module load — sanitizeEmailHtml runs on every keystroke,
// and DOMPurify hooks are global, so adding it per-call would stack duplicates.
const ALLOWED_STYLE_PROPS = /^(margin|padding|font-family|font-size|font-weight|line-height|color|border-top|text-align)/i;
DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (data.attrName !== "style") return;
  data.attrValue = data.attrValue
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => {
      const prop = decl.split(":")[0]?.trim();
      return prop && ALLOWED_STYLE_PROPS.test(prop);
    })
    .join("; ");
});

export function sanitizeEmailHtml(html) {
  return DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block javascript:/data: URLs in links outright.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\{\{)/i,
  });
}

function ToolBtn({ active, disabled, onClick, title, children, testid }) {
  return (
    <button
      type="button"
      title={title}
      data-testid={testid}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}   // don't steal the selection
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-30 ${
        active ? "bg-ink text-white" : "text-neutral-600 hover:bg-surfacehover"
      }`}
    >
      {children}
    </button>
  );
}

export default function RichEmailEditor({ value, onChange, placeholder = "Write your email…" }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,       // headings in a cold email look like a newsletter
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: sanitizeEmailHtml(value) || "",
    editorProps: {
      attributes: {
        class: "prose-email focus:outline-none min-h-[260px] px-4 py-3 text-sm leading-relaxed",
        "data-testid": "rich-editor-body",
      },
    },
    onUpdate: ({ editor: ed }) => onChange(sanitizeEmailHtml(ed.getHTML())),
  });

  // Sync external changes (e.g. the AI draft chain replacing the body) without
  // clobbering what the user is typing.
  useEffect(() => {
    if (!editor) return;
    const incoming = sanitizeEmailHtml(value) || "";
    if (incoming !== editor.getHTML()) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertField = useCallback((token) => {
    editor?.chain().focus().insertContent(token).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-line rounded-xl overflow-hidden bg-white" data-testid="rich-editor">
      <div className="flex items-center gap-0.5 border-b border-line px-2 py-1.5 flex-wrap">
        <ToolBtn testid="fmt-bold" title="Bold" active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></ToolBtn>
        <ToolBtn testid="fmt-italic" title="Italic" active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolBtn>

        <span className="w-px h-4 bg-line mx-1" />

        <ToolBtn testid="fmt-bullets" title="Bullet list" active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></ToolBtn>
        <ToolBtn testid="fmt-numbers" title="Numbered list" active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></ToolBtn>

        <span className="w-px h-4 bg-line mx-1" />

        <ToolBtn testid="fmt-link" title="Add link" active={editor.isActive("link")}
          onClick={addLink}><Link2 size={14} /></ToolBtn>
        <ToolBtn testid="fmt-unlink" title="Remove link" disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}><Unlink size={14} /></ToolBtn>

        <span className="w-px h-4 bg-line mx-1" />

        <ToolBtn testid="fmt-undo" title="Undo" disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}><Undo2 size={14} /></ToolBtn>
        <ToolBtn testid="fmt-redo" title="Redo" disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}><Redo2 size={14} /></ToolBtn>

        <div className="ml-auto flex items-center gap-1">
          <Braces size={12} className="text-neutral-400" />
          {MERGE_FIELDS.map((f) => (
            <button
              key={f.token}
              type="button"
              title={`Insert ${f.label}`}
              data-testid={`insert-${f.token.replace(/[{}]/g, "")}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertField(f.token)}
              className="kbd hover:bg-ink hover:text-white transition-colors"
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <EditorContent editor={editor} />
        {editor.isEmpty && (
          <div className="absolute top-3 left-4 text-sm text-neutral-400 pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
