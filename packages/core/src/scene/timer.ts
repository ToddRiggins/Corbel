import { Signal } from "./signal.js";
import { Node } from "./node.js";
import { SceneTree } from "./scene_tree.js";

/** Godot 4 Timer. Counts a `wait_time` in the tree's process ticks; emits `timeout` when done. */
export class Timer extends Node {
  readonly timeout = new Signal();

  /** Seconds between the start and `timeout`. Settable while stopped; changing while running restarts nothing. */
  wait_time = 1.0;
  /** Stop after one timeout instead of repeating. */
  one_shot = false;
  /** Call `start` when entering the tree, Godot style. */
  autostart = false;

  private _time_left = 0;
  private _running = false;

  /** Starts counting, restarting from the top. Passing `time_sec` sets `wait_time` first. */
  start(time_sec?: number): void {
    if (time_sec !== undefined) {
      this.wait_time = time_sec;
    }
    this._time_left = this.wait_time;
    this._running = true;
  }

  stop(): void {
    this._running = false;
    this._time_left = 0;
  }

  is_stopped(): boolean {
    return !this._running;
  }

  /** Seconds left until `timeout`; negative while stopped. */
  get_time_left(): number {
    return this._running ? this._time_left : -1;
  }

  override _process(delta: number): void {
    if (!this._running) {
      return;
    }
    this._time_left -= delta;
    if (this._time_left <= 0) {
      this.timeout.emit();
      if (this.one_shot) {
        this.stop();
      } else {
        this._time_left += this.wait_time > 0 ? this.wait_time : delta;
      }
    }
  }

  override _ready(): void {
    if (this.autostart) {
      this.start();
    }
  }

  /** The tree the timer is in, Godot style. */
  override get_tree(): SceneTree | null {
    return super.get_tree();
  }
}
