import { Vector3 } from "../math/vector3.js";
import { create_node } from "./create_node.js";
import { Node } from "./node.js";
import { Node3D } from "./node3d.js";

export interface CSceneNode {
  format?: 1;
  type: string;
  name: string;
  visible?: boolean;
  position?: [number, number, number];
  rotation_degrees?: [number, number, number];
  script?: string;
  godot_type?: string;
  instance?: string;
  children?: CSceneNode[];
}

/** Writes a node and its children to the Corbel scene format. */
export function pack_scene(node: Node): CSceneNode {
  const godot_type = node.get_meta("godot_type");
  const script = node.get_meta("script_path");
  const instance = node.get_meta("instance");
  const data: CSceneNode = {
    type: node.get_class(),
    name: node.name,
  };
  if (typeof godot_type === "string") {
    data.godot_type = godot_type;
    data.type = godot_type;
  }
  if (typeof script === "string" && script) {
    data.script = script;
  }
  if (typeof instance === "string" && instance) {
    data.instance = instance;
  }
  if (node instanceof Node3D) {
    data.position = [node.position.x, node.position.y, node.position.z];
    const rotation = node.rotation_degrees;
    data.rotation_degrees = [rotation.x, rotation.y, rotation.z];
    if (!node.visible) {
      data.visible = false;
    }
  }
  const children = node.get_children();
  if (children.length > 0) {
    data.children = children.map((child) => pack_scene(child));
  }
  return data;
}

/** Builds a node tree from a Corbel scene. The caller adds it to a SceneTree. */
export function unpack_scene(data: CSceneNode): Node {
  const node = create_node(data.type);
  node.set_name(data.name);
  if (data.godot_type) {
    node.set_meta("godot_type", data.godot_type);
  }
  if (data.script) {
    node.set_meta("script_path", data.script);
  }
  if (data.instance) {
    node.set_meta("instance", data.instance);
  }
  if (node instanceof Node3D) {
    if (data.position) {
      node.position = new Vector3(data.position[0], data.position[1], data.position[2]);
    }
    if (data.rotation_degrees) {
      node.rotation_degrees = new Vector3(
        data.rotation_degrees[0],
        data.rotation_degrees[1],
        data.rotation_degrees[2],
      );
    }
    if (data.visible === false) {
      node.visible = false;
    }
  }
  for (const child of data.children ?? []) {
    node.add_child(unpack_scene(child));
  }
  assign_owner(node);
  return node;
}

function assign_owner(root: Node): void {
  const walk = (node: Node): void => {
    for (const child of node.get_children()) {
      child.owner = root;
      walk(child);
    }
  };
  walk(root);
}
