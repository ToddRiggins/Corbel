import { Vector2 } from "../math/vector2.js";
import { InputEvent, InputEventKey, InputEventMouseButton } from "./events.js";
import { key_event, key_from_name } from "./events.js";

/** Action event from `project.corbel.json`: `{ "key": "Space" }` or `{ "mouse_button": 1 }`. */
export interface ProjectEventSpec {
  key?: string;
  mouse_button?: number;
  /** Godot's Additional Options: each true name matches that modifier. */
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  /** True (default) matches the physical key position; false matches the layout key. */
  physical?: boolean;
}

/** Action spec from `project.corbel.json`: `{ "spin": { "events": [{ "key": "Space" }] } }`. */
export interface ProjectActionSpec {
  events?: ProjectEventSpec[];
  /** Analog threshold, like Godot's. Keys ignore it; stored with the action. */
  deadzone?: number;
}

/**
 * Godot 4 InputMap: named actions that map to input events, loaded from the
 * project settings. Static like Godot's.
 */
export class InputMap {
  private static readonly _actions = new Map<string, InputEvent[]>();
  private static readonly _deadzones = new Map<string, number>();

  /** Adds an action. Adding an existing name is a no-op, like Godot's. */
  static add_action(action: string, deadzone = 0.2): void {
    if (!this._actions.has(action)) {
      this._actions.set(action, []);
      this._deadzones.set(action, deadzone);
    }
  }

  static has_action(action: string): boolean {
    return this._actions.has(action);
  }

  static get_actions(): string[] {
    return [...this._actions.keys()];
  }

  static erase_action(action: string): void {
    this._actions.delete(action);
    this._deadzones.delete(action);
  }

  /** The analog threshold stored with the action; keys ignore it. */
  static action_get_deadzone(action: string): number {
    return this._deadzones.get(action) ?? 0.2;
  }

  static action_set_deadzone(action: string, deadzone: number): void {
    if (this._actions.has(action)) {
      this._deadzones.set(action, deadzone);
    }
  }

  static action_add_event(action: string, event: InputEvent): void {
    const events = this._actions.get(action);
    if (!events) {
      throw new Error(`InputMap has no action named "${action}". Add it first.`);
    }
    events.push(event);
  }

  static action_get_events(action: string): InputEvent[] {
    return [...(this._actions.get(action) ?? [])];
  }

  static action_erase_events(action: string): void {
    const events = this._actions.get(action);
    if (events) {
      events.length = 0;
    }
  }

  /** True when the event matches an event bound to the action. */
  static event_is_action(event: InputEvent, action: string): boolean {
    const events = this._actions.get(action);
    if (!events) {
      return false;
    }
    return events.some((bind) => binds_match(bind, event));
  }

  /** Loads every action in the parsed project settings, replacing what is loaded. */
  static load_from_project(input: Record<string, ProjectActionSpec>): void {
    this.clear();
    for (const [action, spec] of Object.entries(input)) {
      this.add_action(action, spec.deadzone ?? 0.2);
      for (const event of spec.events ?? []) {
        this.action_add_event(action, event_from_spec(event, action));
      }
    }
  }

  static clear(): void {
    this._actions.clear();
    this._deadzones.clear();
  }
}

/** Builds an InputEvent from a project-settings spec; absent modifiers match any. */
export function event_from_spec(spec: ProjectEventSpec, action: string): InputEvent {
  const modifiers = {
    shift: spec.shift === true ? true : null,
    ctrl: spec.ctrl === true ? true : null,
    alt: spec.alt === true ? true : null,
    meta: spec.meta === true ? true : null,
  };
  if (spec.key !== undefined) {
    // Godot's editor binds physical positions by default.
    const bind = new InputEventKey(key_from_name(spec.key), true, modifiers);
    bind.physical = spec.physical ?? true;
    return bind;
  }
  if (spec.mouse_button !== undefined) {
    return new InputEventMouseButton(spec.mouse_button, true, new Vector2(), modifiers);
  }
  throw new Error(`Action "${action}" has an event with neither "key" nor "mouse_button".`);
}

/**
 * A bind matches when the event kind matches, the physical-vs-layout kind
 * matches for keys, and every modifier the bind names (non-null) agrees.
 * A bind without modifiers matches any modifier state.
 */
export function binds_match(bind: InputEvent, event: InputEvent): boolean {
  if (bind instanceof InputEventKey && event instanceof InputEventKey) {
    return key_codes_match(bind, event) && modifiers_match(bind, event);
  }
  if (bind instanceof InputEventMouseButton && event instanceof InputEventMouseButton) {
    return bind.button_index === event.button_index && modifiers_match(bind, event);
  }
  return false;
}

/** Keys match when the bind's code kind matches the event's same kind. */
function key_codes_match(bind: InputEventKey, event: InputEventKey): boolean {
  if (bind.physical === true) {
    return event.physical_key_code === bind.key_code;
  }
  if (bind.physical === false) {
    return event.key_code === bind.key_code;
  }
  return event.key_code === bind.key_code || event.physical_key_code === bind.key_code;
}

function modifiers_match(bind: InputEvent, event: InputEvent): boolean {
  return (
    (bind.shift_pressed === null || bind.shift_pressed === event.shift_pressed) &&
    (bind.ctrl_pressed === null || bind.ctrl_pressed === event.ctrl_pressed) &&
    (bind.alt_pressed === null || bind.alt_pressed === event.alt_pressed) &&
    (bind.meta_pressed === null || bind.meta_pressed === event.meta_pressed)
  );
}
