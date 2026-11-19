import { describe, expect, it } from "vitest";
import { Input } from "../src/input/input.js";
import { InputEventAction, InputEventKey, InputEventMouseButton, Key, MouseButton, key_event, key_from_name, key_name_from_dom } from "../src/input/events.js";
import { InputMap } from "../src/input/input_map.js";
import { Vector2 } from "../src/math/vector2.js";
import { Node } from "../src/scene/node.js";
import { SceneTree } from "../src/scene/scene_tree.js";

function key(name: string, pressed: boolean, options: { echo?: boolean } = {}): InputEventKey {
  return new InputEventKey(key_from_name(name), pressed, options);
}

describe("key naming", () => {
  it("matches Godot 4 Key constants", () => {
    expect(key_from_name("W")).toBe(87);
    expect(Key.W).toBe(87);
    expect(Key.SPACE).toBe(32);
    expect(Key.ESCAPE).toBe(4194305);
    expect(Key.LEFT).toBe(4194319);
    expect(Key.UP).toBe(4194320);
    expect(Key.SHIFT).toBe(4194325);
    expect(Key.CTRL).toBe(4194326);
    expect(Key.F5).toBe(4194336);
    expect(key_from_name("Space")).toBe(32);
    expect(key_from_name("ArrowUp")).toBe(4194320);
    expect(key_from_name("F1")).toBe(4194332);
  });

  it("maps DOM events to Godot-style names", () => {
    expect(key_name_from_dom({ code: "KeyW", key: "w" } as KeyboardEvent)).toBe("W");
    expect(key_name_from_dom({ code: "Space", key: " " } as KeyboardEvent)).toBe("Space");
    expect(key_name_from_dom({ code: "ArrowUp", key: "ArrowUp" } as KeyboardEvent)).toBe("Up");
    expect(key_name_from_dom({ code: "Digit1", key: "1" } as KeyboardEvent)).toBe("1");
  });
});

describe("InputMap", () => {
  it("loads actions from project settings and matches events", () => {
    InputMap.clear();
    InputMap.load_from_project({
      spin: { events: [{ key: "Space" }] },
      shoot: { events: [{ key: "F" }, { mouse_button: 1 }] },
    });

    expect(InputMap.has_action("spin")).toBe(true);
    expect(InputMap.get_actions().sort()).toEqual(["shoot", "spin"]);

    const space = key("Space", true);
    expect(InputMap.event_is_action(space, "spin")).toBe(true);
    expect(InputMap.event_is_action(key("A", true), "spin")).toBe(false);
    const left = new InputEventMouseButton(MouseButton.LEFT, true, new Vector2());
    expect(InputMap.event_is_action(left, "shoot")).toBe(true);
    expect(InputMap.event_is_action(space, "shoot")).toBe(false);
    expect(InputMap.action_get_events("shoot").length).toBe(2);

    InputMap.clear();
    expect(InputMap.get_actions()).toEqual([]);
  });

  it("a bind with a named modifier only matches that modifier", () => {
    InputMap.clear();
    InputMap.add_action("dash_plain");
    InputMap.action_add_event("dash_plain", key("S", true));
    InputMap.add_action("dash_shift");
    InputMap.action_add_event("dash_shift", new InputEventKey(83, true, { shift: true }));

    const shift_s = new InputEventKey(83, true, { shift: true, ctrl: false });
    expect(InputMap.event_is_action(shift_s, "dash_shift")).toBe(true);
    // A bind without modifiers matches any modifier state.
    expect(InputMap.event_is_action(shift_s, "dash_plain")).toBe(true);
    const plain_s = new InputEventKey(83, true);
    expect(InputMap.event_is_action(plain_s, "dash_shift")).toBe(false);
  });
});

describe("Input", () => {
  const tree = new SceneTree();

  it("tracks pressed key and action state across frames", () => {
    InputMap.clear();
    InputMap.load_from_project({ spin: { events: [{ key: "Space" }] } });

    expect(Input.is_action_pressed("spin")).toBe(false);

    Input.parse_input_event(key("Space", true));
    tree.tick(0.1);
    expect(Input.is_key_pressed(32)).toBe(true);
    expect(Input.is_action_pressed("spin")).toBe(true);
    expect(Input.is_action_just_pressed("spin")).toBe(true);

    tree.tick(0.1);
    expect(Input.is_action_pressed("spin")).toBe(true);
    expect(Input.is_action_just_pressed("spin")).toBe(false);

    Input.parse_input_event(key("Space", false));
    tree.tick(0.1);
    expect(Input.is_action_pressed("spin")).toBe(false);
    expect(Input.is_action_just_released("spin")).toBe(true);
    tree.tick(0.1);
    expect(Input.is_action_just_released("spin")).toBe(false);
  });

  it("echo keydowns update device state but do not re-arm just_pressed", () => {
    InputMap.clear();
    InputMap.load_from_project({ spin: { events: [{ key: "Space" }] } });
    Input.parse_input_event(key("Space", true));
    tree.tick(0.1);
    expect(Input.is_action_just_pressed("spin")).toBe(true);

    Input.parse_input_event(key("Space", true, { echo: true }));
    tree.tick(0.1);
    expect(Input.is_key_pressed(32)).toBe(true);
    expect(Input.is_action_pressed("spin")).toBe(true);
    expect(Input.is_action_just_pressed("spin")).toBe(false);
  });

  it("InputEventAction drives an action without any device event", () => {
    Input._reset();
    InputMap.clear();
    Input.parse_input_event(new InputEventAction("start_game", true));
    tree.tick(0.1);
    expect(Input.is_action_pressed("start_game")).toBe(true);
    expect(Input.is_action_just_pressed("start_game")).toBe(true);
    Input.parse_input_event(new InputEventAction("start_game", false));
    tree.tick(0.1);
    expect(Input.is_action_pressed("start_game")).toBe(false);
  });

  it("parsed events reach Node._input in tree order", () => {
    Input._reset();
    InputMap.clear();
    const events: string[] = [];

    class Listener extends Node {
      readonly log: string[];
      constructor(name: string) {
        super();
        this.log = [];
        this.set_name(name);
      }
      override _input(event: InputEventKey): void {
        this.log.push(`${this.name}:${event.key_code}`);
        events.push(`${this.name}:${event.key_code}:${event.is_pressed()}`);
      }
    }

    const parent = new Listener("Outer");
    parent.add_child(new Listener("Inner"));
    tree.get_root().add_child(parent);

    // The bridge in the run window: parse feeds state, then the tree dispatches.
    Input.event_handler = (event) => tree.push_input(event);
    Input.parse_input_event(key("W", true));
    tree.tick(0.01);
    Input.event_handler = null;

    expect(events).toEqual(["Outer:87:true", "Inner:87:true"]);
    expect(Input.is_key_pressed(87)).toBe(true);
    tree.get_root().remove_child(parent);
    tree.tick(0.01);
  });

  it("a plain Node with no _input override stays untouched", () => {
    class Silent extends Node {
      saw_input = false;
    }
    const probe = new Silent();
    tree.get_root().add_child(probe);
    tree.push_input(key("W", true));
    expect(probe.saw_input).toBe(false);
    tree.get_root().remove_child(probe);
  });
});
