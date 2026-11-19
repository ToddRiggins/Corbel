import { Node } from "./node.js";
import type { TreeHost } from "./tree_host.js";
import { Renderer, type BackendPreference } from "../render/renderer.js";

/** Options for `SceneTree.init`. */
export interface TreeInit {
  canvas: HTMLCanvasElement;
  preference?: BackendPreference;
}

/** Owns the hidden root, calls `_process` in tree order, and draws to a canvas after `init`. */
export class SceneTree implements TreeHost {
  private readonly _root = new Node();
  private readonly _queue: Node[] = [];
  private _renderer: Renderer | null = null;
  private _raf = 0;
  private _last_time = 0;

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
    this._last_time = performance.now();
    const tick = (now: number): void => {
      // Clamped so a background tab does not feed a giant delta at return.
      const delta = Math.min((now - this._last_time) / 1000, 0.1);
      this._last_time = now;
      this._process(delta);
      this._renderer?.render_tree(this);
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
    this._renderer?.dispose();
    this._renderer = null;
  }

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
