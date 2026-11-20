import { Node3D } from "./node3d.js";

/** Godot 4 `Camera3D.Projection`: keep full perspective, or flatten to orthographic. */
export const Projection = {
  PERSPECTIVE: 0,
  ORTHOGONAL: 1,
} as const;

export type Projection = number;

/**
 * Godot 4 Camera3D. Looks down local -Z. `fov` is vertical degrees,
 * Godot's default for PERSPECTIVE; `size` is the orthographic height in
 * world units for ORTHOGONAL. The renderer draws through the last `current`
 * camera in tree order, or the first camera when none is current.
 */
export class Camera3D extends Node3D {
  fov = 75.0;
  /** Godot 4 `size`: the ortho view's height. */
  size = 4.0;
  near = 0.05;
  far = 4000.0;
  projection: Projection = Projection.PERSPECTIVE;
  current = true;
}
