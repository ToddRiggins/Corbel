import { BoxMesh, Color, DirectionalLight3D, MeshInstance3D, SceneTree, StandardMaterial3D, Vector3 } from "@corbel/core";
import { boot, camera, floor, status } from "./common.js";

// Directional shadows: sun.shadow_enabled turns on a depth pass from the
// light's direction, and the shaded surfaces read it with percentage-closer
// filtering. shadow_range sets the ortho box about the camera; shadow_bias
// pads the depth compare.

const tree = new SceneTree();
camera(tree, [6.5, 3.2, 6.5], [-0.2, 0.55, 0]);
floor(tree, 8);

const sun = new DirectionalLight3D();
sun.set_name("Sun");
sun.rotation = new Vector3(1.35, 0.8, 0);
sun.light_color = Color.html("#ffe8c0");
sun.shadow_enabled = true;
sun.shadow_range = 10;
sun.shadow_bias = 0.02;
tree.get_root().add_child(sun);

const block_material = new StandardMaterial3D();
block_material.albedo = Color.html("#a0b040");
const blocks: Array<[number, number, number, number, number, number]> = [
  [0, -0.2, 0, 0.9, 1.0, 0.9],
  [1.8, -0.4, -1.4, 0.8, 0.6, 1.6],
  [-1.9, -0.45, 1.1, 1.4, 0.5, 0.9],
  [2.4, -0.2, 0.8, 0.5, 1.2, 0.5],
];
let index = 0;
for (const [x, y, z, sx, sy, sz] of blocks) {
  const block = new MeshInstance3D();
  block.set_name(`Block_${index}`);
  index += 1;
  block.mesh = new BoxMesh(new Vector3(sx, sy, sz));
  block.position = new Vector3(x, y, z);
  block.material_override = block_material;
  tree.get_root().add_child(block);
}

void boot(tree).then(() => status("running — a low sun with shadow_enabled: every block casts a shadow patch toward the camera side."));
