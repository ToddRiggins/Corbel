import { Color } from "../math/color.js";
import { Vector3 } from "../math/vector3.js";
import { mat4_mul, perspective_proj, transform_to_mat4, type RenderFog } from "./frame.js";
export type { RenderFog } from "./frame.js";
import type { Material } from "../scene/material.js";
import { StandardMaterial3D } from "../scene/standard_material3d.js";
import type { RenderFrame } from "./frame.js";

/** Godot 4 Shader, for the foundation's two backends: one program pair, written
 * twice, sharing parameter names. Build one with `Shader.lit`; the uniform
 * parameters are `vec4` (colors, vectors, and scalars coerce), and both bodies
 * see the same names: `color`, `normal`, `albedo`, `roughness`, `metallic`,
 * `emission`, `uv`, `light_dir`, `light_color`, `ambient`, plus
 * `lighting(normal)` in WGSL and `lighting()` in GLSL, and each parameter by
 * its own name. A body's final `return vec4(...)` is the lit color; the
 * harness adds fog, texture alpha, and transparency after it.
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

/** WGSL group 0, binding 0, written once per frame: view_proj, light, fog, camera position. */
export const WGSL_CAMERA_FLOATS = 44;

/** WGSL group 1, binding 0, written once per draw: model, normal matrix, material and map data. */
export const WGSL_DRAW_FLOATS = 56;

const WGSL_CAMERA = `
struct Camera {
  view_proj : mat4x4f,
  light_dir : vec4f,
  light_color : vec4f,
  ambient : vec4f,
  fog_color : vec4f,
  fog_data : vec4f,
  fog_data2 : vec4f,
  cam_pos : vec4f,
};

struct Draw {
  model : mat4x4f,
  normal_mat : mat3x3f,
  albedo : vec4f,
  maps : vec4f,
  uv_transform : vec4f,
  roughness_channel : vec4f,
  metallic_channel : vec4f,
  flags : vec4f,
  emission : vec4f,
};

@group(0) @binding(0) var<uniform> u : Camera;
@group(1) @binding(0) var<uniform> d : Draw;
@group(1) @binding(2) var t_albedo : texture_2d<f32>;
@group(1) @binding(3) var s_albedo : sampler;
@group(1) @binding(4) var t_normal : texture_2d<f32>;
@group(1) @binding(5) var s_normal : sampler;
@group(1) @binding(6) var t_roughness : texture_2d<f32>;
@group(1) @binding(7) var s_roughness : sampler;
@group(1) @binding(8) var t_metallic : texture_2d<f32>;
@group(1) @binding(9) var s_metallic : sampler;
@group(1) @binding(10) var t_emission : texture_2d<f32>;
@group(1) @binding(11) var s_emission : sampler;

struct VertexOut {
  @builtin(position) clip : vec4f,
  @location(0) color : vec3f,
  @location(1) normal : vec3f,
  @location(2) uv : vec2f,
  @location(3) tangent : vec4f,
  @location(4) world : vec3f,
};

@vertex
fn vs(@location(0) pos : vec3f, @location(1) normal_in : vec3f, @location(2) color_in : vec3f, @location(3) uv_in : vec2f, @location(4) tangent_in : vec4f) -> VertexOut {
  var out : VertexOut;
  let world_pos = d.model * vec4f(pos, 1.0);
  out.clip = u.view_proj * world_pos;
  out.normal = d.normal_mat * normal_in;
  out.color = color_in;
  out.uv = uv_in;
  out.tangent = vec4f(d.normal_mat * tangent_in.xyz, tangent_in.w);
  out.world = world_pos.xyz;
  return out;
}

`;

/** Builds the WGSL module from a parameter list and the fragment body. */
export function build_wgsl(params: readonly string[], body: string): string {
  const params_block = params.length > 0
    ? `
struct Params {
${params.map((name) => `  ${name} : vec4f,`).join("\n")}
};
@group(1) @binding(1) var<uniform> p : Params;
`
    : "";
  const params_let = params.map((name) => `  let ${name} = p.${name};`).join("\n");
  // The body keeps its `return vec4f(...)` contract; the fragment captures it
  // as `lit` so fog and transparency apply after it without touching bodies.
  const captured_body = capture_lit(body);
  return `${WGSL_CAMERA}
${params_block}

fn lighting(normal : vec3f) -> vec3f {
  return u.light_color.rgb * max(dot(normalize(normal), u.light_dir.xyz), 0.0) + u.ambient.rgb;
}

fn sample_channel(t : texture_2d<f32>, s : sampler, uv : vec2f, mask : vec4f) -> f32 {
  return dot(textureSampleLevel(t, s, uv, 0.0), mask);
}

fn fog_amount(world : vec3f) -> f32 {
  let distance = length(world - u.cam_pos.xyz);
  if (u.fog_data.y < 0.5) {
    return 1.0 - exp(-u.fog_data.x * u.fog_data.x * distance * distance);
  }
  let fade = clamp((distance - u.fog_data.z) / max(u.fog_data.w - u.fog_data.z, 0.0001), 0.0, 1.0);
  return pow(fade, u.fog_data2.z);
}

fn height_fog(world : vec3f) -> f32 {
  return exp2(-abs(u.fog_data2.y) * (world.y - u.fog_data2.x));
}

@fragment
fn fs(in : VertexOut) -> @location(0) vec4f {
  let uv = in.uv * d.uv_transform.xy + d.uv_transform.zw;
  var color = mix(vec3f(1.0, 1.0, 1.0), in.color, d.flags.y);
  var normal = normalize(in.normal);
  if (d.flags.x > 0.5 && d.maps.z != 0.0) {
    let tangent_normal = textureSampleLevel(t_normal, s_normal, uv, 0.0).rgb * 2.0 - vec3f(1.0, 1.0, 1.0);
    let t = normalize(in.tangent.xyz - normal * dot(in.tangent.xyz, normal));
    let b = normalize(cross(normal, t)) * in.tangent.w;
    let tbn_normal = t * tangent_normal.x * d.maps.z + b * tangent_normal.y * d.maps.z + normal * tangent_normal.z;
    normal = normalize(tbn_normal);
  }
  let tex_albedo = textureSampleLevel(t_albedo, s_albedo, uv, 0.0);
  let albedo = d.albedo.rgb * tex_albedo.rgb;
  let roughness = d.maps.x * sample_channel(t_roughness, s_roughness, uv, d.roughness_channel);
  let metallic = d.maps.y * sample_channel(t_metallic, s_metallic, uv, d.metallic_channel);
  let emission_mask = mix(vec3f(1.0, 1.0, 1.0), textureSampleLevel(t_emission, s_emission, uv, 0.0).rgb, d.flags.w);
  let emission = clamp(d.emission.rgb, vec3f(0.0, 0.0, 0.0), vec3f(4.0, 4.0, 4.0)) * d.emission.a * emission_mask;
  let light_dir = u.light_dir.xyz;
  let light_color = u.light_color.rgb;
  let ambient = u.ambient.rgb;
${params_let}
${captured_body}
  let fog = min(fog_amount(in.world) * height_fog(in.world), 1.0);
  let fogged = mix(lit.rgb, u.fog_color.rgb, fog * u.fog_color.a);
  // Texture alpha joins the albedo's own alpha; transparency thins what is left.
  let lit_alpha = d.albedo.a * tex_albedo.a * (1.0 - d.maps.w) * lit.a;
  return vec4f(fogged, lit_alpha);
}
`;
}

/** Captures a shader body's final `return` as the `lit` value the harness postlude edits. */
export function capture_lit(body: string, declaration = "let lit"): string {
  return body.replace(/return\s+([\s\S]*);?\s*$/, (_all, expr: string) => `  ${declaration} = ${expr.trimEnd().replace(/;$/, "")};`);
}

/** Builds the WebGL2 program pair from a parameter list and the fragment body. */
export function build_glsl(params: readonly string[], body: string): { vertex: string; fragment: string } {
  const glsl_capture = (source: string): string => capture_lit(source, "vec4 lit");
  const vertex = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_color;
layout(location = 3) in vec2 a_uv;
layout(location = 4) in vec4 a_tangent;

uniform mat4 u_view_proj;
uniform mat4 u_model;
uniform mat3 u_normal_mat;

out vec3 v_color;
out vec3 v_normal;
out vec2 v_uv;
out vec4 v_tangent;
out vec3 v_world;

void main() {
  vec4 world_pos = u_model * vec4(a_position, 1.0);
  gl_Position = u_view_proj * world_pos;
  v_normal = u_normal_mat * a_normal;
  v_color = a_color;
  v_uv = a_uv;
  v_tangent = vec4(u_normal_mat * a_tangent.xyz, a_tangent.w);
  v_world = world_pos.xyz;
}
`;
  const params_block = params.map((name) => `uniform vec4 ${name};`).join("\n");
  const fragment = `#version 300 es
precision highp float;

in vec3 v_color;
in vec3 v_normal;
in vec2 v_uv;
in vec4 v_tangent;
in vec3 v_world;

uniform vec4 u_light_dir;
uniform vec4 u_light_color;
uniform vec4 u_ambient;
uniform vec4 u_albedo;
uniform vec4 u_maps;
uniform vec4 u_uv_transform;
uniform vec4 u_roughness_channel;
uniform vec4 u_metallic_channel;
uniform vec4 u_flags;
uniform vec4 u_emission;
uniform vec4 u_fog_color;
uniform vec4 u_fog_data;
uniform vec4 u_fog_data2;
uniform vec4 u_cam_pos;
uniform sampler2D u_albedo_texture;
uniform sampler2D u_normal_texture;
uniform sampler2D u_roughness_texture;
uniform sampler2D u_metallic_texture;
uniform sampler2D u_emission_texture;
${params_block}

out vec4 out_color;

vec3 lighting() {
  return u_light_color.rgb * max(dot(normalize(v_normal), u_light_dir.xyz), 0.0) + u_ambient.rgb;
}

float channel(sampler2D tex, vec2 uv, vec4 mask) {
  return dot(texture(tex, uv), mask);
}

float fog_amount() {
  float dist = length(v_world - u_cam_pos.xyz);
  if (u_fog_data.y < 0.5) {
    return 1.0 - exp(-u_fog_data.x * u_fog_data.x * dist * dist);
  }
  float fade = clamp((dist - u_fog_data.z) / max(u_fog_data.w - u_fog_data.z, 0.0001), 0.0, 1.0);
  return pow(fade, u_fog_data2.z);
}

float height_fog_factor() {
  return exp2(-abs(u_fog_data2.y) * (v_world.y - u_fog_data2.x));
}

vec4 fs_fragment() {
  vec2 uv = v_uv * u_uv_transform.xy + u_uv_transform.zw;
  vec3 color = mix(vec3(1.0), v_color, u_flags.y);
  vec3 normal = v_normal;
  if (u_flags.x > 0.5 && u_maps.z != 0.0) {
    vec3 tangent_normal = texture(u_normal_texture, uv).rgb * 2.0 - 1.0;
    vec3 t = normalize(v_tangent.xyz - normal * dot(v_tangent.xyz, normal));
    vec3 b = normalize(cross(normal, t)) * v_tangent.w;
    normal = normalize(t * tangent_normal.x * u_maps.z + b * tangent_normal.y * u_maps.z + normal * tangent_normal.z);
  }
  vec4 tex_albedo = texture(u_albedo_texture, uv);
  vec3 albedo = u_albedo.rgb * tex_albedo.rgb;
  float roughness = u_maps.x * channel(u_roughness_texture, uv, u_roughness_channel);
  float metallic = u_maps.y * channel(u_metallic_texture, uv, u_metallic_channel);
  vec3 emission_mask = mix(vec3(1.0), texture(u_emission_texture, uv).rgb, u_flags.w);
  vec3 emission = clamp(u_emission.rgb, 0.0, 4.0) * u_emission.a * emission_mask;
  vec3 light_dir = u_light_dir.xyz;
  vec3 light_color = u_light_color.rgb;
  vec3 ambient = u_ambient.rgb;
${glsl_capture(body)}
  return vec4(lit.rgb, u_albedo.a * tex_albedo.a * (1.0 - u_maps.w) * lit.a);
}

void main() {
  vec4 lit = fs_fragment();
  float fog = min(fog_amount() * height_fog_factor(), 1.0);
  vec3 fogged = mix(lit.rgb, u_fog_color.rgb, fog * u_fog_color.a);
  out_color = vec4(fogged, lit.a);
}
`;
  return { vertex, fragment };
}
/**
 * Camera uniform content in float order: view_proj 0-15, light_dir 16-19,
 * light_color 20-23, ambient 24-27, fog_color 28-31, fog_data 32-35, fog_data2
 * 36-39, cam_pos 40-43.
 */
export function fill_camera(
  scratch: Float32Array,
  view_proj: Float32Array,
  light_dir: Vector3,
  light_color: Color,
  ambient: Color,
  /** Fog from the frame, or null to fill the disabled block. */
  fog: RenderFog | null,
  /** Any x/y/z point, the camera position to measure fog distance from. */
  camera_position: { x: number; y: number; z: number },
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
  scratch[28] = fog?.color.r ?? 0;
  scratch[29] = fog?.color.g ?? 0;
  scratch[30] = fog?.color.b ?? 0;
  // fog_color.a doubles as the fog on/off switch; 0 means the shader skips fog.
  scratch[31] = fog ? 1 : 0;
  // fog_data: density, mode (0 exponential, 1 depth), depth begin, depth end.
  scratch[32] = fog?.density ?? 0;
  scratch[33] = fog?.mode ?? 0;
  scratch[34] = fog?.depth_begin ?? 0;
  scratch[35] = fog?.depth_end ?? 0;
  // fog_data2: height, height density, depth curve.
  scratch[36] = fog?.height ?? 0;
  scratch[37] = fog?.height_density ?? 0;
  scratch[38] = fog?.depth_curve ?? 0;
  scratch[40] = camera_position.x;
  scratch[41] = camera_position.y;
  scratch[42] = camera_position.z;
}

/** One-hot vec4 mask for a texture channel: 0 red, 1 green, 2 blue, 3 alpha. */
function channel_mask(channel: number): [number, number, number, number] {
  const mask = [0, 0, 0, 0];
  const slot = Math.abs(Math.trunc(channel)) % 4;
  mask[slot] = 1;
  return mask as [number, number, number, number];
}

/**
 * The built-in shader a StandardMaterial3D draws with. The harness samples the
 * albedo/normal/roughness/metallic maps and applies fog and transparency after
 * the body; this body supplies the lit RGB.
 */
export const LIT_SHADER = Shader.lit({
  webgpu_body: `  return vec4f(albedo * color * lighting(normal) + emission, 1.0);`,
  webgl_body: `  return vec4(albedo * color * lighting() + emission, 1.0);`,
});

/**
 * Draw uniform content in float order: model 0-15, normal matrix 16-27,
 * albedo 28-31, maps 32-35, uv_transform 36-39, roughness_channel 40-43,
 * metallic_channel 44-47, flags 48-51, emission 52-55. `maps` holds
 * roughness, metallic, normal scale, and the transparency. `flags` holds
 * has-tangents, use-vertex-color, and has-emission-texture. `emission`
 * holds the color with the energy multiplier in alpha.
 */
export function fill_draw(
  scratch: Float32Array,
  model: Float32Array,
  normal_matrix: Float32Array,
  material: Material,
  transparency: number,
  has_tangents: boolean,
): void {
  scratch.fill(0);
  scratch.set(model, 0);
  scratch.set(normal_matrix, 16);
  if (material instanceof StandardMaterial3D) {
    scratch[28] = material.albedo.r;
    scratch[29] = material.albedo.g;
    scratch[30] = material.albedo.b;
    scratch[31] = material.albedo.a;
    scratch[32] = material.roughness;
    scratch[33] = material.metallic;
    scratch[34] = material.normal_texture ? material.normal_scale : 0;
    scratch[35] = transparency;
    scratch[36] = material.uv1_scale.x;
    scratch[37] = material.uv1_scale.y;
    scratch[38] = material.uv1_offset.x;
    scratch[39] = material.uv1_offset.y;
    const rough_mask = channel_mask(material.roughness_texture_channel);
    scratch[40] = rough_mask[0];
    scratch[41] = rough_mask[1];
    scratch[42] = rough_mask[2];
    scratch[43] = rough_mask[3];
    const metal_mask = channel_mask(material.metallic_texture_channel);
    scratch[44] = metal_mask[0];
    scratch[45] = metal_mask[1];
    scratch[46] = metal_mask[2];
    scratch[47] = metal_mask[3];
    scratch[48] = has_tangents && material.normal_texture ? 1 : 0;
    scratch[49] = material.vertex_color_use_as_albedo ? 1 : 0;
    scratch[51] = material.emission_texture ? 1 : 0;
    if (material.emission_enabled) {
      scratch[52] = material.emission.r;
      scratch[53] = material.emission.g;
      scratch[54] = material.emission.b;
      scratch[55] = material.emission_energy_multiplier;
    }
  } else {
    scratch[31] = 1;
    scratch[48] = has_tangents ? 1 : 0;
  }
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
