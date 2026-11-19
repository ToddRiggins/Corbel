import { Node } from "./node.js";
import type { TreeHost } from "./tree_host.js";

/** Owns the hidden root and calls `_process` in tree order. */
export class SceneTree implements TreeHost {
  private readonly _root = new Node();
  private readonly _queue: Node[] = [];

  constructor() {
    this._root.set_name("root");
    this._root._become_root(this);
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
