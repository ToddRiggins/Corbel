import { CLEAR_COLOR, DEFAULT_AMBIENT, mat4_mul, perspective_proj, transform_to_mat4 } from "./frame.js";
import { Vector3 } from "../math/vector3.js";
import type { RenderFrame } from "./frame.js";

export const SHADER_WGSL = /* wgsl */ `
struct Scene {
  view_proj : mat4x4f,
  model     : mat4x4f,
  normal_mat: mat3x3f,
  light_dir : vec4f,
  light_color: vec4f,
  ambient   : vec4f,
  albedo    : vec4f,
};
@group(0) @binding(0) var<uniform> u : Scene;

struct VertexOut {
  @builtin(position) clip : vec4f,
  @location(0) color : vec3f,
  @location(1) normal : vec3f,
};

@vertex
fn vs(@location(0) pos : vec3f, @location(1) normal : vec3f, @location(2) color : vec3f) -> VertexOut {
  var out : VertexOut;
  out.clip = u.view_proj * (u.model * vec4f(pos, 1.0));
  out.normal = u.normal_mat * normal;
  out.color = color;
  return out;
}

@fragment
fn fs(in : VertexOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  let diffuse = max(dot(n, u.light_dir.xyz), 0.0);
  let lit = u.albedo.rgb * in.color * (u.light_color.rgb * diffuse + u.ambient.rgb);
  return vec4f(lit, 1.0);
}
`;

export const SHADER_VERT_GLSL = /* glsl */ `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_color;

uniform mat4 u_view_proj;
uniform mat4 u_model;
uniform mat3 u_normal_mat;

out vec3 v_color;
out vec3 v_normal;

void main() {
  gl_Position = u_view_proj * (u_model * vec4(a_position, 1.0));
  v_normal = u_normal_mat * a_normal;
  v_color = a_color;
}
`;

export const SHADER_FRAG_GLSL = /* glsl */ `#version 300 es
precision highp float;

in vec3 v_color;
in vec3 v_normal;

uniform vec4 u_light_dir;
uniform vec4 u_light_color;
uniform vec4 u_ambient;
uniform vec4 u_albedo;

out vec4 out_color;

void main() {
  vec3 n = normalize(v_normal);
  float diffuse = max(dot(n, u_light_dir.xyz), 0.0);
  vec3 lit = u_albedo.rgb * v_color * (u_light_color.rgb * diffuse + u_ambient.rgb);
  out_color = vec4(lit, 1.0);
}
`;

/** WGSL uniform block layout, in float offsets: view_proj 0, model 16, normal_mat 32, light* 44/48, ambient 52, albedo 56. */
export const WGSL_UNIFORM_FLOATS = 60;

/** Builds the per-draw WGSL uniform buffer content. Pads must stay zero; write into a persistent scratch. */
export function fill_wgsl_uniforms(
  scratch: Float32Array,
  view_proj: Float32Array,
  frame: RenderFrame,
  model: Float32Array,
  normal_matrix: Float32Array,
  albedo: { r: number; g: number; b: number; a: number },
): void {
  scratch.set(view_proj, 0);
  scratch.set(model, 16);
  scratch.set(normal_matrix, 32);
  // mat3x3f: three 16-byte columns; column 3 of the pad stays zero (scratch is pre-zeroed).
  scratch[44] = frame.light_direction.x;
  scratch[45] = frame.light_direction.y;
  scratch[46] = frame.light_direction.z;
  scratch[48] = frame.light_color.r;
  scratch[49] = frame.light_color.g;
  scratch[50] = frame.light_color.b;
  scratch[52] = DEFAULT_AMBIENT.r;
  scratch[53] = DEFAULT_AMBIENT.g;
  scratch[54] = DEFAULT_AMBIENT.b;
  scratch[56] = albedo.r;
  scratch[57] = albedo.g;
  scratch[58] = albedo.b;
  scratch[59] = albedo.a;
}

/** Frame-level camera math shared by both backends. */
export function view_proj_for_backend(
  frame: RenderFrame,
  zero_to_one: boolean,
  out = new Float32Array(16),
): Float32Array {
  const view = transform_to_mat4(frame.camera_transform!.inverse());
  const proj = perspective_proj(frame.camera!.fov, frame.aspect, frame.camera!.near, frame.camera!.far, zero_to_one);
  return mat4_mul(proj, view, out);
}

/** Light direction, unit length. */
export function light_dir_for(frame: RenderFrame): Vector3 {
  return frame.light_direction.normalized();
}
