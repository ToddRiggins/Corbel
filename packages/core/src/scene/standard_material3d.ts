import { Color } from "../math/color.js";
import { Material } from "./material.js";

/** Godot 4 StandardMaterial3D with the foundation's three fields. */
export class StandardMaterial3D extends Material {
  albedo = Color.WHITE;
  roughness = 1.0;
  metallic = 0.0;
}
