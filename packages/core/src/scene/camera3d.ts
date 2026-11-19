import { Node3D } from "./node3d.js";

/**
 * Godot 4 Camera3D. Looks down local -Z. `fov` is vertical degrees,
 * Godot's default. The renderer draws through the last `current`
 * camera in tree order, or the first camera when none is current.
 */
export class Camera3D extends Node3D {
  fov = 75.0;
  near = 0.05;
  far = 4000.0;
  current = true;
}
