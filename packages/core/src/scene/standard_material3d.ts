import { Color } from "../math/color.js";
import { Vector2 } from "../math/vector2.js";
import { Material } from "./material.js";
import { Texture2D } from "./texture.js";

/**
 * Godot 4 BaseMaterial3D texture channel: which color channel a
 * roughness/metallic map reads. `R` for roughness and `B` for metallic match
 * Godot's ORM-style defaults.
 */
export const TextureChannel = {
  RED: 0,
  GREEN: 1,
  BLUE: 2,
  ALPHA: 3,
} as const;

export type TextureChannel = number;

/**
 * Godot 4 StandardMaterial3D. The albedo texture and color paint the surface;
 * a normal map reshapes the shading; the roughness and metallic maps read one
 * color channel each, the way Godot's channel masks work.
 */
export class StandardMaterial3D extends Material {
  albedo = Color.WHITE;
  /** Godot 4 `roughness`. 0 is a mirror, 1 is matte. */
  roughness = 1.0;
  /** Godot 4 `metallic`. 0 is dielectric, 1 is a colored mirror. */
  metallic = 0.0;
  /** Godot 4 `albedo_texture`: multiplies the albedo color. */
  albedo_texture: Texture2D | null = null;
  /** Godot 4 `albedo_texture` multiplied first by the vertex color. */
  vertex_color_use_as_albedo = false;
  /** Godot 4 `normal_texture`: tangent-space normal map; needs mesh tangents. */
  normal_texture: Texture2D | null = null;
  /** Godot 4 `normal_scale`: pushes the normal-map shading in and out. */
  normal_scale = 1.0;
  /** Godot 4 `roughness_texture`: per-pixel roughness, read on one channel. */
  roughness_texture: Texture2D | null = null;
  /** Godot 4 `roughness_texture_channel`. */
  roughness_texture_channel: TextureChannel = TextureChannel.RED;
  /** Godot 4 `metallic_texture`: per-pixel metallic, read on one channel. */
  metallic_texture: Texture2D | null = null;
  /** Godot 4 `metallic_texture_channel`. */
  metallic_texture_channel: TextureChannel = TextureChannel.BLUE;
  /** Godot 4 `uv1_scale`: UVs multiply this before textures sample. */
  uv1_scale: Vector2 = new Vector2(1, 1);
  /** Godot 4 `uv1_offset`: UVs add this after the scale. */
  uv1_offset: Vector2 = new Vector2(0, 0);
}
