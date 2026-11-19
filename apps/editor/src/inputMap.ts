/** Editor-facing Input Map types and helpers: one event spec per project.corbel.json entry. */

/** One event bound to an action, exactly what project.corbel.json stores. */
export interface InputEventSpec {
  key?: string;
  mouse_button?: number;
  /** True (default) binds the physical key position; false binds the layout key. */
  physical?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/** One Input Map action: a name, an analog deadzone, and its events. */
export interface InputActionSpec {
  action: string;
  deadzone: number;
  events: InputEventSpec[];
}

/** What the event chooser holds while it is open. */
export interface ChooserState {
  /** Index of the action being edited. */
  index: number;
  /** Event position when editing, null when adding. */
  event_at: number | null;
  /** Picked event, if any. */
  pick: InputEventSpec | null;
  /** Physical-vs-layout for key picks; Godot's "Additional Options" toggles. */
  physical: boolean;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  filter: string;
}

/** The keyboard names the chooser offers, Godot Input Map style. */
export const KEYBOARD_KEYS: string[] = [
  "Backspace", "Space", "Enter", "Escape", "Tab",
  "Insert", "Delete", "Home", "End", "PageUp", "PageDown",
  "Left", "Up", "Right", "Down",
  "Shift", "Ctrl", "Alt", "Meta",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
];

/** Mouse buttons the chooser offers, indexed like Godot's MouseButton. */
export const MOUSE_BUTTONS: Array<[string, number]> = [
  ["Left Button", 1],
  ["Right Button", 2],
  ["Middle Button", 3],
  ["Wheel Up", 4],
  ["Wheel Down", 5],
];

/** The label a bind shows in the list, Godot style: "Ctrl+Space (Physical)". */
export function event_label(event: InputEventSpec): string {
  const modifiers = [["Ctrl", event.ctrl], ["Shift", event.shift], ["Alt", event.alt], ["Meta", event.meta]]
    .filter(([, on]) => on === true)
    .map(([name]) => `${String(name).toLowerCase()}+`)
    .join("");
  if (typeof event.key === "string") {
    const kind = (event.physical ?? true) ? " (Physical)" : "";
    return `${modifiers}${event.key}${kind}`;
  }
  if (typeof event.mouse_button === "number") {
    const named = MOUSE_BUTTONS.find(([, index]) => index === event.mouse_button);
    return `${modifiers}${named?.[0] ?? "Button"}`;
  }
  return "Unconfigured";
}

/** Filters one candidate name against the chooser's search text, godot style: subsequence or substring. */
export function matches_filter(name: string, filter: string): boolean {
  if (filter.length === 0) {
    return true;
  }
  return name.toLowerCase().includes(filter.trim().toLowerCase());
}

/** Builds a spec from the chooser's pick and additional-option toggles. */
export function chooser_result(chooser: ChooserState): InputEventSpec | null {
  if (chooser.pick === null) {
    return null;
  }
  const spec: InputEventSpec = { ...chooser.pick };
  if (typeof spec.key === "string") {
    if (!chooser.physical) {
      spec.physical = false;
    }
    if (chooser.shift) {
      spec.shift = true;
    }
    if (chooser.ctrl) {
      spec.ctrl = true;
    }
    if (chooser.alt) {
      spec.alt = true;
    }
    if (chooser.meta) {
      spec.meta = true;
    }
  } else {
    delete spec.physical;
  }
  return spec;
}
