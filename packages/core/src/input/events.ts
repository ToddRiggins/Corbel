import { Vector2 } from "../math/vector2.js";

/**
 * Godot 4 `@GlobalScope.Key`. Values match Godot; letters and digits are ASCII
 * uppercase, specials start at `KEY_SPECIAL = 4194304`.
 */
export const Key = {
  NONE: 0,
  SPECIAL: 4194304,
  ESCAPE: 4194305,
  TAB: 4194306,
  BACKSPACE: 4194308,
  ENTER: 4194309,
  KP_ENTER: 4194310,
  INSERT: 4194311,
  DELETE: 4194312,
  HOME: 4194317,
  END: 4194318,
  LEFT: 4194319,
  UP: 4194320,
  RIGHT: 4194321,
  DOWN: 4194322,
  PAGEUP: 4194323,
  PAGEDOWN: 4194324,
  SHIFT: 4194325,
  CTRL: 4194326,
  META: 4194327,
  ALT: 4194328,
  F1: 4194332,
  F2: 4194333,
  F3: 4194334,
  F4: 4194335,
  F5: 4194336,
  F6: 4194337,
  F7: 4194338,
  F8: 4194339,
  F9: 4194340,
  F10: 4194341,
  F11: 4194342,
  F12: 4194343,
  A: 65,
  B: 66,
  C: 67,
  D: 68,
  E: 69,
  F: 70,
  G: 71,
  H: 72,
  I: 73,
  J: 74,
  K: 75,
  L: 76,
  M: 77,
  N: 78,
  O: 79,
  P: 80,
  Q: 81,
  R: 82,
  S: 83,
  T: 84,
  U: 85,
  V: 86,
  W: 87,
  X: 88,
  Y: 89,
  Z: 90,
  "0": 48,
  "1": 49,
  "2": 50,
  "3": 51,
  "4": 52,
  "5": 53,
  "6": 54,
  "7": 55,
  "8": 56,
  "9": 57,
  SPACE: 32,
} as const;
export type Key = number;

/** Godot 4 `@GlobalScope.MouseButton` (the buttons the foundation uses). */
export const MouseButton = {
  NONE: 0,
  LEFT: 1,
  RIGHT: 2,
  MIDDLE: 3,
  WHEEL_UP: 4,
  WHEEL_DOWN: 5,
} as const;
export type MouseButton = number;

/** Base class for input events passed to `Node._input`. */
export abstract class InputEvent {
  /** Modifier state. `null` means "this event does not say"; binds treat null as "any". */
  shift_pressed: boolean | null = null;
  ctrl_pressed: boolean | null = null;
  alt_pressed: boolean | null = null;
  meta_pressed: boolean | null = null;

  abstract is_pressed(): boolean;
}

export class InputEventKey extends InputEvent {
  /** Layout-dependent code, like a typed character key. */
  readonly key_code: Key;
  /** Position on the US QWERTY keyboard, independent of the layout. */
  readonly physical_key_code: Key;
  /**
   * Which code a bind was stored against: true matches the physical
   * position, false the layout key, and null (a plain event) either.
   */
  physical: boolean | null;
  readonly pressed: boolean;
  readonly echo: boolean;
  readonly unicode: string;

  constructor(key_code: Key, pressed: boolean, options: { physical?: Key; physical_bind?: boolean | null; echo?: boolean; unicode?: string; shift?: boolean | null; ctrl?: boolean | null; alt?: boolean | null; meta?: boolean | null } = {}) {
    super();
    this.key_code = key_code;
    this.physical_key_code = options.physical ?? key_code;
    this.physical = options.physical_bind ?? null;
    this.pressed = pressed;
    this.echo = options.echo ?? false;
    this.unicode = options.unicode ?? "";
    this.shift_pressed = options.shift ?? null;
    this.ctrl_pressed = options.ctrl ?? null;
    this.alt_pressed = options.alt ?? null;
    this.meta_pressed = options.meta ?? null;
  }

  is_pressed(): boolean {
    return this.pressed;
  }

  /** True for auto-repeat keydowns. Actions usually ignore them. */
  is_echo(): boolean {
    return this.echo;
  }
}

export class InputEventMouseButton extends InputEvent {
  readonly button_index: MouseButton;
  readonly pressed: boolean;
  /** Pointer position over the canvas, CSS pixels from the top-left. */
  readonly position: Vector2;

  constructor(button_index: MouseButton, pressed: boolean, position: Vector2, options: { shift?: boolean | null; ctrl?: boolean | null; alt?: boolean | null; meta?: boolean | null } = {}) {
    super();
    this.button_index = button_index;
    this.pressed = pressed;
    this.position = position;
    this.shift_pressed = options.shift ?? null;
    this.ctrl_pressed = options.ctrl ?? null;
    this.alt_pressed = options.alt ?? null;
    this.meta_pressed = options.meta ?? null;
  }

  is_pressed(): boolean {
    return this.pressed;
  }
}

export class InputEventMouseMotion extends InputEvent {
  /** Pointer position over the canvas, CSS pixels from the top-left. */
  readonly position: Vector2;
  /** Movement since the previous motion event. */
  readonly relative: Vector2;

  constructor(position: Vector2, relative: Vector2, options: { shift?: boolean | null; ctrl?: boolean | null; alt?: boolean | null; meta?: boolean | null } = {}) {
    super();
    this.position = position;
    this.relative = relative;
    this.shift_pressed = options.shift ?? null;
    this.ctrl_pressed = options.ctrl ?? null;
    this.alt_pressed = options.alt ?? null;
    this.meta_pressed = options.meta ?? null;
  }

  /** Motion is always "released"; it has no pressed state. */
  is_pressed(): boolean {
    return false;
  }
}

/** A named action event, sent by code: `InputEventAction.new()` in Godot. */
export class InputEventAction extends InputEvent {
  readonly action: string;
  readonly pressed: boolean;
  readonly strength: number;

  constructor(action: string, pressed: boolean, strength = 1.0) {
    super();
    this.action = action;
    this.pressed = pressed;
    this.strength = strength;
  }

  is_pressed(): boolean {
    return this.pressed;
  }
}

const CODE_TO_KEY: Record<string, number> = {
  Space: Key.SPACE,
  Escape: Key.ESCAPE,
  Tab: Key.TAB,
  Backspace: Key.BACKSPACE,
  Delete: Key.DELETE,
  Enter: Key.ENTER,
  ArrowLeft: Key.LEFT,
  ArrowUp: Key.UP,
  ArrowRight: Key.RIGHT,
  ArrowDown: Key.DOWN,
  ShiftLeft: Key.SHIFT,
  ShiftRight: Key.SHIFT,
  ControlLeft: Key.CTRL,
  ControlRight: Key.CTRL,
  MetaLeft: Key.META,
  MetaRight: Key.META,
  AltLeft: Key.ALT,
  AltRight: Key.ALT,
};

/** One keyboard key spec: `"Space"`, `"W"`, `"ArrowUp"`, `"F5"`. Modifiers unset (null) match any. */
export function key_event(pressed: boolean, name: string, options: { echo?: boolean } = {}): InputEventKey {
  return new InputEventKey(key_from_name(name), pressed, options);
}

/** Maps a project-settings key name (`"W"`, `"Space"`) to Godot's Key value. */
export function key_from_name(name: string): Key {
  if (name.length === 0) {
    throw new Error(`Key name "${name}" is empty.`);
  }
  const named = CODE_TO_KEY[name];
  if (named !== undefined) {
    return named;
  }
  if (name.length === 1) {
    const upper = name.toUpperCase();
    const code = upper.charCodeAt(0);
    if ((code >= 65 && code <= 90) || (code >= 48 && code <= 57)) {
      return code;
    }
    return code; // punctuation keys share their ASCII value in Godot.
  }
  if (/^F(1[0-2]|[1-9])$/.test(name)) {
    return Key.F1 + Number(name.slice(1)) - 1;
  }
  throw new Error(`Unknown key name "${name}".`);
}

/**
 * The project-settings name for a layout-dependent key: what `event.key`
 * says on this machine, so on AZERTY the key typing "a" binds as "A".
 */
export function key_name_from_layout(event: KeyboardEvent): string {
  const key = event.key;
  if (key.length === 1) {
    return key.toUpperCase();
  }
  const named: Record<string, string> = {
    Space: "Space",
    Backspace: "Backspace",
    Enter: "Enter",
    Tab: "Tab",
    Escape: "Escape",
    Insert: "Insert",
    Delete: "Delete",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Shift: "Shift",
    Control: "Ctrl",
    Alt: "Alt",
    Meta: "Meta",
  };
  const special = named[key];
  if (special !== undefined) {
    return special;
  }
  const arrows: Record<string, string> = {
    ArrowLeft: "Left",
    ArrowUp: "Up",
    ArrowRight: "Right",
    ArrowDown: "Down",
  };
  if (arrows[key] !== undefined) {
    return arrows[key];
  }
  if (/^F\d+$/.test(key)) {
    return key;
  }
  return key;
}

/** The project-settings name for the physical key position a DOM event pressed (from `event.code`). */
export function key_name_from_dom(event: KeyboardEvent): string {
  if (event.code.startsWith("Key")) {
    return event.code.slice(3);
  }
  if (event.code.startsWith("Digit")) {
    return event.code.slice(5);
  }
  const named: Record<string, string> = {
    Space: "Space",
    Escape: "Escape",
    Tab: "Tab",
    Backspace: "Backspace",
    Enter: "Enter",
  };
  const special = named[event.code];
  if (special !== undefined) {
    return special;
  }
  const arrows: Record<string, string> = {
    ArrowLeft: "Left",
    ArrowUp: "Up",
    ArrowRight: "Right",
    ArrowDown: "Down",
  };
  if (arrows[event.code] !== undefined) {
    return arrows[event.code];
  }
  if (/^F\d+$/.test(event.code)) {
    return event.code;
  }
  return event.key;
}

const MOUSE_BUTTON_FROM_DOM: Record<string, number> = {
  0: MouseButton.LEFT,
  1: MouseButton.MIDDLE,
  2: MouseButton.RIGHT,
};

/** Builds a Godot event from a DOM mouse event over a canvas. */
export function mouse_event_from_dom(
  event: MouseEvent,
  canvas: HTMLCanvasElement,
  kind: "button" | "motion",
  previous: Vector2 = new Vector2(),
  pressed = event.type === "mousedown",
): InputEventMouseButton | InputEventMouseMotion {
  const rect = canvas.getBoundingClientRect();
  const position = new Vector2(event.clientX - rect.left, event.clientY - rect.top);
  const relative = position.sub(previous);
  const modifiers = {
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
  };
  if (kind === "motion") {
    return new InputEventMouseMotion(position, relative, modifiers);
  }
  const button = MOUSE_BUTTON_FROM_DOM[String(event.button)] ?? MouseButton.NONE;
  return new InputEventMouseButton(button, pressed, position, modifiers);
}
