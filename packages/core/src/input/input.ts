import { Vector2 } from "../math/vector2.js";
import { InputEvent, InputEventAction, InputEventKey, InputEventMouseButton, Key } from "./events.js";
import { InputMap } from "./input_map.js";

/**
 * Godot 4 Input singleton: action and raw key/button state the game reads
 * every frame, fed by `parse_input_event`. `just_pressed` and `just_released`
 * hold for one frame; `SceneTree.tick` advances the frame.
 */
export class Input {
  /** Where parsed events go so `Node._input` runs. SceneTree hands itself in at play. */
  static event_handler: ((event: InputEvent) => void) | null = null;

  private static readonly _keys = new Set<Key>();
  private static readonly _buttons = new Set<number>();
  private static readonly _mouse_position = new Vector2(0, 0);
  private static readonly _action_pressed = new Map<string, number>();
  private static readonly _action_released = new Map<string, number>();
  private static _frame = 0;

  static is_key_pressed(key: Key): boolean {
    return this._keys.has(key);
  }

  static is_mouse_button_pressed(button: number): boolean {
    return this._buttons.has(button);
  }

  /** The pointer position of the last mouse event, in canvas pixels. Zero before any event. */
  static get_mouse_position(): Vector2 {
    return this._mouse_position.clone();
  }

  /** True when an action event said pressed, or any device bind is physically down. */
  static is_action_pressed(action: string): boolean {
    return this.device_action_pressed(action) || this.explicit_action_pressed(action);
  }

  private static device_action_pressed(action: string): boolean {
    return InputMap.action_get_events(action).some((bind) => {
      if (bind instanceof InputEventKey && !bind.echo) {
        return this._keys.has(bind.key_code);
      }
      if (bind instanceof InputEventMouseButton) {
        return this._buttons.has(bind.button_index);
      }
      return false;
    });
  }

  private static explicit_action_pressed(action: string): boolean {
    const pressed_at = this._action_pressed.get(action);
    if (pressed_at === undefined) {
      return false;
    }
    const released_at = this._action_released.get(action);
    return released_at === undefined || pressed_at >= released_at;
  }

  static is_action_just_pressed(action: string): boolean {
    return (this._action_pressed.get(action) ?? -1) === this._frame;
  }

  static is_action_just_released(action: string): boolean {
    return (this._action_released.get(action) ?? -1) === this._frame;
  }

  /**
   * Feeds one event: state updates, then the event goes to the handler
   * SceneTree set, which is what calls `Node._input`.
   */
  static parse_input_event(event: InputEvent): void {
    if (event instanceof InputEventKey && !event.echo) {
      if (event.is_pressed()) {
        this._keys.add(event.key_code);
      } else {
        this._keys.delete(event.key_code);
      }
    }
    if (event instanceof InputEventMouseButton) {
      this._mouse_position.x = event.position.x;
      this._mouse_position.y = event.position.y;
      if (event.is_pressed()) {
        this._buttons.add(event.button_index);
      } else {
        this._buttons.delete(event.button_index);
      }
    }
    for (const action of InputMap.get_actions()) {
      if (event instanceof InputEventKey && event.echo) {
        // Godot actions ignore auto-repeat for just_pressed/released.
        break;
      }
      if (InputMap.event_is_action(event, action)) {
        if (event.is_pressed()) {
          this._action_pressed.set(action, this._frame + 1);
        } else {
          this._action_released.set(action, this._frame + 1);
        }
      }
    }
    if (event instanceof InputEventAction) {
      if (event.pressed) {
        this._action_pressed.set(event.action, this._frame + 1);
      } else {
        this._action_released.set(event.action, this._frame + 1);
      }
    }
    this.event_handler?.(event);
  }

  /** @internal Called once per frame by `SceneTree.tick`. */
  static _advance_frame(): void {
    this._frame += 1;
  }

  /** @internal Drops all state; used between plays and in tests. */
  static _reset(): void {
    this._keys.clear();
    this._buttons.clear();
    this._action_pressed.clear();
    this._action_released.clear();
    this._frame = 0;
    this._mouse_position.x = 0;
      this._mouse_position.y = 0;
  }
}
