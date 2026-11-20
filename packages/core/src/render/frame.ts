import { Color } from "../math/color.js";
import { Basis } from "../math/basis.js";
import { Transform3D } from "../math/transform3d.js";
import { Vector3 } from "../math/vector3.js";
import { Camera3D } from "../scene/camera3d.js";
import { DirectionalLight3D } from "../scene/directional_light3d.js";
import { OmniLight3D, SpotLight3D } from "../scene/omni_light3d.js";
import { WorldEnvironment, type Environment, type FogMode } from "../scene/environment.js";
import type { Mesh, SurfaceArrays } from "../scene/mesh.js";
import { MeshInstance3D } from "../scene/mesh_instance3d.js";
import type { Material } from "../scene/material.js";
import type { Node } from "../scene/node.js";
import type { SceneTree } from "../scene/scene_tree.js";
import { StandardMaterial3D } from "../scene/standard_material3d.js";

/** What the canvas clears to before draws land on it. */
export const CLEAR_COLOR = new Color(0.16, 0.16, 0.18, 1.0);

/** Ambient floor when no lighting is configured. Godot's default environment is dimmer; this stays visible. */
export const DEFAULT_AMBIENT = new Color(0.3, 0.3, 0.3, 1.0);

/** Shared default so a mesh without a material stays white; treat as read-only. */
export const DEFAULT_MATERIAL = new StandardMaterial3D();

/** The fog block a frame carries when the tree's Environment enabled it. */
export interface RenderFog {
  mode: FogMode;
  color: Color;
  density: number;
  depth_begin: number;
  depth_end: number;
  depth_curve: number;
  height: number;
  height_density: number;
}

/** One light in the frame's list, in world space. */
export interface RenderLight {
  kind: "directional" | "omni" | "spot";
  color: Color;
  /** Directional lights ignore it; omni/spot radiate from here. */
  position: Vector3;
  /** Points where the light goes: local -Z transformed, unit length. */
  direction: Vector3;
  /** Omni/spot reach in world units. */
  range: number;
  /** Multiplies the color, Godot's light_energy. */
  energy: number;
  /** Omni attenuation exponent. */
  attenuation: number;
  /** Spot: half-angle degrees around the direction. */
  spot_angle: number;
  /** Spot: edge softening exponent. */
  spot_attenuation: number;
}

/** Lights a frame carries at most; the walk keeps the first found in tree order. */
export const MAX_LIGHTS = 8;

/** One draw call's worth of scene data. */
export interface RenderDraw {
  mesh: Mesh;
  /** Model matrix, column-major 4x4. */
  transform: Float32Array;
  /** World-space normal matrix, column-major 3x3. */
  normal_matrix: Float32Array;
  material: Material;
  /** The GeometryInstance3D transparency; 0 means opaque. */
  transparency: number;
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
  /** What the canvas clears to (from WorldEnvironment, or the default gray). */
  background: Color;
  camera: Camera3D | null;
  camera_transform: Transform3D | null;
  /** World-space, unit length. Points where the light goes. */
  light_direction: Vector3;
  light_color: Color;
  ambient: Color;
  /** Fog from the tree's Environment, or null when fog is off. */
  fog: RenderFog | null;
  /** Lights in tree order, directional first-come plus every omni/spot, capped. */
  lights: RenderLight[];
  /** Opaque draws first, then transparent ones, each group in tree order. */
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
  let environment: Environment | null = null;
  const draws: RenderDraw[] = [];
  const lights: RenderLight[] = [];

  const walk = (node: Node): void => {
    if (node instanceof Camera3D) {
      first_camera ??= node;
      if (node.current) {
        camera = node;
      }
    } else if (node instanceof WorldEnvironment && environment === null) {
      environment = node.environment;
    } else if (node instanceof SpotLight3D) {
      // SpotLight3D extends OmniLight3D; check the subtype first.
      const global = node.get_global_transform();
      if (lights.length < MAX_LIGHTS) {
        lights.push(light_from_node(node, "spot", global));
      }
    } else if (node instanceof OmniLight3D) {
      const global = node.get_global_transform();
      if (lights.length < MAX_LIGHTS) {
        lights.push(light_from_node(node, "omni", global));
      }
    } else if (node instanceof DirectionalLight3D && light === null) {
      light = node;
    }
    if (node instanceof MeshInstance3D && node.visible && node.mesh !== null) {
      const global = node.get_global_transform();
      const material = node.get_active_material() ?? DEFAULT_MATERIAL;
      // A StandardMaterial3D whose albedo carries alpha draws translucent even
      // when the node transparency is 0; the texture alpha joins at draw time.
      const from_alpha = material instanceof StandardMaterial3D ? Math.max(0, 1 - material.albedo.a) : 0;
      draws.push({
        mesh: node.mesh,
        transform: transform_to_mat4(global),
        normal_matrix: basis_to_mat3(global.basis.inverse().transposed()),
        material,
        transparency: Math.max(node.transparency, from_alpha),
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

  const chosen_environment = environment as Environment | null;

  const fog: RenderFog | null = chosen_environment && chosen_environment.fog_enabled
    ? {
        mode: chosen_environment.fog_mode,
        color: chosen_environment.fog_light_color,
        density: chosen_environment.fog_density,
        depth_begin: chosen_environment.fog_depth_begin,
        depth_end: chosen_environment.fog_depth_end,
        depth_curve: chosen_environment.fog_depth_curve,
        height: chosen_environment.fog_height,
        height_density: chosen_environment.fog_height_density,
      }
    : null;

  // Opaque first, transparent after; each group keeps tree order.
  const opaque = draws.filter((draw) => draw.transparency <= 0);
  const blended = draws.filter((draw) => draw.transparency > 0);

  return {
    width,
    height,
    aspect: width / height,
    background: chosen_environment ? chosen_environment.background_color : CLEAR_COLOR,
    camera: chosen_camera,
    camera_transform,
    light_direction,
    light_color: chosen_light ? chosen_light.light_color : Color.WHITE,
    ambient: chosen_environment ? chosen_environment.ambient : ambient,
    fog,
    // The primary directional leads the list; its light_dir/light_color
    // uniforms keep carrying it for the frame's base directional term.
    lights: [
      ...(chosen_light
        ? [light_from_node(chosen_light, "directional", (chosen_light as DirectionalLight3D).get_global_transform())]
        : []),
      ...lights,
    ].slice(0, MAX_LIGHTS),
    draws: [...opaque, ...blended],
  };
}

/** One light's world-space description, straight from the node. */
function light_from_node(node: DirectionalLight3D | OmniLight3D | SpotLight3D, kind: RenderLight["kind"], global: Transform3D): RenderLight {
  const directional = kind === "directional";
  return {
    kind,
    color: node.light_color,
    position: global.origin,
    direction: global.basis.z.neg().normalized(),
    range: directional ? 0 : node instanceof OmniLight3D ? node.range : 5,
    energy: node instanceof OmniLight3D ? node.energy : 1,
    attenuation: node instanceof OmniLight3D ? node.attenuation : 1,
    spot_angle: node instanceof SpotLight3D ? node.spot_angle : 0,
    spot_attenuation: node instanceof SpotLight3D ? node.spot_attenuation : 1,
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

/**
 * The per-vertex arrays a backend draws, with defaults for optional data:
 * missing normals point +Z, missing colors are white, missing UVs are zero,
 * so a mesh a script built without them still renders.
 */
export function surface_attribs(surface: SurfaceArrays): { count: number; normals: Float32Array; colors: Float32Array; uvs: Float32Array; tangents: Float32Array; has_tangents: boolean } {
  const count = surface.positions.length / 3;
  const normals = surface.normals ?? forward_normals(count);
  const colors = surface.colors ?? white_colors(count);
  const has_tangents = surface.tangents !== undefined && surface.tangents.length === count * 4;
  // Default tangent follows +X with binormal sign 1; real data is preferred.
  const tangents = surface.tangents ?? identity_tangents(count);
  return { count, normals, colors, uvs: surface.uvs ?? zero_uvs(count), tangents, has_tangents };
}

function identity_tangents(count: number): Float32Array {
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    out[i * 4] = 1;
    out[i * 4 + 3] = 1;
  }
  return out;
}

function forward_normals(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    out[i * 3 + 2] = 1;
  }
  return out;
}

function white_colors(count: number): Float32Array {
  return new Float32Array(count * 3).fill(1);
}

function zero_uvs(count: number): Float32Array {
  return new Float32Array(count * 2);
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
