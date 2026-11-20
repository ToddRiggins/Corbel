import { BoxMesh, Color, MeshInstance3D, OmniLight3D, SpotLight3D, StandardMaterial3D, Vector3 } from "@corbel/core";
import { boot, camera, dim_tree, floor, status } from "./common.js";

// Omni and spot lights: the point lights that light each surface from its
// position, over a range, with a cone for spots.

const { tree } = dim_tree();
camera(tree, [0, 2.4, 5.4], [-0.3, 0, 0]);
floor(tree, 9);

// Warm omni close to the left wall.
const omni = new OmniLight3D();
omni.set_name("Omni");
omni.light_color = Color.html("#ffb96b");
omni.range = 7;
omni.energy = 2.0;
omni.attenuation = 1;
omni.position = new Vector3(-1.6, 0.7, 0.8);
tree.get_root().add_child(omni);

// Cool spot from above, aimed into the right wall.
const spot = new SpotLight3D();
spot.set_name("Spot");
spot.light_color = Color.html("#8fd8ff");
spot.range = 12;
spot.energy = 3.0;
spot.spot_angle = 20;
spot.spot_attenuation = 1.5;
spot.position = new Vector3(2.2, 2.6, 0.6);
spot.rotation = new Vector3(-1.2, 0, 0);
tree.get_root().add_child(spot);

// Two walls the point lights paint.
const wall_shape = new BoxMesh(new Vector3(4.4, 2.6, 0.16));
const wall_material = new StandardMaterial3D();
wall_material.albedo = Color.html("#c8c8d2");
for (const [x, y, z, yaw] of [[-2, 0, -1, 0.5], [2, 0, -1, -0.5]] as const) {
  const wall = new MeshInstance3D();
  wall.set_name("Wall");
  wall.mesh = wall_shape;
  wall.position = new Vector3(x, y, z);
  wall.rotation = new Vector3(0, yaw, 0);
  wall.material_override = wall_material;
  tree.get_root().add_child(wall);
}

// The lamp: a dark box that glows through its emissive material.
const lamp = new MeshInstance3D();
lamp.set_name("OmniGizmo");
lamp.mesh = new BoxMesh(new Vector3(0.35, 0.35, 0.35));
lamp.position = new Vector3(-1.6, 0.7, 0.8);
const lamp_material = new StandardMaterial3D();
lamp_material.albedo = Color.html("#222222");
lamp_material.emission_enabled = true;
lamp_material.emission = Color.html("#ffc27a");
lamp_material.emission_energy_multiplier = 2.0;
lamp.material_override = lamp_material;
tree.get_root().add_child(lamp);

void boot(tree).then(() => status(`running: ${tree.renderer_name} — omni: warm orb on the left wall; spot: cool cone on the right; the omnigizmo glows from its own emission.`));
