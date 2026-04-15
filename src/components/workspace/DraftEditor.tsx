"use client";

import { forwardRef, useImperativeHandle, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

export interface DraftEditorHandle {
  replaceRange: (from: number, to: number, text: string) => void;
  getPlainText: () => string;
  /** Append a new paragraph at the end of the document. */
  appendParagraph: (text: string) => void;
  /** True if the editor currently has a non-empty selection. */
  hasSelection: () => boolean;
  /** Replace the current selection with text. Returns false if there is no selection. */
  replaceSelection: (text: string) => boolean;
  replaceCurrentParagraph: (text: string) => void;
  appendAfterCurrentParagraph: (text: string) => void;
  insertAtEndOfCurrentParagraph: (text: string) => void;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  onRegenerateParagraph?: (selectedText: string, from: number, to: number) => void;
  onCursorChange?: (info: { paragraphText: string; hasSelection: boolean; selectionText: string }) => void;
  editable?: boolean;
}

const DraftEditor = forwardRef<DraftEditorHandle, Props>(
  ({ value, onChange, onRegenerateParagraph, onCursorChange, editable = true }, ref) => {
    const onCursorChangeRef = useRef(onCursorChange);
    useEffect(() => { onCursorChangeRef.current = onCursorChange; });

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: "Draft content will appear here..." }),
      ],
      content: value || "<p></p>",
      editable,
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML());
      },
      onSelectionUpdate: ({ editor }) => {
        const cb = onCursorChangeRef.current;
        if (!cb) return;
        const { from, to } = editor.state.selection;
        const { $from } = editor.state.selection;
        const paragraphText = $from.parent.textContent ?? "";
        const hasSelection = from !== to;
        const selectionText = hasSelection ? editor.state.doc.textBetween(from, to, " ") : "";
        cb({ paragraphText, hasSelection, selectionText });
      },
    });

    // Sync content when value changes externally (e.g. loading a different draft)
    useEffect(() => {
      if (!editor) return;
      if (editor.getHTML() !== value) {
        editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
      }
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({
      replaceRange: (from: number, to: number, text: string) => {
        // Strip any newlines that GPT may have snuck in — a regenerated
        // paragraph is always one continuous string.
        const clean = text.replace(/\n/g, " ").trim();
        editor
          ?.chain()
          .focus()
          .deleteRange({ from, to })
          .insertContentAt(from, { type: "text", text: clean })
          .run();
      },
      getPlainText: () => editor?.getText() ?? "",
      appendParagraph: (text: string) => {
        if (!editor) return;
        const end = editor.state.doc.content.size - 1;
        editor.chain().focus().insertContentAt(end, `<p>${text}</p>`).run();
      },
      hasSelection: () => {
        if (!editor) return false;
        const { from, to } = editor.state.selection;
        return from !== to;
      },
      replaceSelection: (text: string) => {
        if (!editor) return false;
        const { from, to } = editor.state.selection;
        if (from === to) return false;
        editor
          .chain()
          .focus()
          .deleteRange({ from, to })
          .insertContentAt(from, { type: "text", text })
          .run();
        return true;
      },
      replaceCurrentParagraph: (text: string) => {
        if (!editor) return;
        const { $from } = editor.state.selection;
        const start = $from.start();
        const end = $from.end();
        editor.chain().focus()
          .deleteRange({ from: start, to: end })
          .insertContentAt(start, { type: "text", text })
          .run();
      },
      appendAfterCurrentParagraph: (text: string) => {
        if (!editor) return;
        const { $from } = editor.state.selection;
        const afterPos = $from.after();
        editor.chain().focus().insertContentAt(afterPos, `<p>${text}</p>`).run();
      },
      insertAtEndOfCurrentParagraph: (text: string) => {
        if (!editor) return;
        const { $from } = editor.state.selection;
        const end = $from.end();
        editor.chain().focus().insertContentAt(end, { type: "text", text: ` ${text}` }).run();
      },
    }));

    return (
      <div className="draft-editor-wrapper border border-border rounded-[6px] bg-white overflow-hidden">
        {editable && (
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-surface flex-wrap">
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleBold().run()}
              active={editor?.isActive("bold")}
              title="Bold"
            >
              <strong>B</strong>
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              active={editor?.isActive("italic")}
              title="Italic"
            >
              <em>I</em>
            </ToolbarButton>
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor?.isActive("heading", { level: 2 })}
              title="Heading"
            >
              H2
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              active={editor?.isActive("heading", { level: 3 })}
              title="Subheading"
            >
              H3
            </ToolbarButton>
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              active={editor?.isActive("bulletList")}
              title="Bullet list"
            >
              &#8226;&#8212;
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              active={editor?.isActive("orderedList")}
              title="Numbered list"
            >
              1.
            </ToolbarButton>
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor?.can().undo()}
              title="Undo"
            >
              ↩
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor?.can().redo()}
              title="Redo"
            >
              ↪
            </ToolbarButton>
          </div>
        )}

        {editor && editable && onRegenerateParagraph && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ state }: { state: { selection: { from: number; to: number } } }) => {
              const { from, to } = state.selection;
              return from !== to;
            }}
          >
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                const { from, to } = editor.state.selection;
                const selectedText = editor.state.doc.textBetween(from, to, " ");
                onRegenerateParagraph(selectedText, from, to);
              }}
              className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded shadow-lg hover:bg-accent-hover transition-colors"
            >
              Regenerate
            </button>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} className="prose-editor" />
      </div>
    );
  }
);

DraftEditor.displayName = "DraftEditor";
export default DraftEditor;

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      disabled={disabled}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active
          ? "bg-accent text-white"
          : "text-muted hover:text-primary hover:bg-accent-light"
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}
