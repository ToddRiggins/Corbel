import type { Node } from "./node.js";

/** The slice of SceneTree that a node is allowed to call. */
export interface TreeHost {
  get_root(): Node;
  queue_delete(node: Node): void;
  /** Reports a script error to the host; optional so tests and hosts can skip it. */
  _report_node_error?(node: Node, error: unknown, where: "process" | "ready"): void;
}
