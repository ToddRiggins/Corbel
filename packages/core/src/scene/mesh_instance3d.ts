import type { Material } from "./material.js";
import type { Mesh } from "./mesh.js";
import { Node3D } from "./node3d.js";

/**
 * Godot 4 GeometryInstance3D: a node a renderer can draw. The material
 * override live here, as in Godot, so every geometry subclass can override it.
 */
export class GeometryInstance3D extends Node3D {
  /** Godot 4 `geometry_instance.material_override`: replaces every surface's material. */
  material_override: Material | null = null;
  /** Godot 4 `transparency`: 0.0 is solid, 1.0 is invisible. Renders blended. */
  transparency = 0.0;
}

/** Godot 4 MeshInstance3D. */
export class MeshInstance3D extends GeometryInstance3D {
  /** Godot 4 `MeshInstance3D.mesh`: what this node draws. */
  mesh: Mesh | null = null;

  /** Per-surface override materials; null entries fall through to the mesh's own material. */
  private overrides: (Material | null)[] = [];

  /** Godot 4 `set_surface_override_material`. */
  set_surface_override_material(surface: number, material: Material | null): void {
    if (surface < 0) {
      throw new Error("A surface override cannot target a negative surface index.");
    }
    while (this.overrides.length <= surface) {
      this.overrides.push(null);
    }
    this.overrides[surface] = material;
  }

  /** Godot 4 `get_surface_override_material`. */
  get_surface_override_material(surface: number): Material | null {
    return this.overrides[surface] ?? null;
  }

  /** How many surface override slots this instance holds. */
  get_surface_override_material_count(): number {
    return this.overrides.length;
  }

  /**
   * Godot 4 `get_active_material`: the material the surface actually draws
   * with — the surface override, else the material override, else the mesh's
   * own material, else null.
   */
  get_active_material(surface = 0): Material | null {
    return this.get_surface_override_material(surface)
      ?? this.material_override
      ?? this.mesh?.surface_get_material(surface)
      ?? null;
  }
}
