import type { Material } from "./material.js";
import type { Mesh } from "./mesh.js";
import { Node3D } from "./node3d.js";

/** Godot 4 GeometryInstance3D: a node a renderer can draw. */
export class GeometryInstance3D extends Node3D {}

/** Godot 4 MeshInstance3D. */
export class MeshInstance3D extends GeometryInstance3D {
  geometry: Mesh | null = null;
  material_override: Material | null = null;
}
