import { Node } from "./node.js";
import type { TreeHost } from "./tree_host.js";
import { Renderer, type BackendPreference } from "../render/renderer.js";
import { Input } from "../input/input.js";
import type { InputEvent } from "../input/events.js";

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

  /** One frame. `_process` is skipped while `paused`; the draw still happens. */
  tick(delta: number): void {
    Input._advance_frame();
    if (!this.paused) {
      this._process(delta);
    }
    this._renderer?.render_tree(this);
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
    this._root._process_branch(delta);
    const batch = this._queue.splice(0);
    for (const node of batch) {
      const parent = node.get_parent();
      if (parent) {
        parent.remove_child(node);
      }
      node._clear_queue();
    }
  }
}
