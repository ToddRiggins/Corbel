import { Node3D, DirectionalLight3D, BoxMesh, Color, Input, load, MeshInstance3D, StandardMaterial3D, Texture2D, Vector3 } from "@corbel/core";
import Score from "./score.ts";

/** Level2's root script: a purple portal scene, reached by the L bind in Main. */
export default class Level2 extends Node3D {
  /** How many _process ticks this node has seen (probe/debug). */
  frames = 0;

  override _ready(): void {
    const portal = this.get_node("Portal") as MeshInstance3D;
    portal.geometry = new BoxMesh(new Vector3(1.2, 2.2, 0.4));
    const material = new StandardMaterial3D();
    void load("res://textures/portal.png").then((resource) => {
      if (resource instanceof Texture2D) {
        material.albedo_texture = resource;
      }
    });
    portal.material_override = material;

    const sun = new DirectionalLight3D();
    sun.rotation = new Vector3(-0.7, 0.5, 0);
    this.add_child(sun);

    // The autoload survived the scene swap: everything added in Main is still here.
    const score = this.get_node("/root/Score") as Score;
    console.log("Level2 loaded. Autoload points:", score.points);
  }

  override _process(_delta: number): void {
    this.frames += 1;
    // The same bind goes back to Main; keep pressing L to bounce between levels.
    if (Input.is_action_just_pressed("next_scene") && this.get_tree()) {
      void this.get_tree()!.change_scene_to_file("res://main.cscene");
    }
  }
}
