import {
  Shader,
  BoxMesh,
  Camera3D,
  Color,
  DirectionalLight3D,
  MeshInstance3D,
  ShaderMaterial,
  Node3D,
  StandardMaterial3D,
  Vector3,
} from "@corbel/core";

/**
 * Example: directional shadows. shadow_enabled on a DirectionalLight3D
 * opens the depth pass from the light; shadow_range sets the ortho box about
 * the camera and shadow_bias pads the depth compare. Every block below
 * casts a shadow patch on the floor.
 */
export default class ShadowsExample extends Node3D {
  private probes = 0;
  private block_material_cache: StandardMaterial3D | null = null;

  private block_material(): StandardMaterial3D {
    if (this.block_material_cache === null) {
      const material = new StandardMaterial3D();
      material.albedo = Color.html("#a0b040");
      this.block_material_cache = material;
    }
    return this.block_material_cache;
  }

  override _ready(): void {
    // The numeric probe: a ShaderMaterial cube behind the occluder slab whose
    // red channel reads shadow_factor live.
    const occluder = new MeshInstance3D();
    occluder.set_name("Occluder");
    occluder.mesh = new BoxMesh(new Vector3(0.3, 1.6, 2.2));
    occluder.position = new Vector3(-1.1, 0.2, 0.6);
    occluder.material_override = this.block_material();
    this.add_child(occluder);

    const probe_shader = Shader.lit({
      uniforms: [],
      texture_uniforms: [],
      webgpu_body: `  return vec4f(shadow_factor(in.world) * 0.8 + 0.1, 0.0, 0.0, 1.0);`,
      webgl_body: `  return vec4(shadow_factor(v_world) * 0.8 + 0.1, 0.0, 0.0, 1.0);`,
    });
    const probe_node = new MeshInstance3D();
    probe_node.set_name("ShadowProbe");
    probe_node.mesh = new BoxMesh(new Vector3(0.5, 0.5, 0.5));
    probe_node.position = new Vector3(0.1, 0.6, 1.3);
    const probe_material = new ShaderMaterial(probe_shader);
    probe_node.material_override = probe_material;
    this.add_child(probe_node);

    const camera = new Camera3D();
    camera.set_name("Camera");
    camera.position = new Vector3(6.5, 3.2, 6.5);
    camera.rotation = new Vector3(-0.2, 0.55, 0);
    this.add_child(camera);

    const sun = new DirectionalLight3D();
    sun.set_name("Sun");
    sun.rotation = new Vector3(0.9, 0.8, 0);
    sun.light_color = Color.html("#ffe8c0");
    sun.shadow_enabled = true;
    sun.shadow_range = 10;
    sun.shadow_bias = 0.002;
    this.add_child(sun);

    // The floor.
    const floor = new MeshInstance3D();
    floor.set_name("Floor");
    floor.mesh = new BoxMesh(new Vector3(10, 0.2, 10));
    floor.position = new Vector3(0, -0.7, 0);
    const floor_shader = Shader.lit({
      uniforms: [],
      texture_uniforms: [],
      webgpu_body: "  return vec4f(0.1 + shadow_factor(in.world) * 0.9, 0.05, 0.3, 1.0);",
      webgl_body: "  return vec4(0.1 + shadow_factor(v_world) * 0.9, 0.05, 0.3, 1.0);",
    });
    const floor_material = new ShaderMaterial(floor_shader);
    floor.material_override = floor_material;
    this.add_child(floor);

    // Blocks: each one shadows the floor toward the camera side.
    // The same olive material the occluder and blocks share.
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
      block.material_override = this.block_material();
      this.add_child(block);
    }
  }
}
