import {
  BoxMesh,
  Camera3D,
  Color,
  MeshInstance3D,
  Node3D,
  OmniLight3D,
  SpotLight3D,
  StandardMaterial3D,
  Vector3,
} from "@corbel/core";

/**
 * Example: point lights. OmniLight3D radiates from its position over
 * `range`; SpotLight3D clips to a cone of `spot_angle` degrees. Both carry
 * light_color, light_energy, and a quadratic falloff.
 */
export default class LightsExample extends Node3D {
  override _ready(): void {
    const camera = new Camera3D();
    camera.set_name("Camera");
    camera.position = new Vector3(0, 2.4, 5.4);
    camera.rotation = new Vector3(-0.3, 0, 0);
    this.add_child(camera);

    // Two walls the point lights paint.
    const wall_shape = new BoxMesh(new Vector3(4.4, 2.6, 0.16));
    const wall_material = new StandardMaterial3D();
    wall_material.albedo = Color.html("#c8c8d2");
    for (const [x, z, yaw] of [[-2, -1, 0.5], [2, -1, -0.5]] as const) {
      const wall = new MeshInstance3D();
      wall.set_name(`Wall_${x}`);
      wall.mesh = wall_shape;
      wall.position = new Vector3(x, 0, z);
      wall.rotation = new Vector3(0, yaw, 0);
      wall.material_override = wall_material;
      this.add_child(wall);
    }

    // A warm omni over the left wall.
    const omni = new OmniLight3D();
    omni.set_name("Omni");
    omni.light_color = Color.html("#ffb96b");
    omni.range = 7;
    omni.energy = 2.0;
    omni.attenuation = 1;
    omni.position = new Vector3(-1.6, 0.8, 0.9);
    this.add_child(omni);

    // The lamp gizmo glows through its own emissive material.
    const lamp = new MeshInstance3D();
    lamp.set_name("Lamp");
    lamp.mesh = new BoxMesh(new Vector3(0.35, 0.35, 0.35));
    lamp.position = new Vector3(-1.6, 0.8, 0.9);
    const lamp_material = new StandardMaterial3D();
    lamp_material.albedo = Color.html("#222222");
    lamp_material.emission_enabled = true;
    lamp_material.emission = Color.html("#ffc27a");
    lamp_material.emission_energy_multiplier = 2.0;
    lamp.material_override = lamp_material;
    this.add_child(lamp);

    // A cool spot aimed at the right wall.
    const spot = new SpotLight3D();
    spot.set_name("Spot");
    spot.light_color = Color.html("#8fd8ff");
    spot.range = 12;
    spot.energy = 3.0;
    spot.spot_angle = 20;
    spot.spot_attenuation = 1.5;
    spot.position = new Vector3(2.2, 2.6, 0.7);
    spot.rotation = new Vector3(-1.2, 0, 0);
    this.add_child(spot);
  }
}
