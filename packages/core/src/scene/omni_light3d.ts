import { Color } from "../math/color.js";
import { Node3D } from "./node3d.js";

/**
 * Godot 4 OmniLight3D: light radiates from the node's position with a
 * smooth falloff over `range`, Godot's quadratic shape:
 * `att = (1 - (d / range)^2)^2`, zero past the range. `energy` multiplies
 * the color like Godot's light_energy.
 */
export class OmniLight3D extends Node3D {
  light_color = Color.WHITE;
  /** World units the light reaches; brightness falls to zero here. */
  range = 5;
  /** Godot 4 `light_energy`. */
  energy = 1;
  /** Godot 4 `omni_attenuation`: exponent on the falloff curve, 1 by default. */
  attenuation = 1;
}

/**
 * Godot 4 SpotLight3D: light from the node's position into its local -Z,
 * clipped to a half-angle of `spot_angle` degrees around it. Falloff is the
 * omni one plus a cosine cone; Godot's spot_attenuation softens the edge and
 * its `energy` multiplies the color.
 */
export class SpotLight3D extends OmniLight3D {
  /** Godot 4 `spot_angle`: half-angle in degrees (45 gives a 90 degree cone). */
  spot_angle = 45;
  /** Godot 4 `spot_attenuation`: exponent softening the cone edge, 1 by default. */
  spot_attenuation = 1;
}
