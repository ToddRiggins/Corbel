import { Basis } from "../math/basis.js";
import { Vector3 } from "../math/vector3.js";
import { create_node } from "./create_node.js";
import type { Node } from "./node.js";
import { Node3D } from "./node3d.js";

interface Draft {
  name: string;
  type: string;
  parent: string | null;
  instance: string | null;
  transform: string | null;
  script: string | null;
}

/**
 * Reads a Godot 4 text scene. Known types become Corbel nodes.
 * Other types stay in the tree with `godot_type` set.
 * `.gd` scripts are stored as a path. They are not executed.
 * `files` maps a `res://` path to scene text so an instanced scene can be expanded.
 */
export function import_tscn(
  text: string,
  files: ReadonlyMap<string, string> = new Map(),
  stack: string[] = [],
): Node {
  const resources = new Map<string, string>();
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let skipping = false;

  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const header = /^\[(\w+)([^\]]*)\]$/.exec(line);
    if (header) {
      const kind = header[1];
      const attrs = read_attrs(header[2]);
      skipping = kind === "sub_resource" || kind === "editable";
      current = null;
      if (kind === "ext_resource" && attrs.id && attrs.path) {
        resources.set(attrs.id, attrs.path);
      }
      if (kind === "node") {
        current = {
          name: attrs.name ?? "Node",
          type: attrs.type ?? "",
          parent: attrs.parent ?? null,
          instance: resource_id(attrs.instance),
          transform: null,
          script: null,
        };
        drafts.push(current);
      }
      continue;
    }
    if (skipping || !current) {
      continue;
    }
    const prop = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!prop) {
      continue;
    }
    if (prop[1] === "transform") {
      current.transform = prop[2];
    }
    if (prop[1] === "script") {
      current.script = resource_id(prop[2]);
    }
  }

  if (drafts.length === 0) {
    throw new Error("This Godot scene has no nodes.");
  }

  const by_path = new Map<string, Node>();
  let root: Node | null = null;
  for (const draft of drafts) {
    const node = make_node(draft, resources, files, stack);
    if (!root) {
      root = node;
      by_path.set(".", root);
      continue;
    }
    const parent = by_path.get(draft.parent ?? ".");
    if (!parent) {
      throw new Error(`Missing parent "${draft.parent}" for "${draft.name}".`);
    }
    parent.add_child(node);
    const parent_path = draft.parent ?? ".";
    const path = parent_path === "." ? node.name : `${parent_path}/${node.name}`;
    by_path.set(path, node);
  }
  assign_owner(root!);
  return root!;
}

function make_node(
  draft: Draft,
  resources: Map<string, string>,
  files: ReadonlyMap<string, string>,
  stack: string[],
): Node {
  const instance_path = draft.instance ? resources.get(draft.instance) ?? null : null;
  let node: Node;
  if (instance_path && files.has(instance_path) && !stack.includes(instance_path)) {
    node = import_tscn(files.get(instance_path)!, files, [...stack, instance_path]);
    node.set_name(draft.name);
  } else {
    let type = draft.type;
    if (!type) {
      type = draft.transform || instance_path ? "Node3D" : "Node";
    }
    node = create_node(type);
    node.set_name(draft.name);
    if (instance_path) {
      node.set_meta("instance", instance_path);
    }
  }
  if (draft.transform && node instanceof Node3D) {
    apply_transform(node, draft.transform);
  }
  if (draft.script) {
    const script_path = resources.get(draft.script);
    if (script_path) {
      node.set_meta("script_path", script_path);
    }
  }
  return node;
}

function apply_transform(node: Node3D, raw: string): void {
  const inner = /Transform3D\(([^)]*)\)/.exec(raw)?.[1] ?? "";
  const nums = inner.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)?.map(Number);
  if (!nums || nums.length < 12) {
    return;
  }
  node.basis = new Basis(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5], nums[6], nums[7], nums[8]);
  node.position = new Vector3(nums[9], nums[10], nums[11]);
}

function read_attrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    attrs[match[1]] = match[2] ?? match[3];
  }
  return attrs;
}

function resource_id(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const match = /ExtResource\(\s*"?([^"\)]+)"?\s*\)/.exec(raw);
  return match ? match[1] : null;
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
