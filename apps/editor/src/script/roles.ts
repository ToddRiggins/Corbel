/**
 * One color for each kind of code in a TypeScript script.
 * Change a color here and the script editor follows.
 *
 * The values are the Godot 4 dark script colors:
 * keyword, control-flow keyword, base type, function definition,
 * function call, member, string, number, symbol, and comment.
 */
export const scriptRoles = {
  plain: "#e7e5e4",
  keyword: "#ff7085",
  control: "#ff8ccc",
  type: "#42ffc2",
  className: "#8fffdc",
  functionDef: "#66e6ff",
  functionCall: "#57b3ff",
  variable: "#f4efe6",
  member: "#b7d4ef",
  string: "#ffeda1",
  number: "#a1ffe0",
  bool: "#a3a3f5",
  comment: "#8d8680",
  docComment: "#9bb0c4",
  operator: "#abc9ff",
  punctuation: "#abc9ff",
  annotation: "#ffb373",
} as const;

export type ScriptRole = keyof typeof scriptRoles;
