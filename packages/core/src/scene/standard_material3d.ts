import { Color } from "../math/color.js";

/** Godot 4 StandardMaterial3D with the foundation's three fields. */
export class StandardMaterial3D {
  albedo = Color.WHITE;
  roughness = 1.0;
  metallic = 0.0;
}
