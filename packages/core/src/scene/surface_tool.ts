import { CMP_EPSILON } from "../math/approx.js";
import type { Color } from "../math/color.js";
import { Plane } from "../math/plane.js";
import { Vector2 } from "../math/vector2.js";
import { Vector3 } from "../math/vector3.js";
import { ArrayMesh, type SurfaceArrays } from "./mesh.js";

/** Godot 4 `Mesh.PrimitiveType`. The renderer draws TRIANGLES today. */
export const PrimitiveType = {
  POINTS: 0,
  LINES: 1,
  LINE_STRIP: 2,
  TRIANGLES: 3,
  TRIANGLE_STRIP: 4,
} as const;
export type PrimitiveType = number;

/** One vertex: where it is plus the attributes the script set for it. */
interface VertexRecord {
  position: Vector3;
  normal?: Vector3;
  uv?: Vector2;
  color?: Color;
  tangent?: Plane;
}

/**
 * Godot 4 SurfaceTool: builds a mesh one vertex at a time.
 *
 * Call `begin(PrimitiveType.TRIANGLES)`, set per-vertex attributes with
 * `set_normal`, `set_uv`, `set_color`, and `set_tangent`, then close each
 * vertex with `add_vertex`. Like Godot, the pending attributes reset after
 * every `add_vertex`, so a vertex without color simply sets none.
 * `commit` returns an `ArrayMesh`.
 */
export class SurfaceTool {
  private _primitive: number | null = null;
  private _pending: Omit<VertexRecord, "position"> = {};
  private readonly _vertices: VertexRecord[] = [];
  private _indices: number[] | null = null;

  begin(primitive: number): void {
    this._primitive = primitive;
    this._vertices.length = 0;
    this._indices = null;
    this._pending = {};
  }

  set_normal(normal: Vector3): void {
    this._pending.normal = normal.clone();
  }

  set_uv(uv: Vector2): void {
    this._pending.uv = uv.clone();
  }

  set_color(color: Color): void {
    this._pending.color = color.clone();
  }

  /** Tangent direction; the plane's `d` is the binormal sign (+1 or -1). */
  set_tangent(tangent: Plane): void {
    this._pending.tangent = tangent.clone();
  }

  add_vertex(vertex: Vector3): void {
    if (this._primitive === null) {
      throw new Error("begin() must run before add_vertex().");
    }
    this._vertices.push({ position: vertex.clone(), ...this._pending });
    this._pending = {};
  }

  clear(): void {
    this._primitive = null;
    this._vertices.length = 0;
    this._indices = null;
    this._pending = {};
  }

  /** Godot 4 `index()`: merges identical vertices and references them by index. */
  index(): void {
    const unique: VertexRecord[] = [];
    const seen = new Map<string, number>();
    const indices: number[] = [];
    for (const vertex of this._vertices) {
      const key = vertex_key(vertex);
      const at = seen.get(key);
      if (at !== undefined) {
        indices.push(at);
      } else {
        const next = unique.push(vertex) - 1;
        seen.set(key, next);
        indices.push(next);
      }
    }
    this._vertices.length = 0;
    this._vertices.push(...unique);
    this._indices = indices;
  }

  /**
   * Godot 4 `generate_normals`: smooths each triangle's face normal onto its
   * vertices, overwriting anything `set_normal` set. TRIANGLES only.
   */
  generate_normals(flip = false): void {
    if (this._primitive !== PrimitiveType.TRIANGLES) {
      throw new Error("generate_normals works on TRIANGLES surfaces.");
    }
    this.assert_triangulated();
    const accumulated = new Float32Array(this._vertices.length * 3);
    for (const [slot_a, slot_b, slot_c] of this.faces()) {
      const a = this._vertices[slot_a];
      const b = this._vertices[slot_b];
      const c = this._vertices[slot_c];
      const cross = b.position.sub(a.position).cross(c.position.sub(a.position));
      for (const slot of [slot_a, slot_b, slot_c]) {
        accumulated[slot * 3] += flip ? -cross.x : cross.x;
        accumulated[slot * 3 + 1] += flip ? -cross.y : cross.y;
        accumulated[slot * 3 + 2] += flip ? -cross.z : cross.z;
      }
    }
    for (let i = 0; i < this._vertices.length; i += 1) {
      const normal = new Vector3(accumulated[i * 3], accumulated[i * 3 + 1], accumulated[i * 3 + 2]);
      normal.normalize();
      this._vertices[i].normal = normal;
    }
  }

  /**
   * Godot 4 `generate_tangents`: every vertex needs a UV. Fills the tangent
   * with the binormal sign, orthogonalized against the vertex normal.
   */
  generate_tangents(): void {
    if (this._primitive !== PrimitiveType.TRIANGLES) {
      throw new Error("generate_tangents works on TRIANGLES surfaces.");
    }
    this.assert_triangulated();
    if (this._vertices.some((vertex) => vertex.uv === undefined)) {
      throw new Error("generate_tangents needs a UV on every vertex. Set one with set_uv.");
    }
    const tangents = new Float32Array(this._vertices.length * 4);
    for (const [slot_a, slot_b, slot_c] of this.faces()) {
      const v0 = this._vertices[slot_a];
      const v1 = this._vertices[slot_b];
      const v2 = this._vertices[slot_c];
      const e1 = v1.position.sub(v0.position);
      const e2 = v2.position.sub(v0.position);
      const s1 = v1.uv!.sub(v0.uv!);
      const s2 = v2.uv!.sub(v0.uv!);
      const area = s1.x * s2.y - s1.y * s2.x;
      if (Math.abs(area) < CMP_EPSILON) {
        continue;
      }
      const r = 1 / area;
      const tangent = e1.mul(s2.y * r).sub(e2.mul(s1.y * r));
      const bitangent = e2.mul(s1.x * r).sub(e1.mul(s2.x * r));
      const normal = e1.cross(e2);
      const sign = normal.dot(tangent.cross(bitangent)) >= 0 ? 1 : -1;
      tangent.normalize();
      for (const slot of [slot_a, slot_b, slot_c]) {
        tangents[slot * 4] += tangent.x;
        tangents[slot * 4 + 1] += tangent.y;
        tangents[slot * 4 + 2] += tangent.z;
        tangents[slot * 4 + 3] += sign;
      }
    }
    for (let i = 0; i < this._vertices.length; i += 1) {
      const direction = new Vector3(tangents[i * 4], tangents[i * 4 + 1], tangents[i * 4 + 2]);
      if (direction.is_zero_approx()) {
        continue;
      }
      direction.normalize();
      // Orthogonalize against the normal so lighting math stays clean.
      const nudged = direction.sub(this.normal_of(i).mul(direction.dot(this.normal_of(i))));
      nudged.normalize();
      this._vertices[i].tangent = new Plane(nudged, tangents[i * 4 + 3] >= 0 ? 1 : -1);
    }
  }

  /** Godot 4 `commit`: builds the `ArrayMesh`. Optional arrays appear only when set. */
  commit(): ArrayMesh {
    if (this._primitive === null) {
      throw new Error("begin() must run before commit().");
    }
    if (this._primitive !== PrimitiveType.TRIANGLES) {
      throw new Error("The renderer draws TRIANGLES surfaces only right now.");
    }
    this.assert_triangulated();
    const count = this._vertices.length;
    const positions = new Float32Array(count * 3);
    let normals: Float32Array | null = null;
    let colors: Float32Array | null = null;
    let uvs: Float32Array | null = null;
    let tangents: Float32Array | null = null;
    for (let i = 0; i < count; i += 1) {
      const vertex = this._vertices[i];
      positions[i * 3] = vertex.position.x;
      positions[i * 3 + 1] = vertex.position.y;
      positions[i * 3 + 2] = vertex.position.z;
      if (vertex.color !== undefined) {
        colors ??= new Float32Array(count * 3).fill(1);
        colors[i * 3] = vertex.color.r;
        colors[i * 3 + 1] = vertex.color.g;
        colors[i * 3 + 2] = vertex.color.b;
      }
      if (vertex.uv !== undefined) {
        uvs ??= new Float32Array(count * 2);
        uvs[i * 2] = vertex.uv.x;
        uvs[i * 2 + 1] = vertex.uv.y;
      }
      if (vertex.normal !== undefined) {
        normals ??= forward_normals(count);
        const normal = vertex.normal.normalized();
        normals[i * 3] = normal.x;
        normals[i * 3 + 1] = normal.y;
        normals[i * 3 + 2] = normal.z;
      }
      if (vertex.tangent !== undefined) {
        tangents ??= default_tangents(count);
        tangents[i * 4] = vertex.tangent.normal.x;
        tangents[i * 4 + 1] = vertex.tangent.normal.y;
        tangents[i * 4 + 2] = vertex.tangent.normal.z;
        tangents[i * 4 + 3] = vertex.tangent.d;
      }
    }
    const indices = Uint32Array.from(this._indices ?? Array.from({ length: count }, (_, i) => i));
    const arrays: SurfaceArrays = { positions, indices };
    if (normals !== null) {
      arrays.normals = normals;
    }
    if (colors !== null) {
      arrays.colors = colors;
    }
    if (uvs !== null) {
      arrays.uvs = uvs;
    }
    if (tangents !== null) {
      arrays.tangents = tangents;
    }
    return new ArrayMesh(arrays);
  }

  private normal_of(i: number): Vector3 {
    const vertex = this._vertices[i];
    return (vertex.normal ?? new Vector3(0, 0, 1)).normalized();
  }

  /** Triplet slots of every triangle, walking indices when `index()` ran. */
  private faces(): Array<readonly [number, number, number]> {
    if (this._indices !== null) {
      const faces: Array<readonly [number, number, number]> = [];
      for (let face = 0; face + 2 < this._indices.length; face += 3) {
        faces.push([this._indices[face], this._indices[face + 1], this._indices[face + 2]]);
      }
      return faces;
    }
    const faces: Array<readonly [number, number, number]> = [];
    for (let face = 0; face + 2 < this._vertices.length; face += 3) {
      faces.push([face, face + 1, face + 2]);
    }
    return faces;
  }

  private assert_triangulated(): void {
    const faces = this.faces();
    const in_range = faces.every((face) => face.every((slot) => slot >= 0 && slot < this._vertices.length));
    if (faces.length === 0 || !in_range) {
      throw new Error("TRIANGLES surfaces need whole triangles: add vertices in threes, or run index() first.");
    }
  }
}

/** A vertex's identity for `index()`: position plus every attribute, approximated. */
function vertex_key(vertex: VertexRecord): string {
  const parts: string[] = [];
  const push = (n: number): string => String(Math.round(n * 1e5) / 1e5);
  parts.push(`${push(vertex.position.x)},${push(vertex.position.y)},${push(vertex.position.z)}`);
  if (vertex.normal) {
    parts.push(`n${push(vertex.normal.x)},${push(vertex.normal.y)},${push(vertex.normal.z)}`);
  }
  if (vertex.uv) {
    parts.push(`u${push(vertex.uv.x)},${push(vertex.uv.y)}`);
  }
  if (vertex.color) {
    parts.push(`c${push(vertex.color.r)},${push(vertex.color.g)},${push(vertex.color.b)},${push(vertex.color.a)}`);
  }
  if (vertex.tangent) {
    parts.push(`t${push(vertex.tangent.normal.x)},${push(vertex.tangent.normal.y)},${push(vertex.tangent.normal.z)},${push(vertex.tangent.d)}`);
  }
  return parts.join("|");
}

/** Missing-color vertices stay white; missing normals point +Z; tangents along +X. */
function forward_normals(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    out[i * 3 + 2] = 1;
  }
  return out;
}

function default_tangents(count: number): Float32Array {
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    out[i * 4] = 1;
    out[i * 4 + 3] = 1;
  }
  return out;
}
