import { Node } from "./node.js";
import type { TreeHost } from "./tree_host.js";
import { PackedScene } from "./packed_scene.js";
import { Renderer, type BackendPreference } from "../render/renderer.js";
import { Input } from "../input/input.js";
import type { InputEvent } from "../input/events.js";
import { Signal } from "./signal.js";

/** Options for `SceneTree.init`. */
export interface TreeInit {
  canvas: HTMLCanvasElement;
  preference?: BackendPreference;
}

/** Called when a node's `_process` or `_ready` throws. */
export type NodeErrorHook = (node: Node, error: unknown, where: "process" | "ready") => void;

/** Owns the hidden root, calls `_process` in tree order, and draws to a canvas after `init`. */
export class SceneTree implements TreeHost {
  private readonly _root = new Node();
  private readonly _queue: Node[] = [];
  private _renderer: Renderer | null = null;
  private _raf = 0;
  private _last_time = 0;

  /** Godot 4 `paused`: a paused tree skips `_process` but keeps drawing. */
  paused = false;

  /** Receives script errors from `_process` and `_ready`. */
  on_node_error: NodeErrorHook | null = null;

  private readonly _timers: SceneTreeTimer[] = [];
  private _current_scene: Node | null = null;
  /** Fetched by the runtime; `change_scene_to_file` uses it to load `.cscene` files. */
  scene_loader: ((path: string) => Promise<Node>) | null = null;

  constructor() {
    this._root.set_name("root");
    this._root._become_root(this);
  }

  /**
   * Picks a render backend and starts the frame loop: `_process` in tree
   * order, then a draw. WebGPU first; WebGL2 when the browser lacks it.
   */
  async init(view: TreeInit): Promise<void> {
    if (this._renderer !== null) {
      throw new Error("SceneTree is already initialized.");
    }
    this._renderer = await Renderer.create(view.canvas, view.preference ?? "webgpu");
    Input.event_handler = this._handle_input;
    this._last_time = performance.now();
    const tick = (now: number): void => {
      // Clamped so a background tab does not feed a giant delta at return.
      const delta = Math.min((now - this._last_time) / 1000, 0.1);
      this._last_time = now;
      this.tick(delta);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  /** Renderer backend in use, or null before `init`. */
  get renderer_name(): "webgpu" | "webgl2" | null {
    return this._renderer?.name ?? null;
  }

  /** Stops the frame loop and releases the backend. The tree keeps working headless. */
  close(): void {
    if (this._raf !== 0) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    if (Input.event_handler === this._handle_input) {
      Input.event_handler = null;
    }
    this._renderer?.dispose();
    this._renderer = null;
  }

  /** One frame. The walk runs every frame; each node's `process_mode` gates `_process`. */
  tick(delta: number): void {
    Input._advance_frame();
    this._process(delta);
    this._advance_timers(delta);
    this._renderer?.render_tree(this);
  }

  /** Godot 4 `current_scene`: the root's scene node, or null. */
  get_current_scene(): Node | null {
    return this._current_scene;
  }

  /**
   * Turns script-path metas into live script classes on a fresh node tree.
   * The runtime installs this; PackedScene instances of `.cscene` files go
   * through it inside `change_scene_to_packed`, exactly how Godot packs
   * compiled scripts into its own PackedScenes.
   */
  node_weaver: ((node: Node) => Promise<Node>) | null = null;

  /** Godot 4 `change_scene_to_packed`: weaves (if installed) then swaps. */
  async change_scene_to_packed(packed: PackedScene): Promise<void> {
    const next = this.node_weaver ? await this.node_weaver(packed.instantiate()) : packed.instantiate();
    this.change_scene_to_node(next);
  }

  /** Swaps the current scene at the end of the frame; the old scene queues free. */
  change_scene_to_node(next: Node): void {
    if (this._current_scene) {
      this._current_scene.queue_free();
    }
    this.get_root().add_child(next);
    this._current_scene = next;
  }

  /**
   * Godot 4 `change_scene_to_file`. The runtime supplies the loader; false
   * means no loader was installed or the file could not load.
   */
  async change_scene_to_file(path: string): Promise<boolean> {
    if (this.scene_loader === null) {
      return false;
    }
    try {
      const node = await this.scene_loader(path);
      const woven = this.node_weaver ? await this.node_weaver(node) : node;
      this.change_scene_to_node(woven);
      return true;
    } catch (error) {
      this.on_node_error?.(
        this.get_root(),
        new Error(`change_scene_to_file failed for "${path}": ${error instanceof Error ? error.message : String(error)}`),
        "process",
      );
      return false;
    }
  }

  /**
   * Godot 4 `SceneTree.create_timer`: an awaitable timer independent of the
   * node tree; `process_always` (true by default) keeps it running while the
   * tree is paused. Await `timer.timeout`.
   */
  create_timer(time_sec: number, process_always = true): SceneTreeTimer {
    const timer = new SceneTreeTimer(Math.max(time_sec, 0), process_always);
    this._timers.push(timer);
    return timer;
  }

  /**
   * Godot 4 SceneTree input dispatch: the event goes to every node that
   * overrides `_input`, in tree order.
   */
  push_input(event: InputEvent): void {
    const walk = (node: Node): void => {
      if (node._input !== Node.prototype._input) {
        node._input(event);
      }
      for (const child of node.get_children()) {
        walk(child);
      }
    };
    walk(this._root);
  }

  /** @internal */
  _report_node_error(node: Node, error: unknown, where: "process" | "ready"): void {
    this.on_node_error?.(node, error, where);
  }

  private readonly _handle_input = (event: InputEvent): void => {
    this.push_input(event);
  };

  get_root(): Node {
    return this._root;
  }

  queue_delete(node: Node): void {
    this._queue.push(node);
  }

  get_nodes_in_group(group: string): Node[] {
    const found: Node[] = [];
    const walk = (node: Node): void => {
      if (node.is_in_group(group)) {
        found.push(node);
      }
      for (const child of node.get_children()) {
        walk(child);
      }
    };
    walk(this._root);
    return found;
  }

  /** One frame. `delta` is seconds. Queued nodes leave the tree at the end. */
  _process(delta: number): void {
    this._root._process_branch(delta, this.paused, this.paused);
    const batch = this._queue.splice(0);
    for (const node of batch) {
      const parent = node.get_parent();
      if (parent) {
        parent.remove_child(node);
      }
      node._clear_queue();
    }
  }

  /** Advances tree timers; a paused tree still runs the `process_always` ones, like Godot's default. */
  private _advance_timers(delta: number): void {
    for (let i = this._timers.length - 1; i >= 0; i -= 1) {
      const timer = this._timers[i];
      if (this.paused && !timer.process_always) {
        continue;
      }
      timer.time_left -= delta;
      if (timer.time_left <= 0) {
        this._timers.splice(i, 1);
        timer.timeout.emit();
      }
    }
  }
}

/** Godot 4 SceneTreeTimer: created by `SceneTree.create_timer`; await `.timeout`. */
export class SceneTreeTimer {
  readonly timeout = new Signal();
  /** Seconds remaining, counting down every frame it is allowed to run. */
  time_left: number;
  readonly process_always: boolean;

  constructor(time_sec: number, process_always: boolean) {
    this.time_left = time_sec;
    this.process_always = process_always;
  }
}
