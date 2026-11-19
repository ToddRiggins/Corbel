import { Color } from "../math/color.js";
import { Basis } from "../math/basis.js";
import { Transform3D } from "../math/transform3d.js";
import { Vector3 } from "../math/vector3.js";
import { Camera3D } from "../scene/camera3d.js";
import { DirectionalLight3D } from "../scene/directional_light3d.js";
import type { Mesh } from "../scene/mesh.js";
import { MeshInstance3D } from "../scene/mesh_instance3d.js";
import type { Node } from "../scene/node.js";
import type { SceneTree } from "../scene/scene_tree.js";
import { StandardMaterial3D } from "../scene/standard_material3d.js";

/** What the canvas clears to before draws land on it. */
export const CLEAR_COLOR = new Color(0.16, 0.16, 0.18, 1.0);

/** Ambient floor when no lighting is configured. Godot's default environment is dimmer; this stays visible. */
export const DEFAULT_AMBIENT = new Color(0.3, 0.3, 0.3, 1.0);

export interface RenderDraw {
  mesh: Mesh;
  /** Model matrix, column-major 4x4. */
  transform: Float32Array;
  /** World-space normal matrix, column-major 3x3. */
  normal_matrix: Float32Array;
  albedo: Color;
}

/**
 * One rendered frame, built by walking the tree. Backends turn this into
 * GPU work. Camera and light live on the frame, not the backend, so a
 * headless test can build a frame without a GPU.
 */
export interface RenderFrame {
  width: number;
  height: number;
  aspect: number;
  camera: Camera3D | null;
  camera_transform: Transform3D | null;
  /** World-space, unit length. Points where the light goes. */
  light_direction: Vector3;
  light_color: Color;
  ambient: Color;
  draws: RenderDraw[];
}

export interface RenderBackend {
  readonly name: "webgpu" | "webgl2";
  /** Draws the frame. Clears the canvas when `camera` is null. */
  render(frame: RenderFrame): void;
  dispose(): void;
}

/**
 * Walks the tree in node order and collects what to draw.
 * Camera: the last `current` camera, or the first camera when none is current.
 * Light: the first DirectionalLight3D; otherwise a default (0, 0, -1) key light.
 */
export function build_render_frame(
  tree: SceneTree,
  width: number,
  height: number,
  ambient: Color = DEFAULT_AMBIENT,
): RenderFrame {
  let camera: Camera3D | null = null;
  let first_camera: Camera3D | null = null;
  let light: DirectionalLight3D | null = null;
  const draws: RenderDraw[] = [];

  const walk = (node: Node): void => {
    if (node instanceof Camera3D) {
      first_camera ??= node;
      if (node.current) {
        camera = node;
      }
    } else if (node instanceof DirectionalLight3D && light === null) {
      light = node;
    }
    if (node instanceof MeshInstance3D && node.visible && node.geometry !== null) {
      const material = node.material_override ?? new StandardMaterial3D();
      const global = node.get_global_transform();
      draws.push({
        mesh: node.geometry,
        transform: transform_to_mat4(global),
        normal_matrix: basis_to_mat3(global.basis.inverse().transposed()),
        albedo: material.albedo,
      });
    }
    for (const child of node.get_children()) {
      walk(child);
    }
  };
  walk(tree.get_root());
  camera ??= first_camera;

  const chosen_camera: Camera3D | null = (camera ?? first_camera) as Camera3D | null;
  const chosen_light = light as DirectionalLight3D | null;
  const camera_transform = chosen_camera ? chosen_camera.get_global_transform() : null;
  const light_direction = chosen_light
    ? chosen_light.get_global_transform().basis.z.neg().normalized()
    : Vector3.FORWARD.clone();

  return {
    width,
    height,
    aspect: width / height,
    camera: chosen_camera,
    camera_transform,
    light_direction,
    light_color: chosen_light ? chosen_light.light_color : Color.WHITE,
    ambient,
    draws,
  };
}

/** Basis and origin as a column-major 4x4. */
export function transform_to_mat4(t: Transform3D, out = new Float32Array(16)): Float32Array {
  const bx = t.basis.x;
  const by = t.basis.y;
  const bz = t.basis.z;
  out[0] = bx.x; out[1] = bx.y; out[2] = bx.z; out[3] = 0;
  out[4] = by.x; out[5] = by.y; out[6] = by.z; out[7] = 0;
  out[8] = bz.x; out[9] = bz.y; out[10] = bz.z; out[11] = 0;
  out[12] = t.origin.x; out[13] = t.origin.y; out[14] = t.origin.z; out[15] = 1;
  return out;
}

/** Basis as a column-major 3x3. */
export function basis_to_mat3(b: Basis, out = new Float32Array(9)): Float32Array {
  const bx = b.x;
  const by = b.y;
  const bz = b.z;
  out[0] = bx.x; out[1] = bx.y; out[2] = bx.z;
  out[3] = by.x; out[4] = by.y; out[5] = by.z;
  out[6] = bz.x; out[7] = bz.y; out[8] = bz.z;
  return out;
}

/** Column-major 4x4 product `a * b`. */
export function mat4_mul(a: Float32Array, b: Float32Array, out = new Float32Array(16)): Float32Array {
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + r] * b[c * 4 + k];
      }
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/**
 * Right-handed perspective, camera looking down -Z, Y up.
 * `zero_to_one` maps depth to [0, 1] for WebGPU, [1, -1] NDC (standard GL) otherwise.
 */
export function perspective_proj(
  fov_y_degrees: number,
  aspect: number,
  near: number,
  far: number,
  zero_to_one: boolean,
  out = new Float32Array(16),
): Float32Array {
  const f = 1 / Math.tan((fov_y_degrees * Math.PI) / 360);
  const near_far = near - far;
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  if (zero_to_one) {
    out[10] = far / near_far;
    out[14] = (far * near) / near_far;
  } else {
    out[10] = (far + near) / near_far;
    out[14] = (2 * far * near) / near_far;
  }
  out[11] = -1;
  return out;
}
