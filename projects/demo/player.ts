import { Node3D } from "@corbel/core";

export default class Player extends Node3D {
  speed = 2;

  override _process(delta: number): void {
    this.position.x += this.speed * delta;
  }
}
