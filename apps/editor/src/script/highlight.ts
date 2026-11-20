import { syntaxHighlighting, HighlightStyle, syntaxTree, ensureSyntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { scriptRoles as role } from "./roles";

/** Maps the parser's tags onto the roles in roles.ts. */
export const scriptHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: role.keyword },
  { tag: tags.definitionKeyword, color: role.keyword },
  { tag: tags.moduleKeyword, color: role.keyword },
  { tag: tags.modifier, color: role.keyword },
  { tag: tags.controlKeyword, color: role.control },
  { tag: tags.operatorKeyword, color: role.control },
  { tag: tags.self, color: role.control },
  { tag: tags.special(tags.variableName), color: role.control },
  { tag: tags.typeName, color: role.type },
  { tag: tags.standard(tags.typeName), color: role.type },
  { tag: tags.className, color: role.className },
  { tag: tags.namespace, color: role.className },
  { tag: tags.function(tags.definition(tags.variableName)), color: role.functionDef },
  { tag: tags.function(tags.definition(tags.propertyName)), color: role.functionDef },
  { tag: tags.definition(tags.function(tags.variableName)), color: role.functionDef },
  { tag: tags.function(tags.variableName), color: role.functionCall },
  { tag: tags.function(tags.propertyName), color: role.functionCall },
  { tag: tags.propertyName, color: role.member },
  { tag: tags.definition(tags.propertyName), color: role.member },
  { tag: tags.variableName, color: role.variable },
  { tag: tags.definition(tags.variableName), color: role.variable },
  { tag: tags.local(tags.variableName), color: role.variable },
  { tag: tags.string, color: role.string },
  { tag: tags.special(tags.string), color: role.string },
  { tag: tags.regexp, color: role.string },
  { tag: tags.number, color: role.number },
  { tag: tags.bool, color: role.bool },
  { tag: tags.null, color: role.bool },
  { tag: tags.atom, color: role.bool },
  { tag: tags.comment, color: role.comment },
  { tag: tags.lineComment, color: role.comment },
  { tag: tags.blockComment, color: role.comment },
  { tag: tags.docComment, color: role.docComment },
  { tag: tags.operator, color: role.operator },
  { tag: tags.punctuation, color: role.punctuation },
  { tag: tags.bracket, color: role.punctuation },
  { tag: tags.annotation, color: role.annotation },
  { tag: tags.meta, color: role.annotation },
]);

export const scriptHighlighting = syntaxHighlighting(scriptHighlight);

const functionDefMark = Decoration.mark({ class: "cm-role-fn" });
const typeMark = Decoration.mark({ class: "cm-role-type" });
const constantMark = Decoration.mark({ class: "cm-role-const" });

/** The parser's own span can sit inside or outside these marks, so the role color wins either way. */
export const scriptKindTheme = EditorView.baseTheme({
  ".cm-role-fn, .cm-role-fn span": { color: `${role.functionDef} !important` },
  ".cm-role-type, .cm-role-type span": { color: `${role.type} !important` },
  ".cm-role-const, .cm-role-const span": { color: `${role.bool} !important` },
});

/**
 * The TypeScript parser tags a method name as a member and an imported
 * class as a variable. This pass puts those tokens in the function and
 * type roles. PascalCase is a type. ALL_CAPS is a constant. A lowercase
 * word the class reference documents (the engine's global functions,
 * like load) colors green like a class. The editor feeds documented
 * names through `setEngineGlobals`.
 * A class's own name stays in the class role.
 */
export const scriptKinds = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  tree: ReturnType<typeof syntaxTree>;

  constructor(view: EditorView) {
    this.tree = syntaxTree(view.state);
    this.decorations = kindMarks(view);
  }

  update(update: ViewUpdate) {
    const tree = syntaxTree(update.state);
    if (update.docChanged || update.viewportChanged || tree !== this.tree) {
      this.tree = tree;
      this.decorations = kindMarks(update.view);
    }
  }
}, { decorations: (value) => value.decorations });

/** Lowercase engine words the class reference documents; colored green like a class. */
const engineGlobalWords = new Set<string>(["load", "resource_cached"]);

/** The editor feeds the class reference's Globals members here after it loads. */
export function setEngineGlobals(words: Iterable<string>): void {
  for (const word of words) {
    engineGlobalWords.add(word);
  }
}

function kindMarks(view: EditorView): DecorationSet {
  const docEnd = view.state.doc.length;
  const tree = ensureSyntaxTree(view.state, docEnd, 50) ?? syntaxTree(view.state);
  const ranges = view.visibleRanges.length > 0 ? view.visibleRanges : [{ from: 0, to: docEnd }];
  const marks: Array<Range<Decoration>> = [];
  for (const { from, to } of ranges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const parent = node.node.parent?.name;
        if ((node.name === "PropertyDefinition" || node.name === "PrivatePropertyDefinition") && parent === "MethodDeclaration") {
          marks.push(functionDefMark.range(node.from, node.to));
          return false;
        }
        if (node.name !== "VariableName" && node.name !== "PropertyName" && node.name !== "VariableDefinition") {
          return;
        }
        const text = view.state.sliceDoc(node.from, node.to);
        if (!/^[A-Z]/.test(text)) {
          // A lowercase identifier the docs own (load, resource_cached) reads as engine API.
          if (engineGlobalWords.has(text)) {
            marks.push(typeMark.range(node.from, node.to));
            return false;
          }
          return;
        }
        if (node.name === "VariableDefinition" && parent === "ClassDeclaration") {
          return;
        }
        if (parent === "CallExpression" || parent === "NewExpression") {
          return;
        }
        const mark = /^[A-Z0-9_]+$/.test(text) ? constantMark : typeMark;
        marks.push(mark.range(node.from, node.to));
        return false;
      },
    });
  }
  marks.sort((a, b) => a.from - b.from || a.to - b.to);
  const unique = marks.filter((mark, index) => index === 0 || mark.from !== marks[index - 1].from);
  return Decoration.set(unique);
}
