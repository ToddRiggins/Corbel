import type { Node } from "./node.js";

/** The slice of SceneTree that a node is allowed to call. */
export interface TreeHost {
  get_root(): Node;
  queue_delete(node: Node): void;
}
