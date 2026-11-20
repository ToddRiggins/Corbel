import { Camera3D } from "./camera3d.js";
import { DirectionalLight3D } from "./directional_light3d.js";
import { OmniLight3D, SpotLight3D } from "./omni_light3d.js";
import { WorldEnvironment } from "./environment.js";
import { MeshInstance3D } from "./mesh_instance3d.js";
import { Timer } from "./timer.js";
import { Node } from "./node.js";
import { Node3D } from "./node3d.js";
import { get_registered_node_class } from "../node_registry.js";

const BUILTIN_TYPES: Record<string, new () => Node> = {
  Node,
  Node3D,
  Camera3D,
  MeshInstance3D,
  Timer,
  DirectionalLight3D,
  OmniLight3D,
  SpotLight3D,
  WorldEnvironment,
};

/** Builds a node by Godot class name: built-ins first, then project `class_name` classes. */
export function create_node(type: string): Node {
  const Known = BUILTIN_TYPES[type] ?? get_registered_node_class(type);
  if (Known) {
    return new Known();
  }
  const node = type.endsWith("3D") ? new Node3D() : new Node();
  node.set_meta("godot_type", type);
  return node;
}

/** Label for the scene dock. A Godot type we do not implement yet wins over Node3D. */
export function node_label(node: Node): string {
  const godot_type = node.get_meta("godot_type");
  return typeof godot_type === "string" ? godot_type : node.get_class();
}
