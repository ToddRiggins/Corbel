import type { Node } from "./scene/node.js";

type NodeCtor = new () => Node;

/**
 * Godot's `class_name` registry: project classes register here and
 * `create_node("Player")` builds them from scenes, like Godot's editor does
 * for custom node types.
 *
 * The registry state pins on `globalThis` because the dev server can serve
 * `@corbel/core` to several page realms (editor, game window) as separate
 * module instances; the data must stay shared, like Godot's global registry.
 */
interface RegistryState {
  classes: Map<string, NodeCtor>;
}

const REGISTRY_KEY = "__CORBEL_NODE_REGISTRY__";

function state(): RegistryState {
  const holder = globalThis as { [REGISTRY_KEY]?: RegistryState };
  if (!holder[REGISTRY_KEY]) {
    holder[REGISTRY_KEY] = { classes: new Map<string, NodeCtor>() };
  }
  return holder[REGISTRY_KEY];
}

/** Registers a project class under its Godot `class_name`. Re-registering replaces. */
export function register_node_class(name: string, ctor: NodeCtor): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Node class name "${name}" is not a valid identifier.`);
  }
  state().classes.set(name, ctor);
}

export function get_registered_node_class(name: string): NodeCtor | undefined {
  return state().classes.get(name);
}

export function has_registered_node_class(name: string): boolean {
  return state().classes.has(name);
}

export function registered_node_class_names(): string[] {
  return [...state().classes.keys()];
}
