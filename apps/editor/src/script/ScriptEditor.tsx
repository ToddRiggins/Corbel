import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { scriptHighlighting, scriptKindTheme, scriptKinds } from "./highlight";
import { lookupHits, parseClassDocs, wordAt, type DocEntry, type LookupHit } from "./lookup";
import { scriptRoles as role } from "./roles";

export interface ScriptDiagnostic {
  line: number;
  column: number;
  message: string;
}

export interface ScriptEditorHandle {
  jump(line: number): void;
}

interface Props {
  text: string;
  fontSize: number;
  diagnostics: ScriptDiagnostic[];
  onChange: (text: string) => void;
}

const fontSlot = new Compartment();

interface LookupMenu {
  x: number;
  y: number;
  items: LookupHit[];
}

export const ScriptEditor = forwardRef<ScriptEditorHandle, Props>(function ScriptEditor(props, ref) {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChange = useRef(props.onChange);
  const incoming = useRef(props.text);
  const font = useRef(props.fontSize);
  const docs = useRef([] as DocEntry[]);
  const onMenu = useRef(((_event: MouseEvent) => {}) as (event: MouseEvent) => void);
  const [menu, setMenu] = useState<LookupMenu | null>(null);
  onChange.current = props.onChange;
  incoming.current = props.text;
  font.current = props.fontSize;
  onMenu.current = (event) => {
    const view = viewRef.current;
    const target = event.target;
    if (!view || !(target instanceof Element) || target.closest(".cm-gutters, .cm-tooltip, .cm-panel")) {
      return;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      return;
    }
    const line = view.state.doc.lineAt(pos);
    const hit = wordAt(line.text, line.from, pos);
    if (!hit) {
      return;
    }
    const items = lookupHits(docs.current, hit.word, hit.qualifier, view.state.doc.toString(), hit.from);
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const width = 240;
    const height = items.length * 32 + 16;
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
      items,
    });
  };

  useImperativeHandle(ref, () => ({
    jump(line: number) {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const safe = Math.max(1, Math.min(line, view.state.doc.lines));
      const row = view.state.doc.line(safe);
      view.dispatch({
        selection: { anchor: row.from },
        scrollIntoView: true,
      });
      view.focus();
    },
  }));

  useEffect(() => {
    const parent = host.current;
    if (!parent) {
      return;
    }
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: incoming.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          foldGutter(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          search({ top: true }),
          highlightSelectionMatches(),
          javascript({ typescript: true }),
          scriptHighlighting,
          scriptKinds,
          scriptKindTheme,
          autocompletion(),
          lintGutter(),
          placeholder("Open a .ts file from FileSystem."),
          EditorState.tabSize.of(2),
          fontSlot.of(scriptChrome(font.current)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    const onContext = (event: MouseEvent) => onMenu.current(event);
    view.dom.addEventListener("contextmenu", onContext);
    const loadDocs = () => {
      fetch("/class_reference.json")
        .then((response) => response.json())
        .then((data) => {
          docs.current = parseClassDocs(data);
          if (host.current) {
            host.current.dataset.docs = String(docs.current.length);
          }
        })
        .catch(() => {
          docs.current = [];
        });
    };
    loadDocs();
    return () => {
      view.dom.removeEventListener("contextmenu", onContext);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const current = view.state.doc.toString();
    if (current !== props.text) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: props.text },
      });
    }
  }, [props.text]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: fontSlot.reconfigure(scriptChrome(props.fontSize)),
    });
  }, [props.fontSize]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch(setDiagnostics(view.state, toLint(view.state, props.diagnostics)));
  }, [props.diagnostics]);

  const pickDocs = (id: string) => {
    setMenu(null);
    openDocs(id);
  };

  return (
    <div className="script-host" ref={host}>
      {menu ? <LookupPopup menu={menu} onPick={pickDocs} /> : null}
    </div>
  );
});

function LookupPopup(props: { menu: LookupMenu; onPick: (id: string) => void }) {
  return createPortal(
    <div
      className="context"
      style={{ left: props.menu.x, top: props.menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {props.menu.items.map((item) => (
        <button key={`${item.label}\0${item.id}`} type="button" onClick={() => props.onPick(item.id)}>
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function openDocs(id: string): void {
  // Member ids are "ClassName.member"; class-level ids are just the class name.
  const url = `/class_reference.html#${encodeURIComponent(id)}`;
  const win = window.open(url, "corbel-docs", "width=1200,height=860");
  win?.focus();
  try {
    if (win && win.location.hash === `#${encodeURIComponent(id)}` && "revealDocs" in win) {
      (win as Window & { revealDocs?: () => void }).revealDocs?.();
    }
  } catch {
    // The new window is still loading. Its hash scrolls on its own.
  }
}

function scriptChrome(fontSize: number) {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: `${fontSize}px`,
      backgroundColor: "#121110",
      color: role.plain,
    },
    ".cm-scroller": {
      fontFamily: "Cascadia Code, Cascadia Mono, Consolas, monospace",
      lineHeight: "1.55",
    },
    ".cm-content": { padding: "0.65rem 0 1rem", caretColor: "#f5f5f4" },
    ".cm-gutters": {
      backgroundColor: "#1a1918",
      color: role.comment,
      border: "none",
    },
    ".cm-activeLineGutter": { backgroundColor: "#2a2622", color: "#f5f5f4" },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.035)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(217, 119, 6, 0.35)",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#f5f5f4" },
    ".cm-matchingBracket": {
      backgroundColor: "rgba(66, 255, 194, 0.16)",
      outline: "1px solid #42ffc2",
    },
    ".cm-panels": {
      backgroundColor: "#1c1c1c",
      color: role.plain,
    },
    ".cm-panel.cm-search": { padding: "0.35rem 0.5rem" },
    ".cm-textfield, .cm-panel input": {
      backgroundColor: "#161616",
      color: "#f5f5f4",
      border: "1px solid #3f3f46",
      borderRadius: "6px",
    },
    ".cm-button": {
      backgroundColor: "#262626",
      color: role.plain,
      border: "1px solid #3f3f46",
      borderRadius: "6px",
    },
    ".cm-tooltip": {
      backgroundColor: "#1c1c1c",
      color: role.plain,
      border: "1px solid #2e2e2e",
      borderRadius: "8px",
    },
    ".cm-diagnosticText": { fontFamily: "Segoe UI, system-ui, sans-serif" },
    ".cm-lintRange-error": { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L3 0 L6 3' fill='none' stroke='%23f87171' stroke-width='1'/%3E%3C/svg%3E\")" },
  }, { dark: true });
}

function toLint(state: EditorState, items: ScriptDiagnostic[]): LintDiagnostic[] {
  return items.map((item) => {
    const row = state.doc.line(Math.max(1, Math.min(item.line, state.doc.lines)));
    const from = Math.min(row.to, row.from + Math.max(0, item.column - 1));
    let to = from;
    while (to < row.to && /[\w$]/.test(state.doc.sliceString(to, to + 1))) {
      to += 1;
    }
    if (to === from) {
      to = Math.min(row.to, from + 1);
    }
    return {
      from,
      to,
      severity: "error",
      message: item.message,
    };
  });
}
