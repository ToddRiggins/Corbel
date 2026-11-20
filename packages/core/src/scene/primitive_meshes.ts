import type { Material } from "./material.js";
import { Mesh, type SurfaceArrays } from "./mesh.js";
import { Vector3 } from "../math/vector3.js";

/**
 * Godot 4 PrimitiveMesh: a built-in mesh whose one surface is built once from
 * its parameters and cached. SphereMesh, BoxMesh, CylinderMesh, and the rest
 * all extend it. Builders hand vertices CCW seen from outside, one full UV
 * square per face, and a tangent per vertex so normal maps need no
 * SurfaceTool pass.
 */
export abstract class PrimitiveMesh extends Mesh {
  private _surface: SurfaceArrays | null = null;

  get_surface_count(): number {
    return 1;
  }

  surface_get_arrays(_surface: number): SurfaceArrays {
    if (!this._surface) {
      this._surface = this.build();
    }
    return this._surface;
  }

  surface_get_material(_surface: number): Material | null {
    return null;
  }

  surface_set_material(_surface: number, _material: Material | null): void {
    // Godot keeps the material on the surface; the primitive meshes hold one
    // unnamed surface and the override material rides the instance instead.
  }

  /** Builds the arrays from the current parameters. */
  protected abstract build(): SurfaceArrays;
}

/** One growing grid of vertex records. */
interface BuildState {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  tangents: number[];
  indices: number[];
}

function push(state: BuildState, position: Vector3, normal: Vector3, u: number, v: number, tangent: Vector3): void {
  state.positions.push(position.x, position.y, position.z);
  state.normals.push(normal.x, normal.y, normal.z);
  state.colors.push(1, 1, 1);
  state.uvs.push(u, v);
  state.tangents.push(tangent.x, tangent.y, tangent.z, 1);
}

/** Connects two rows of equal length with two triangles per column pair. */
function connect_rows(state: BuildState, row_a: number, row_b: number, count: number, flip: boolean): void {
  for (let i = 0; i < count; i += 1) {
    const a = row_a + i;
    const b = row_a + i + 1;
    const c = row_b + i + 1;
    const d = row_b + i;
    if (flip) {
      state.indices.push(a, b, c, a, c, d);
    } else {
      state.indices.push(a, d, c, a, c, b);
    }
  }
}

/** Emits one quad from four points, with the face normal from the cross product. */
function quad(state: BuildState, points: Vector3[], uvs: [number, number][]): void {
  const [a, b, c, d] = points;
  const edge_1 = b.sub(a);
  const edge_2 = d.sub(a);
  const normal = edge_1.cross(edge_2).normalized();
  const base = state.positions.length / 3;
  for (let i = 0; i < 4; i += 1) {
    push(state, points[i], normal, uvs[i][0], uvs[i][1], tangent_for(normal));
  }
  state.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function triangle(state: BuildState, points: Vector3[], uvs: [number, number][]): void {
  const [a, b, c] = points;
  const normal = b.sub(a).cross(c.sub(a)).normalized();
  const base = state.positions.length / 3;
  for (let i = 0; i < 3; i += 1) {
    push(state, points[i], normal, uvs[i][0], uvs[i][1], tangent_for(normal));
  }
  state.indices.push(base, base + 1, base + 2);
}

/** A plausible tangent for a face normal: the cross with any fixed up axis. */
function tangent_for(normal: Vector3): Vector3 {
  const axis = Math.abs(normal.y) > 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  return axis.cross(normal).normalized();
}

function finish(state: BuildState): SurfaceArrays {
  return {
    positions: Float32Array.from(state.positions),
    normals: Float32Array.from(state.normals),
    colors: Float32Array.from(state.colors),
    uvs: Float32Array.from(state.uvs),
    tangents: Float32Array.from(state.tangents),
    indices: Uint32Array.from(state.indices),
  };
}

/** Godot 4 PlaneMesh: a flat XZ quad facing +Y, subdividable. */
export class PlaneMesh extends PrimitiveMesh {
  size = new Vector3(2, 0, 2);
  subdivide_width = 1;
  subdivide_depth = 1;

  constructor(size?: Vector3, subdivide_width = 1, subdivide_depth = 1) {
    super();
    if (size) {
      this.size = size.clone();
    }
    this.subdivide_width = subdivide_width;
    this.subdivide_depth = subdivide_depth;
  }

  protected build(): SurfaceArrays {
    const state: BuildState = { positions: [], normals: [], colors: [], uvs: [], tangents: [], indices: [] };
    const cols = this.subdivide_width;
    const rows = this.subdivide_depth;
    const up = new Vector3(0, 1, 0);
    for (let row = 0; row <= rows; row += 1) {
      for (let col = 0; col <= cols; col += 1) {
        const x = -this.size.x * 0.5 + (col / cols) * this.size.x;
        const z = -this.size.z * 0.5 + (row / rows) * this.size.z;
        push(state, new Vector3(x, 0, z), up, col / cols, row / rows, new Vector3(0, 0, -1));
      }
    }
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const a = row * (cols + 1) + col;
        const b = a + 1;
        const c = a + cols + 2;
        const d = a + cols + 1;
        state.indices.push(a, b, c, a, c, d);
      }
    }
    return finish(state);
  }
}

/** Godot 4 SphereMesh: a UV sphere about Y; radius x rings x segments. */
export class SphereMesh extends PrimitiveMesh {
  radius = 0.5;
  height = 1.0;
  radial_segments = 32;
  rings = 16;

  constructor(radius = 0.5, height = 1.0, radial_segments = 32, rings = 16) {
    super();
    this.radius = radius;
    this.height = height;
    this.radial_segments = radial_segments;
    this.rings = rings;
  }

  protected build(): SurfaceArrays {
    const state: BuildState = { positions: [], normals: [], colors: [], uvs: [], tangents: [], indices: [] };
    const slices = Math.max(3, this.radial_segments);
    const stacks = Math.max(2, this.rings);
    const heights = this.height;
    const ring_indices: number[][] = [];
    for (let stack = 0; stack <= stacks; stack += 1) {
      const phi = (stack / stacks) * Math.PI;
      const y = heights * 0.5 * Math.cos(phi);
      const ring_radius = this.radius * Math.sin(phi);
      const row: number[] = [];
      for (let slice = 0; slice <= slices; slice += 1) {
        const theta = (slice / slices) * Math.PI * 2;
        const normal = new Vector3(Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi)).normalized();
        push(state, new Vector3(Math.cos(theta) * ring_radius, y, Math.sin(theta) * ring_radius), normal, slice / slices, stack / stacks, new Vector3(Math.sin(theta), 0, -Math.cos(theta)));
        row.push(state.positions.length / 3 - 1);
      }
      ring_indices.push(row);
    }
    for (let stack = 0; stack < stacks; stack += 1) {
      connect_rows(state, ring_indices[stack][0], ring_indices[stack + 1][0], slices, stack % 2 === 1);
    }
    return finish(state);
  }
}

/** Godot 4 CylinderMesh about Y; `top_radius` 0 makes a cone. */
export class CylinderMesh extends PrimitiveMesh {
  top_radius = 0.5;
  bottom_radius = 0.5;
  height = 2.0;
  radial_segments = 32;

  constructor(top_radius = 0.5, bottom_radius = 0.5, height = 2.0, radial_segments = 32) {
    super();
    this.top_radius = top_radius;
    this.bottom_radius = bottom_radius;
    this.height = height;
    this.radial_segments = radial_segments;
  }

  protected build(): SurfaceArrays {
    const state: BuildState = { positions: [], normals: [], colors: [], uvs: [], tangents: [], indices: [] };
    const slices = Math.max(3, this.radial_segments);
    const half = this.height * 0.5;
    const row_top: number[] = [];
    for (let slice = 0; slice <= slices; slice += 1) {
      const theta = (slice / slices) * Math.PI * 2;
      const dir = new Vector3(Math.cos(theta), 0, Math.sin(theta));
      const barrel = new Vector3(dir.x, (this.top_radius - this.bottom_radius) / (this.height || 1), dir.z).normalized();
      const tangent = new Vector3(Math.sin(theta), 0, -Math.cos(theta));
      push(state, new Vector3(dir.x * this.top_radius, half, dir.z * this.top_radius), barrel, slice / slices, 0, tangent);
      row_top.push(state.positions.length / 3 - 1);
    }
    const row_bottom: number[] = [];
    for (let slice = 0; slice <= slices; slice += 1) {
      const theta = (slice / slices) * Math.PI * 2;
      const dir = new Vector3(Math.cos(theta), 0, Math.sin(theta));
      const tangent = new Vector3(Math.sin(theta), 0, -Math.cos(theta));
      push(state, new Vector3(dir.x * this.bottom_radius, -half, dir.z * this.bottom_radius), barrel_for(state, dir), slice / slices, 1, tangent);
      row_bottom.push(state.positions.length / 3 - 1);
    }
    // Recompute the barrel for the bottom row, matching the top's slant.
    for (let slice = 0; slice <= slices; slice += 1) {
      const theta = (slice / slices) * Math.PI * 2;
      const dir = new Vector3(Math.cos(theta), 0, Math.sin(theta));
      const slot = state.positions.length / 3 - 1;
      const barrel = new Vector3(dir.x, (this.top_radius - this.bottom_radius) / (this.height || 1), dir.z).normalized();
      state.normals[slot * 3] = barrel.x;
      state.normals[slot * 3 + 1] = barrel.y;
      state.normals[slot * 3 + 2] = barrel.z;
    }
    connect_rows(state, row_top[0], row_bottom[0], slices, true);
    // Caps.
    cap(state, slices, half, this.top_radius, new Vector3(0, 1, 0), true);
    cap(state, slices, -half, this.bottom_radius, new Vector3(0, -1, 0), false);
    return finish(state);

    function barrel_for(_state: BuildState, _dir: Vector3): Vector3 {
      return new Vector3(0, 1, 0);
    }
  }
}

/** One disc cap centered on the axis at `y`, its winding matching `top`. */
function cap(state: BuildState, slices: number, y: number, radius: number, normal: Vector3, top: boolean): void {
  const center = state.positions.length / 3;
  push(state, new Vector3(0, y, 0), normal, 0.5, top ? 0 : 1, tangent_for(normal));
  const ring: number[] = [];
  for (let slice = 0; slice <= slices; slice += 1) {
    const theta = (slice / slices) * Math.PI * 2;
    push(state, new Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius), normal, Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 + 0.5, tangent_for(normal));
    ring.push(state.positions.length / 3 - 1);
  }
  for (let slice = 0; slice < slices; slice += 1) {
    if (top) {
      state.indices.push(center, ring[slice], ring[slice + 1]);
    } else {
      state.indices.push(center, ring[slice + 1], ring[slice]);
    }
  }
}

/** Godot 4 CapsuleMesh: a cylinder body capped by two hemispheres about Y. */
export class CapsuleMesh extends PrimitiveMesh {
  radius = 0.5;
  height = 2.0;
  radial_segments = 32;
  rings = 8;

  constructor(radius = 0.5, height = 2.0, radial_segments = 32, rings = 8) {
    super();
    this.radius = radius;
    this.height = height;
    this.radial_segments = radial_segments;
    this.rings = rings;
  }

  protected build(): SurfaceArrays {
    const state: BuildState = { positions: [], normals: [], colors: [], uvs: [], tangents: [], indices: [] };
    const slices = Math.max(3, this.radial_segments);
    const stacks = Math.max(2, this.rings);
    const cylinder_half = Math.max(0, this.height * 0.5 - this.radius);
    // One lofted profile from the top pole to the bottom pole: the top
    // hemisphere rows, the cylinder band, then the bottom hemisphere rows.
    const total_rows = 2 * stacks + 3;
    const ring_indices: number[][] = [];
    for (let row = 0; row < total_rows; row += 1) {
      // Top hemisphere: phi runs 0 (top pole) to 90 degrees (the equator
      // ring at +cylinder_half). Bottom: the same flipped about the axis.
      const phi: number = row <= stacks
        ? (row / stacks) * (Math.PI / 2)
        : ((row - stacks - 1) / stacks) * (Math.PI / 2);
      const y = row <= stacks
        ? cylinder_half + this.radius * Math.cos(phi)
        : -cylinder_half - this.radius * Math.sin(phi);
      const ring_radius = this.radius * (row <= stacks ? Math.sin(phi) : Math.cos(phi));
      const normal_y = row <= stacks ? Math.cos(phi) : -Math.sin(phi);
      const row_indices: number[] = [];
      for (let slice = 0; slice <= slices; slice += 1) {
        const theta = (slice / slices) * Math.PI * 2;
        const normal = new Vector3(Math.cos(theta) * Math.sin(phi), normal_y, Math.sin(theta) * Math.sin(phi));
        push(state, new Vector3(Math.cos(theta) * ring_radius, y, Math.sin(theta) * ring_radius), normal, slice / slices, row / (total_rows - 1), new Vector3(Math.sin(theta), 0, -Math.cos(theta)));
        row_indices.push(state.positions.length / 3 - 1);
      }
      ring_indices.push(row_indices);
    }
    for (let row = 0; row < ring_indices.length - 1; row += 1) {
      connect_rows(state, ring_indices[row][0], ring_indices[row + 1][0], slices, row % 2 === 0);
    }
    return finish(state);
  }
}
export class TorusMesh extends PrimitiveMesh {
  inner_radius = 0.5;
  outer_radius = 1.0;
  rings = 32;
  ring_segments = 16;

  constructor(inner_radius = 0.5, outer_radius = 1.0, rings = 32, ring_segments = 16) {
    super();
    this.inner_radius = inner_radius;
    this.outer_radius = outer_radius;
    this.rings = rings;
    this.ring_segments = ring_segments;
  }

  protected build(): SurfaceArrays {
    const state: BuildState = { positions: [], normals: [], colors: [], uvs: [], tangents: [], indices: [] };
    const main_slices = Math.max(3, this.rings);
    const tube_slices = Math.max(3, this.ring_segments);
    const ring_radius = (this.inner_radius + this.outer_radius) * 0.5;
    const tube_radius = Math.abs(this.outer_radius - this.inner_radius) * 0.5;
    const ring_indices: number[][] = [];
    for (let main = 0; main <= main_slices; main += 1) {
      const main_angle = (main / main_slices) * Math.PI * 2;
      const center = new Vector3(Math.cos(main_angle) * ring_radius, 0, Math.sin(main_angle) * ring_radius);
      const row: number[] = [];
      for (let tube = 0; tube <= tube_slices; tube += 1) {
        const tube_angle = (tube / tube_slices) * Math.PI * 2;
        const normal = new Vector3(
          Math.cos(main_angle) * Math.cos(tube_angle),
          Math.sin(tube_angle),
          Math.sin(main_angle) * Math.cos(tube_angle),
        );
        push(state, center.add(normal.mul(tube_radius)), normal, main / main_slices, tube / tube_slices, new Vector3(-Math.sin(main_angle), 0, Math.cos(main_angle)));
        row.push(state.positions.length / 3 - 1);
      }
      ring_indices.push(row);
    }
    for (let main = 0; main < main_slices; main += 1) {
      connect_rows(state, ring_indices[main][0], ring_indices[main + 1][0], tube_slices, main % 2 === 1);
    }
    return finish(state);
  }
}

/** Godot 4 PrismMesh: an extruded triangle; the ridge leans with left_to_right. */
export class PrismMesh extends PrimitiveMesh {
  size = new Vector3(2, 2, 2);
  left_to_right = 0.5;

  constructor(size?: Vector3, left_to_right = 0.5) {
    super();
    if (size) {
      this.size = size.clone();
    }
    this.left_to_right = left_to_right;
  }

  protected build(): SurfaceArrays {
    const state: BuildState = { positions: [], normals: [], colors: [], uvs: [], tangents: [], indices: [] };
    const half_x = this.size.x * 0.5;
    const half_y = this.size.y * 0.5;
    const half_z = this.size.z * 0.5;
    const ridge_x = (this.left_to_right * 2 - 1) * half_x;
    // The base rectangle corners, in winding order per face; the ridge runs
    // along Z at (ridge_x, half_y).
    const base_left = new Vector3(-half_x, -half_y, -half_z);
    const base_right = new Vector3(half_x, -half_y, -half_z);
    const base_left_front = new Vector3(-half_x, -half_y, half_z);
    const base_right_front = new Vector3(half_x, -half_y, half_z);
    const ridge_front = new Vector3(ridge_x, half_y, half_z);
    const ridge_back = new Vector3(ridge_x, half_y, -half_z);
    // Front cap triangle (z = +half_z).
    triangle(state, [base_left_front, base_right_front, ridge_front], [[0, 1], [1, 1], [0.5, 0]]);
    // Back cap triangle (z = -half_z).
    triangle(state, [base_right, base_left, ridge_back], [[0, 1], [1, 1], [0.5, 0]]);
    // Bottom quad.
    quad(state, [base_right_front, base_right, base_left, base_left_front], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // The two slope faces: one base edge to the ridge line.
    quad(state, [base_left, base_left_front, ridge_front, ridge_back], [[0, 1], [0, 0], [1, 0], [1, 1]]);
    quad(state, [base_right_front, base_right, ridge_back, ridge_front], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    return finish(state);
  }
}
