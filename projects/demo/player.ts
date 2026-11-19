import { BoxMesh, Color, DirectionalLight3D, MeshInstance3D, Node3D, StandardMaterial3D, Vector3 } from "@corbel/core";

export default class Player extends Node3D {
  speed = 3;

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
    body.rotation = body.rotation.add(new Vector3(0, delta * this.speed, delta * this.speed * 0.4));
  }
}
