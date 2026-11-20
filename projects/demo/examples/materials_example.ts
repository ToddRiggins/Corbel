import {
  BoxMesh,
  Camera3D,
  Color,
  DirectionalLight3D,
  Environment,
  MeshInstance3D,
  Node3D,
  StandardMaterial3D,
  Texture2D,
  Vector2,
  Vector3,
  WorldEnvironment,
} from "@corbel/core";

/**
 * Example: the StandardMaterial3D map set. Every column shows one
 * combination: albedo + rough/metal channel masks with a uv transform, an
 * emissive glow with a mask texture, and a texture-alpha veil. The
 * Environment's fog thickens with distance.
 */
export default class MaterialsExample extends Node3D {
  override _ready(): void {
    void this.build();
  }

  private async build(): Promise<void> {
    const environment = new Environment();
    environment.background_color = Color.html("#22262e");
    environment.ambient = Color.html("#3a3a44");
    environment.fog_enabled = true;
    environment.fog_light_color = Color.html("#a8c8f0");
    environment.fog_density = 0.16;
    const world = new WorldEnvironment();
    world.environment = environment;
    this.add_child(world);

    const camera = new Camera3D();
    camera.set_name("Camera");
    camera.position = new Vector3(-4.6, 2.6, 7.6);
    camera.rotation = new Vector3(-0.18, -0.55, 0);
    this.add_child(camera);

    const sun = new DirectionalLight3D();
    sun.set_name("Sun");
    sun.rotation = new Vector3(0.7, 0.4, 0);
    sun.light_color = Color.html("#d8dcff");
    this.add_child(sun);

    const floor = new MeshInstance3D();
    floor.set_name("Floor");
    floor.mesh = new BoxMesh(new Vector3(10, 0.2, 9));
    floor.position = new Vector3(0, -0.7, 0);
    const floor_material = new StandardMaterial3D();
    floor_material.albedo = Color.html("#6a7080");
    floor_material.roughness = 0.75;
    floor.material_override = floor_material;
    this.add_child(floor);

    const column = new BoxMesh(new Vector3(0.6, 2.4, 0.6));

    // 1. The full map set: roughness on the red channel, metallic on blue,
    //    uv1_scale tiling x2.
    const full = new MeshInstance3D();
    full.set_name("FullMaps");
    full.mesh = column;
    full.position = new Vector3(-2.2, 0.5, 0);
    const full_material = new StandardMaterial3D();
    full_material.albedo = Color.html("#e08850");
    full_material.roughness_texture = await this.make_map(255, 120, 60);
    full_material.metallic_texture = await this.make_map(40, 40, 255);
    full_material.uv1_scale = new Vector2(2, 2);
    full.material_override = full_material;
    this.add_child(full);

    // 2. The glow column: emission with a fade mask.
    const glow = new MeshInstance3D();
    glow.set_name("Glow");
    glow.mesh = column;
    glow.position = new Vector3(0, 0.5, 0);
    const glow_material = new StandardMaterial3D();
    glow_material.albedo = Color.html("#181818");
    glow_material.emission_enabled = true;
    glow_material.emission = Color.html("#66ffcc");
    glow_material.emission_energy_multiplier = 2.0;
    glow_material.emission_texture = await this.make_map(255, 255, 255, (x, y) => (x + y < 6 ? 255 : 40));
    glow.material_override = glow_material;
    this.add_child(glow);

    // 3. The veil: the albedo texture's alpha channel makes it fade on its own.
    const veil = new MeshInstance3D();
    veil.set_name("Veil");
    veil.mesh = new BoxMesh(new Vector3(1.2, 2.2, 0.1));
    veil.position = new Vector3(2.3, 0.3, 0.6);
    const veil_material = new StandardMaterial3D();
    veil_material.albedo = Color.html("#8fd8ff");
    veil_material.albedo_texture = await this.make_map(143, 216, 255, (x) => (x < 5 ? 255 : Math.round(255 * (1 - (x - 4) / 4))));
    veil.material_override = veil_material;
    this.add_child(veil);
  }

  /** An 8x8 procedural texture, decoded the same way a project image is. */
  private make_map(r: number, g: number, b: number, alpha?: (x: number, y: number) => number): Promise<Texture2D> {
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
        image.data[slot + 3] = alpha ? alpha(x, y) : 255;
      }
    }
    context.putImageData(image, 0, 0);
    return Texture2D.from_base64(canvas.toDataURL());
  }
}
