import { useEffect, useCallback, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import DOMPurify from "dompurify";
import {
  Bold, Italic, List, ListOrdered, Link2, Unlink, Undo2, Redo2, Braces,
  ImagePlus, Loader2,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

export const MERGE_FIELDS = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{last_name}}", label: "Last name" },
  { token: "{{company}}", label: "Company" },
  { token: "{{title}}", label: "Title" },
  { token: "{{personalized_opener}}", label: "Opener" },
];

const ALLOWED_TAGS = ["div", "p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "a", "span", "img"];
const ALLOWED_ATTR = ["href", "target", "rel", "class", "style", "src", "alt", "width", "height"];

const ALLOWED_STYLE_PROPS = /^(margin|padding|font-family|font-size|font-weight|line-height|color|border-top|text-align|max-width)/i;
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
      onMouseDown={(e) => e.preventDefault()}
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
  const [uploading, setUploading] = useState(false);
  const internalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: sanitizeEmailHtml(value) || "",
    editorProps: {
      attributes: {
        class: "prose-email focus:outline-none min-h-[260px] px-4 py-3 text-xs leading-relaxed",
        "data-testid": "rich-editor-body",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (ed.isDestroyed) return;
      internalUpdate.current = true;
      onChange(sanitizeEmailHtml(ed.getHTML()));
    },
  });

  // Guard every editor call with isDestroyed: TipTap tears down its internal
  // ProseMirror schema on unmount, and calling getHTML()/setContent() after
  // that (e.g. a value-prop update racing a step switch or a Preview-mode
  // toggle unmounting this component) throws deep inside DOMSerializer
  // rather than failing gracefully.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (internalUpdate.current) {
      internalUpdate.current = false;
      return;
    }
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

  const insertImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await api.post("/upload-image", fd);
        editor?.chain().focus().setImage({ src: data.image_url }).run();
      } catch (err) {
        toast.error("Failed to upload image");
      } finally {
        setUploading(false);
      }
    };
    input.click();
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

        <ToolBtn testid="fmt-image" title="Insert image" onClick={insertImage}
          disabled={uploading}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
        </ToolBtn>

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
          <div className="absolute top-3 left-4 text-xs text-neutral-400 pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
