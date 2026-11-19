import { Color } from "../math/color.js";
import { Node3D } from "./node3d.js";

/**
 * Godot 4 DirectionalLight3D. Light shines along the node's local -Z,
 * so an unrotated light points (0, 0, -1).
 */
export class DirectionalLight3D extends Node3D {
  light_color = Color.WHITE;
}
