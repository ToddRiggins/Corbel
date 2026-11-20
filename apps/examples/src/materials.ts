import { BoxMesh, Camera3D, Color, DirectionalLight3D, Environment, MeshInstance3D, SceneTree, StandardMaterial3D, Texture2D, Vector2, Vector3, WorldEnvironment } from "@corbel/core";
import { boot, status } from "./common.js";

// StandardMaterial3D end to end: every texture map the renderer reads
// (albedo, normal, roughness, metallic), channel masks, uv transform,
// emission, texture-driven alpha, and fog from the Environment.

function make_texture(r: number, g: number, b: number, a: (x: number, y: number) => number): Promise<Texture2D> {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(8, 8);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const slot = (y * 8 + x) * 4;
      image.data[slot] = r;
      image.data[slot + 1] = g;
      image.data[slot + 2] = b;
      image.data[slot + 3] = a(x, y);
    }
  }
  context.putImageData(image, 0, 0);
  return Texture2D.from_base64(canvas.toDataURL());
}

const tree = new SceneTree();
const environment = new Environment();
environment.background_color = Color.html("#22262e");
environment.ambient = Color.html("#3a3a44");
environment.fog_enabled = true;
environment.fog_light_color = Color.html("#a8c8f0");
environment.fog_density = 0.16;
const world = new WorldEnvironment();
world.environment = environment;
tree.get_root().add_child(world);

const camera_node = new Camera3D();
camera_node.set_name("Camera");
camera_node.position = new Vector3(-4.6, 2.6, 7.6);
camera_node.rotation = new Vector3(-0.18, -0.55, 0);
tree.get_root().add_child(camera_node);

const sun_node = new DirectionalLight3D();
sun_node.set_name("Sun");
sun_node.rotation = new Vector3(0.7, 0.4, 0);
sun_node.light_color = Color.html("#d8dcff");
tree.get_root().add_child(sun_node);

// The floor: dark so the lit columns read.
const floor_node = new MeshInstance3D();
floor_node.set_name("Floor");
floor_node.mesh = new BoxMesh(new Vector3(10, 0.2, 9));
floor_node.position = new Vector3(0, -0.7, 0);
const floor_material = new StandardMaterial3D();
floor_material.albedo = Color.html("#6a7080");
floor_material.roughness = 0.75;
floor_node.material_override = floor_material;
tree.get_root().add_child(floor_node);

// Three columns with different map combinations.
const column_shape = new BoxMesh(new Vector3(0.6, 2.4, 0.6));

// 1. The full map set: brick albedo with roughness and metallic masks.
const full = new MeshInstance3D();
full.set_name("FullMaps");
full.mesh = column_shape;
full.position = new Vector3(-2.2, 0.5, 0);
const full_material = new StandardMaterial3D();
full_material.albedo = Color.html("#e08850");
void (async () => {
  full_material.albedo_texture = await make_texture(255, 255, 255, () => 255);
  full_material.roughness_texture = await make_texture(255, 120, 60, () => 255);
  full_material.metallic_texture = await make_texture(40, 40, 255, () => 255);
  full.material_override = full_material;
})();
full_material.uv1_scale = new Vector2(2, 2);
tree.get_root().add_child(full);

// 2. A glowing emission column with a fade mask.
const glow = new MeshInstance3D();
glow.set_name("Emission");
glow.mesh = column_shape;
glow.position = new Vector3(0, 0.5, 0);
const glow_material = new StandardMaterial3D();
glow_material.albedo = Color.html("#181818");
glow_material.emission_enabled = true;
glow_material.emission = Color.html("#66ffcc");
glow_material.emission_energy_multiplier = 2.0;
void (async () => {
  glow_material.emission_texture = await make_texture(255, 255, 255, (x, y) => (x + y < 6 ? 255 : 40));
  glow.material_override = glow_material;
})();
tree.get_root().add_child(glow);

// 3. A transparent veil: its alpha texture decides visibility alone, driven
//    by a normal-map-less material plus ambient so the alpha reads plainly.
const veil = new MeshInstance3D();
veil.set_name("Alpha");
veil.mesh = new BoxMesh(new Vector3(1.2, 2.2, 0.1));
veil.position = new Vector3(2.3, 0.3, 0.6);
const veil_material = new StandardMaterial3D();
veil_material.albedo = Color.html("#8fd8ff");
void (async () => {
  veil_material.albedo_texture = await make_texture(143, 216, 255, (x) => x < 5 ? 255 : Math.round(255 * (1 - (x - 4) / 4)));
  veil.material_override = veil_material;
})();
tree.get_root().add_child(veil);

void boot(tree).then(() => status("running — left: albedo + rough-metal maps on uv x2; middle: emission with a fade mask; right: a texture-alpha veil; fog thickens with distance"));
