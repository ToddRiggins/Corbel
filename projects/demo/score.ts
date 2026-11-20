import { Node, Signal } from "@corbel/core";

/** The demo's Globals autoload: a score keeper every script can reach. */
export default class Score extends Node {
  points = 0;
  readonly changed = new Signal<[number]>();

  override _ready(): void {
    console.log("Globals: Score is ready under /root/Score.");
  }

  add(points: number): void {
    this.points += points;
    this.changed.emit(this.points);
  }
}
