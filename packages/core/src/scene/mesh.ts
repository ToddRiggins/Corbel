import { AABB } from "../math/aabb.js";
import type { Material } from "./material.js";
import { Vector3 } from "../math/vector3.js";

/**
 * Godot 4 `Mesh.PrimitiveType`: how a surface's vertices join. The renderer
 * draws TRIANGLES today; the other values name the Godot slots so data and
 * scripts port freely.
 */
export const PrimitiveType = {
  POINTS: 0,
  LINES: 1,
  LINE_STRIP: 2,
  TRIANGLES: 3,
  TRIANGLE_STRIP: 4,
} as const;

export type PrimitiveType = number;

/**
 * The arrays one surface hands to the renderer. Triangles wind counter-clockwise
 * seen from outside. `normals`, `colors`, `uvs`, and `tangents` are present when
 * the mesh carries them; the renderer falls back to per-vertex white.
 */
export interface SurfaceArrays {
  positions: Float32Array;
  normals?: Float32Array;
  colors?: Float32Array;
  uvs?: Float32Array;
  /** Four floats per vertex: tangent xyz plus the binormal sign. */
  tangents?: Float32Array;
  indices: Uint32Array;
}

/**
 * Godot 4 `Mesh.ArrayType`: which array a surface carries. The engine stores
 * the arrays on the `SurfaceArrays` object; these constants name the slots so
 * data ported from Godot keeps its meaning. Tangents are four floats per
 * vertex: xyz plus the binormal sign, as in Godot.
 */
export const ARRAY = {
  VERTEX: 0,
  NORMAL: 1,
  TANGENT: 2,
  COLOR: 3,
  TEX_UV: 4,
  INDEX: 5,
  MAX: 6,
} as const;

/**
 * Godot 4 Mesh. One mesh carries one or more surfaces; each surface is a
 * `PrimitiveType` plus its arrays, and can carry its own Material.
 */
export abstract class Mesh {
  /** Number of surfaces this mesh holds. */
  abstract get_surface_count(): number;
  /** The arrays of one surface (Godot 4 `Mesh.surface_get_arrays`). */
  abstract surface_get_arrays(surface: number): SurfaceArrays;
  /** The material of one surface, or null when none was set. */
  abstract surface_get_material(surface: number): Material | null;
  /** Sets one surface's material. */
  abstract surface_set_material(surface: number, material: Material | null): void;

  /** Godot 4 `Mesh.get_aabb`: the axis-aligned box this mesh fits in. */
  get_aabb(): AABB {
    // Scan the true min/max; a default-constructed box would leak its own size.
    let min_x = Infinity, min_y = Infinity, min_z = Infinity;
    let max_x = -Infinity, max_y = -Infinity, max_z = -Infinity;
    for (let i = 0; i < this.get_surface_count(); i += 1) {
      const p = this.surface_get_arrays(i).positions;
      for (let v = 0; v < p.length / 3; v += 1) {
        const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
        min_x = Math.min(min_x, x); min_y = Math.min(min_y, y); min_z = Math.min(min_z, z);
        max_x = Math.max(max_x, x); max_y = Math.max(max_y, y); max_z = Math.max(max_z, z);
      }
    }
    if (min_x > max_x) {
      return new AABB();
    }
    const min = new Vector3(min_x, min_y, min_z);
    return new AABB(min, new Vector3(max_x - min_x, max_y - min_y, max_z - min_z));
  }

  /**
   * Godot 4 `Mesh.get_faces`: the mesh as a flat list of triangles, three
   * `Vector3` corner points per face, in surface order.
   */
  get_faces(): Vector3[] {
    const faces: Vector3[] = [];
    for (let i = 0; i < this.get_surface_count(); i += 1) {
      const arrays = this.surface_get_arrays(i);
      for (let t = 0; t < arrays.indices.length; t += 3) {
        for (let k = 0; k < 3; k += 1) {
          const slot = arrays.indices[t + k];
          faces.push(new Vector3(arrays.positions[slot * 3], arrays.positions[slot * 3 + 1], arrays.positions[slot * 3 + 2]));
        }
      }
    }
    return faces;
  }
}

/** One surface entry inside an ArrayMesh. */
export interface ArrayMeshSurface {
  arrays: SurfaceArrays;
  primitive: number;
  name: string;
  material: Material | null;
}

/** Godot 4 ArrayMesh: a mutable list of surfaces. */
export class ArrayMesh extends Mesh {
  /** Godot 4 `ArrayMesh.custom_aabb`: shrinks the mesh AABB when set. */
  custom_aabb: AABB | null = null;

  private readonly _surfaces: ArrayMeshSurface[] = [];

  constructor(arrays?: SurfaceArrays) {
    super();
    if (arrays) {
      this.add_surface_from_arrays(PrimitiveType.TRIANGLES, arrays);
    }
  }

  add_surface_from_arrays(primitive: number, arrays: SurfaceArrays): void {
    if (arrays.positions.length % 3 !== 0) {
      throw new Error("ArrayMesh surface positions must repeat as x, y, z triplets.");
    }
    const vertex_count = arrays.positions.length / 3;
    for (const slot of arrays.indices) {
      if (slot >= vertex_count) {
        throw new Error(`ArrayMesh surface index ${slot} is out of range for ${vertex_count} vertices.`);
      }
    }
    this._surfaces.push({ arrays, primitive, name: "", material: null });
  }

  get_surface_count(): number {
    return this._surfaces.length;
  }

  surface_get_arrays(surface: number): SurfaceArrays {
    return this.surface_at(surface).arrays;
  }

  surface_get_primitive_type(surface: number): number {
    return this.surface_at(surface).primitive;
  }

  surface_get_name(surface: number): string {
    return this.surface_at(surface).name;
  }

  surface_set_name(surface: number, name: string): void {
    this.surface_at(surface).name = name;
  }

  surface_get_material(surface: number): Material | null {
    return this.surface_at(surface).material;
  }

  surface_set_material(surface: number, material: Material | null): void {
    this.surface_at(surface).material = material;
  }

  /** Godot 4 `ArrayMesh.clear_surfaces`: removes every surface. */
  clear_surfaces(): void {
    this._surfaces.length = 0;
  }

  /** Godot 4 `ArrayMesh.surface_remove`. */
  surface_remove(surface: number): void {
    if (surface < 0 || surface >= this._surfaces.length) {
      throw new Error(`ArrayMesh has no surface ${surface}.`);
    }
    this._surfaces.splice(surface, 1);
  }

  get_aabb(): AABB {
    return this.custom_aabb ?? super.get_aabb();
  }

  private surface_at(surface: number): ArrayMeshSurface {
    if (surface < 0 || surface >= this._surfaces.length) {
      throw new Error(`ArrayMesh has no surface ${surface}.`);
    }
    return this._surfaces[surface];
  }
}

/** Godot 4 BoxMesh: a box with each face carrying the full 0-1 UV square. */
export class BoxMesh extends Mesh {
  size: Vector3;
  /** Godot 4 `BoxMesh.subdivide_width`: grid splits across each X face pair. */
  subdivide_width = 1;
  /** Godot 4 `BoxMesh.subdivide_height`. */
  subdivide_height = 1;
  /** Godot 4 `BoxMesh.subdivide_depth`. */
  subdivide_depth = 1;

  private _surface: SurfaceArrays | null = null;

  constructor(size = new Vector3(1, 1, 1)) {
    super();
    this.size = size.clone();
  }

  get_surface_count(): number {
    return 1;
  }

  surface_get_arrays(_surface: number): SurfaceArrays {
    if (!this._surface) {
      this._surface = build_box(this);
    }
    return this._surface;
  }

  surface_get_material(_surface: number): Material | null {
    return null;
  }

  surface_set_material(_surface: number, _material: Material | null): void {
    // Godot keeps the material on the surface; BoxMesh has one unnamed surface.
  }
}

/** Face axis pairs `[normal, a, b]` with `a.cross(b) == normal`. */
const FACES: [Vector3, Vector3, Vector3][] = [
  [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
  [new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0)],
  [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
  [new Vector3(0, -1, 0), new Vector3(0, 0, -1), new Vector3(1, 0, 0)],
  [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
  [new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, -1)],
];

/** How a face's `a`/`b` axes map onto the width/height/depth subdivisions. */
const FACE_SUBDIVIDES: [number, number][] = [
  [0, 1], [0, 1], // normal z: a = width, b = height
  [2, 0], [2, 0], // normal y: a = depth, b = width
  [1, 2], [1, 2], // normal x: a = height, b = depth
];

/** Half extent along a unit axis: `|axis|` picks the component of `half` size. */
function extent_along(axis: Vector3, half: Vector3): number {
  return Math.abs(axis.x) * half.x + Math.abs(axis.y) * half.y + Math.abs(axis.z) * half.z;
}

function build_box(box: BoxMesh): SurfaceArrays {
  const half = box.size.mul(0.5);
  const splits = [box.subdivide_width, box.subdivide_height, box.subdivide_depth];
  let vertex_count = 0;
  let index_count = 0;
  for (let face = 0; face < 6; face += 1) {
    const [sa, sb] = FACE_SUBDIVIDES[face];
    const cols = splits[sa];
    const rows = splits[sb];
    vertex_count += (cols + 1) * (rows + 1);
    index_count += cols * rows * 6;
  }

  const positions = new Float32Array(vertex_count * 3);
  const normals = new Float32Array(vertex_count * 3);
  const colors = new Float32Array(vertex_count * 3).fill(1);
  const uvs = new Float32Array(vertex_count * 2);
  const tangents = new Float32Array(vertex_count * 4);
  const indices = new Uint32Array(index_count);

  let vertex = 0;
  let index_fill = 0;
  for (let face = 0; face < 6; face += 1) {
    const [n, a, b] = FACES[face];
    const [sa, sb] = FACE_SUBDIVIDES[face];
    const cols = splits[sa];
    const rows = splits[sb];
    const center = n.mul(extent_along(n, half));
    const ha = extent_along(a, half);
    const hb = extent_along(b, half);
    const base = vertex;
    for (let row = 0; row <= rows; row += 1) {
      for (let col = 0; col <= cols; col += 1) {
        const i = (col / cols) * 2 - 1;
        const j = (row / rows) * 2 - 1;
        const point = center.add(a.mul(ha * i)).add(b.mul(hb * j));
        positions[vertex * 3] = point.x;
        positions[vertex * 3 + 1] = point.y;
        positions[vertex * 3 + 2] = point.z;
        normals[vertex * 3] = n.x;
        normals[vertex * 3 + 1] = n.y;
        normals[vertex * 3 + 2] = n.z;
        uvs[vertex * 2] = col / cols;
        uvs[vertex * 2 + 1] = row / rows;
        // The tangent follows the `a` axis; `a.cross(b) == n` keeps sign 1.
        tangents[vertex * 4] = a.x;
        tangents[vertex * 4 + 1] = a.y;
        tangents[vertex * 4 + 2] = a.z;
        tangents[vertex * 4 + 3] = 1;
        vertex += 1;
      }
    }
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const c0 = base + row * (cols + 1) + col;
        const c1 = c0 + 1;
        const c2 = c0 + (cols + 1) + 1;
        const c3 = c0 + (cols + 1);
        indices.set([c0, c1, c2, c0, c2, c3], index_fill);
        index_fill += 6;
      }
    }
  }
  return { positions, normals, colors, uvs, tangents, indices };
}
