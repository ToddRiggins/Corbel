import { Dictionary } from "./dictionary.js";
import { Input } from "./input/input.js";
import { InputMap, type ProjectActionSpec } from "./input/input_map.js";

/**
 * Godot 4 ProjectSettings: the parsed `project.corbel.json` of the running
 * game. Loading it also installs the Input Map and clears Input state.
 */
export class ProjectSettings {
  private constructor(private readonly _props: Dictionary<string, unknown>) {}

  static load(data: Record<string, unknown>): ProjectSettings {
    const props = new Dictionary<string, unknown>();
    for (const [key, value] of Object.entries(data)) {
      props.set(key, value);
    }
    const input = data["input"];
    if (input !== null && typeof input === "object") {
      InputMap.load_from_project(input as Record<string, ProjectActionSpec>);
      Input._reset();
    }
    return new ProjectSettings(props);
  }

  /** Top-level key lookup: `"input"`, `"window"`, `"main_scene"`. */
  get(name: string, fallback: unknown = null): unknown {
    return this._props.get(name, fallback);
  }

  get_string(name: string, fallback = ""): string {
    const value = this._props.get(name);
    return typeof value === "string" ? value : fallback;
  }

  has(name: string): boolean {
    return this._props.has(name);
  }
}
