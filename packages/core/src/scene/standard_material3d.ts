import { Color } from "../math/color.js";
import { Material } from "./material.js";
import { Texture2D } from "./texture.js";

/** Godot 4 StandardMaterial3D with the foundation's fields. Textures multiply the albedo color. */
export class StandardMaterial3D extends Material {
  albedo = Color.WHITE;
  roughness = 1.0;
  metallic = 0.0;
  albedo_texture: Texture2D | null = null;
}
