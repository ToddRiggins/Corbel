import { Color } from "../math/color.js";
import { Vector3 } from "../math/vector3.js";
import { mat4_mul, perspective_proj, transform_to_mat4 } from "./frame.js";
import type { RenderFrame } from "./frame.js";

/**
 * Godot 4 Shader, for the foundation's two backends: one program pair, written
 * twice, sharing parameter names. Build one with `Shader.lit`; the uniform
 * parameters are `vec4` (colors, vectors, and scalars coerce), and both bodies
 * see the same names: `color`, `normal`, `albedo`, `light_dir`, `light_color`,
 * `ambient`, plus `lighting(normal)` in WGSL and `lighting()` in GLSL, and
 * each parameter by its own name.
 */
export class Shader {
  readonly webgpu: string;
  readonly webgl: { vertex: string; fragment: string };
  /** Parameter names, in the order the params uniform buffer carries them. */
  readonly params: readonly string[];

  private constructor(
    webgpu: string,
    webgl: { vertex: string; fragment: string },
    params: readonly string[],
  ) {
    this.webgpu = webgpu;
    this.webgl = webgl;
    this.params = params;
  }

  static lit(spec: { uniforms?: readonly string[]; webgpu_body: string; webgl_body: string }): Shader {
    const uniforms = [...spec.uniforms ?? []];
    for (const param of uniforms) {
      if (!/^([A-Za-z_][A-Za-z0-9_]*)$/.test(param)) {
        throw new Error(`Shader uniform "${param}" is not a valid name.`);
      }
    }
    return new Shader(build_wgsl(uniforms, spec.webgpu_body), build_glsl(uniforms, spec.webgl_body), uniforms);
  }
}

/** WGSL group 0, binding 0, written once per frame: view_proj plus the light. */
export const WGSL_CAMERA_FLOATS = 28;

/** WGSL group 1, binding 0, written once per draw: model, normal matrix, albedo. */
export const WGSL_DRAW_FLOATS = 32;

const WGSL_CAMERA = `
struct Camera {
  view_proj : mat4x4f,
  light_dir : vec4f,
  light_color : vec4f,
  ambient : vec4f,
};

struct Draw {
  model : mat4x4f,
  normal_mat : mat3x3f,
  albedo : vec4f,
};

@group(0) @binding(0) var<uniform> u : Camera;
@group(1) @binding(0) var<uniform> d : Draw;

struct VertexOut {
  @builtin(position) clip : vec4f,
  @location(0) color : vec3f,
  @location(1) normal : vec3f,
};

@vertex
fn vs(@location(0) pos : vec3f, @location(1) normal_in : vec3f, @location(2) color_in : vec3f) -> VertexOut {
  var out : VertexOut;
  out.clip = u.view_proj * (d.model * vec4f(pos, 1.0));
  out.normal = d.normal_mat * normal_in;
  out.color = color_in;
  return out;
}

`;

/** Builds the WGSL module from a parameter list and the fragment body. */
export function build_wgsl(params: readonly string[], body: string): string {
  const params_block = params.length > 0
    ? `\nstruct Params {\n${params.map((name) => `  ${name} : vec4f,`).join("\n")}\n};\n@group(1) @binding(1) var<uniform> p : Params;\n`
    : "";
  const params_let = params.map((name) => `  let ${name} = p.${name};`).join("\n");
  return `${WGSL_CAMERA}${params_block}
fn lighting(normal : vec3f) -> vec3f {
  return u.light_color.rgb * max(dot(normalize(normal), u.light_dir.xyz), 0.0) + u.ambient.rgb;
}

@fragment
fn fs(in : VertexOut) -> @location(0) vec4f {
  let color = in.color;
  let normal = in.normal;
  let albedo = d.albedo.rgb;
  let light_dir = u.light_dir.xyz;
  let light_color = u.light_color.rgb;
  let ambient = u.ambient.rgb;
${params_let}
${body}
}
`;
}

/** Builds the WebGL2 program pair from a parameter list and the fragment body. */
export function build_glsl(params: readonly string[], body: string): { vertex: string; fragment: string } {
  const vertex = `#version 300 es
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
  const params_block = params.map((name) => `uniform vec4 ${name};`).join("\n");
  const fragment = `#version 300 es
precision highp float;

in vec3 v_color;
in vec3 v_normal;

uniform vec4 u_light_dir;
uniform vec4 u_light_color;
uniform vec4 u_ambient;
uniform vec4 u_albedo;
${params_block}

out vec4 out_color;

vec3 lighting() {
  return u_light_color.rgb * max(dot(normalize(v_normal), u_light_dir.xyz), 0.0) + u_ambient.rgb;
}

vec4 fs_fragment() {
  vec3 color = v_color;
  vec3 normal = v_normal;
  vec3 albedo = u_albedo.rgb;
  vec3 light_dir = u_light_dir.xyz;
  vec3 light_color = u_light_color.rgb;
  vec3 ambient = u_ambient.rgb;
${body}
}

void main() {
  out_color = fs_fragment();
}
`;
  return { vertex, fragment };
}

/** Camera uniform content in float order: view_proj 0-15, light_dir 16, light_color 20, ambient 24. */
export function fill_camera(
  scratch: Float32Array,
  view_proj: Float32Array,
  light_dir: Vector3,
  light_color: Color,
  ambient: Color,
): void {
  scratch.fill(0);
  scratch.set(view_proj, 0);
  scratch[16] = light_dir.x;
  scratch[17] = light_dir.y;
  scratch[18] = light_dir.z;
  scratch[20] = light_color.r;
  scratch[21] = light_color.g;
  scratch[22] = light_color.b;
  scratch[24] = ambient.r;
  scratch[25] = ambient.g;
  scratch[26] = ambient.b;
}

/** Draw uniform content in float order: model 0-15, normal matrix 16-27, albedo 28-31. */
/** The built-in shader a StandardMaterial3D draws with. */
export const LIT_SHADER = Shader.lit({
  webgpu_body: `  return vec4f(albedo * color * lighting(normal), 1.0);`,
  webgl_body: `  return vec4(albedo * color * lighting(), 1.0);`,
});

export function fill_draw(
  scratch: Float32Array,
  model: Float32Array,
  normal_matrix: Float32Array,
  albedo: Color,
): void {
  scratch.fill(0);
  scratch.set(model, 0);
  scratch.set(normal_matrix, 16);
  scratch[28] = albedo.r;
  scratch[29] = albedo.g;
  scratch[30] = albedo.b;
  scratch[31] = albedo.a;
}

/** Coerces a script parameter into the vec4 a GPU uniform takes. */
export function coerce_vec4(value: unknown): [number, number, number, number] {
  if (typeof value === "number") {
    return [value, 0, 0, 0];
  }
  if (typeof value === "boolean") {
    return value ? [1, 1, 1, 1] : [0, 0, 0, 0];
  }
  if (typeof value === "object" && value !== null && "r" in value) {
    const rgbalike = value as Color;
    return [rgbalike.r, rgbalike.g, rgbalike.b, rgbalike.a];
  }
  if (typeof value === "object" && value !== null && "x" in value) {
    const xyzlike = value as Vector3;
    return [xyzlike.x, xyzlike.y, xyzlike.z, 0];
  }
  return [0, 0, 0, 0];
}

/** Frame camera math shared by both backends. */
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
