import {
  BoxMesh,
  Color,
  DirectionalLight3D,
  Input,
  InputEvent,
  load,
  MeshInstance3D,
  Node3D,
  PackedScene,
  StandardMaterial3D,
  Vector3,
} from "@corbel/core";

/** The demo Player: a body mesh that spins, using the project's action binds. */
export default class Player extends Node3D {
  override _ready(): void {
    const body = this.get_node("Body") as MeshInstance3D;
    body.geometry = new BoxMesh(new Vector3(1, 1, 1));
    const material = new StandardMaterial3D();
    material.albedo = Color.html("#e07a26");
    body.material_override = material;

    const sun = new DirectionalLight3D();
    sun.rotation = new Vector3(-0.6, 0.4, 0);
    this.add_child(sun);
  }

  override _process(delta: number): void {
    const body = this.get_node("Body") as MeshInstance3D;
    let speed = 1.5;
    if (Input.is_action_pressed("spin_fast")) {
      speed = 12;
    }
    if (Input.is_action_pressed("spin_slow")) {
      speed = 0.3;
    }
    body.rotation = body.rotation.add(new Vector3(0, delta * speed, delta * speed * 0.4));

    // Godot's level switch: a bind loads the next scene's PackedScene.
    if (Input.is_action_just_pressed("next_scene")) {
      void this.change_level("res://level2.cscene");
    }
  }

  override _input(event: InputEvent): void {
    void event;
  }

  private async change_level(path: string): Promise<void> {
    const packed = (await load(path)) as PackedScene | null;
    if (packed !== null && this.get_tree() && packed.get_name() === "Level2") {
      this.get_tree()!.change_scene_to_packed(packed);
    }
  }
}
