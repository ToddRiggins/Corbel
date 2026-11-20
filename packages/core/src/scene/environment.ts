import { Color } from "../math/color.js";
import { Node } from "./node.js";

/** Godot 4 Environment, foundation subset: background (clear color) and ambient. */
export class Environment {
  /** The canvas clear color behind the 3D scene. */
  background_color: Color = new Color(0.16, 0.16, 0.18, 1.0);
  ambient: Color = new Color(0.3, 0.3, 0.3, 1.0);

  static from_data(data: { background_color?: string; ambient?: string }): Environment {
    const env = new Environment();
    if (typeof data.background_color === "string") {
      env.background_color = Color.html(data.background_color);
    }
    if (typeof data.ambient === "string") {
      env.ambient = Color.html(data.ambient);
    }
    return env;
  }
}

/**
 * Godot 4 WorldEnvironment: overrides the tree's default background and
 * ambient colors. The renderer picks the first WorldEnvironment in the tree.
 */
export class WorldEnvironment extends Node {
  environment: Environment = new Environment();
}
