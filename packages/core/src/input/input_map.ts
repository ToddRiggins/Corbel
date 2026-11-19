import { Vector2 } from "../math/vector2.js";
import { InputEvent, InputEventKey, InputEventMouseButton } from "./events.js";
import { key_event } from "./events.js";

/** Action event from `project.corbel.json`: `{ "key": "Space" }` or `{ "mouse_button": 1 }`. */
export interface ProjectEventSpec {
  key?: string;
  mouse_button?: number;
}

/** Action spec from `project.corbel.json`: `{ "spin": { "events": [{ "key": "Space" }] } }`. */
export interface ProjectActionSpec {
  events?: ProjectEventSpec[];
}

/**
 * Godot 4 InputMap: named actions that map to input events, loaded from the
 * project settings. Static like Godot's.
 */
export class InputMap {
  private static readonly _actions = new Map<string, InputEvent[]>();

  /** Adds an action. Adding an existing name is a no-op, like Godot's. */
  static add_action(action: string): void {
    if (!this._actions.has(action)) {
      this._actions.set(action, []);
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
      this.add_action(action);
      for (const event of spec.events ?? []) {
        this.action_add_event(action, event_from_spec(event, action));
      }
    }
  }

  static clear(): void {
    this._actions.clear();
  }
}

/** Builds an InputEvent from a project-settings spec. */
export function event_from_spec(spec: ProjectEventSpec, action: string): InputEvent {
  if (spec.key !== undefined) {
    return key_event(true, spec.key);
  }
  if (spec.mouse_button !== undefined) {
    return new InputEventMouseButton(spec.mouse_button, true, new Vector2());
  }
  throw new Error(`Action "${action}" has an event with neither "key" nor "mouse_button".`);
}

/**
 * A bind matches when the event kind matches and every modifier the bind
 * names (non-null) agrees. A bind without modifiers matches any modifier state.
 */
export function binds_match(bind: InputEvent, event: InputEvent): boolean {
  if (bind instanceof InputEventKey && event instanceof InputEventKey) {
    return bind.key_code === event.key_code && modifiers_match(bind, event);
  }
  if (bind instanceof InputEventMouseButton && event instanceof InputEventMouseButton) {
    return bind.button_index === event.button_index && modifiers_match(bind, event);
  }
  return false;
}

function modifiers_match(bind: InputEvent, event: InputEvent): boolean {
  return (
    (bind.shift_pressed === null || bind.shift_pressed === event.shift_pressed) &&
    (bind.ctrl_pressed === null || bind.ctrl_pressed === event.ctrl_pressed) &&
    (bind.alt_pressed === null || bind.alt_pressed === event.alt_pressed) &&
    (bind.meta_pressed === null || bind.meta_pressed === event.meta_pressed)
  );
}
