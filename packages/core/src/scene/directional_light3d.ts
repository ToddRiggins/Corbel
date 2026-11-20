import { Color } from "../math/color.js";
import { Node3D } from "./node3d.js";

/**
 * Godot 4 DirectionalLight3D. Light shines along the node's local -Z,
 * so an unrotated light points (0, 0, -1).
 */
export class DirectionalLight3D extends Node3D {
  light_color = Color.WHITE;
  /** Godot 4 `shadow_enabled`: draws the shadow map and shades the directional term with it. */
  shadow_enabled = false;
  /** The shadow's ortho half-extent in world units about the camera. */
  shadow_range = 20;
  /** Godot 4 `shadow_bias`: how far a surface may sit behind the map write. */
  shadow_bias = 0.02;
}
