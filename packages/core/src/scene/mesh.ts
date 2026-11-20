import { Vector3 } from "../math/vector3.js";

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

/** Godot 4 Mesh. A renderer reads one surface per mesh. */
export abstract class Mesh {
  abstract surface(): SurfaceArrays;
}

/** Godot 4 ArrayMesh: raw arrays you build yourself. */
export class ArrayMesh extends Mesh {
  constructor(public readonly arrays: SurfaceArrays) {
    super();
  }

  surface(): SurfaceArrays {
    return this.arrays;
  }
}

/** Godot 4 BoxMesh: a cube centered on the origin, vertex colors all white. */
export class BoxMesh extends Mesh {
  size: Vector3;
  private _surface: SurfaceArrays | null = null;

  constructor(size = new Vector3(1, 1, 1)) {
    super();
    this.size = size.clone();
  }

  surface(): SurfaceArrays {
    if (!this._surface) {
      this._surface = build_box(this.size);
    }
    return this._surface;
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

/** Half extent along a unit axis: `|axis|` picks the component. */
function extent_along(axis: Vector3, half: Vector3): number {
  return Math.abs(axis.x) * half.x + Math.abs(axis.y) * half.y + Math.abs(axis.z) * half.z;
}

function build_box(size: Vector3): SurfaceArrays {
  const half = size.mul(0.5);
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const colors = new Float32Array(24 * 3).fill(1);
  const uvs = new Float32Array(24 * 2);
  const indices = new Uint32Array(36);

  for (let face = 0; face < 6; face += 1) {
    const [n, a, b] = FACES[face];
    const center = n.mul(extent_along(n, half));
    const ha = extent_along(a, half);
    const hb = extent_along(b, half);
    const base = face * 4;
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let corner = 0; corner < 4; corner += 1) {
      const [i, j] = corners[corner];
      const point = center.add(a.mul(ha * i)).add(b.mul(hb * j));
      const slot = base + corner;
      positions[slot * 3] = point.x;
      positions[slot * 3 + 1] = point.y;
      positions[slot * 3 + 2] = point.z;
      normals[slot * 3] = n.x;
      normals[slot * 3 + 1] = n.y;
      normals[slot * 3 + 2] = n.z;
      // Each face gets the full [0,1]x[0,1] texture square.
      uvs[slot * 2] = (i + 1) / 2;
      uvs[slot * 2 + 1] = j === 1 ? 1 : 0;
    }
    // CCW from outside: (-a,-b) -> (+a,-b) -> (+a,+b), and the mirrored pair.
    const tris = [0, 1, 2, 0, 2, 3];
    for (let t = 0; t < 6; t += 1) {
      indices[face * 6 + t] = base + tris[t];
    }
  }
  return { positions, normals, colors, uvs, indices };
}
