import type { TreeHost } from "./tree_host.js";
import type { InputEvent } from "../input/events.js";
import { ProcessMode } from "./process_mode.js";
import type { SceneTree } from "./scene_tree.js";

const NAME_CHARS = /[./:@%]/;

function match_name(name: string, pattern: string): boolean {
  const body = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}$`).test(name);
}

/**
 * Godot 4 Node. The tree calls `_enter_tree`, then `_ready` after children,
 * then `_process` each frame. `_ready` runs once.
 */
export class Node {
  name: string;
  owner: Node | null = null;

  private _parent: Node | null = null;
  private _children: Node[] = [];
  private _groups = new Set<string>();
  private _meta = new Map<string, unknown>();
  private _tree: TreeHost | null = null;
  private _ready_called = false;
  private _queued = false;

  constructor() {
    this.name = new.target.name;
  }

  get_class(): string {
    return this.constructor.name;
  }

  get_parent(): Node | null {
    return this._parent;
  }

  get_child_count(): number {
    return this._children.length;
  }

  get_child(index: number): Node {
    const child = this._children[index];
    if (!child) {
      throw new Error(`Child index ${index} is out of range.`);
    }
    return child;
  }

  get_children(): Node[] {
    return [...this._children];
  }

  set_name(next: string): void {
    const name = checked_name(next);
    const parent = this._parent;
    if (parent && parent._children.some((child) => child !== this && child.name === name)) {
      throw new Error(`A sibling is already named ${name}.`);
    }
    this.name = name;
  }

  add_child(node: Node): void {
    if (node === this) {
      throw new Error("A node cannot be added to itself.");
    }
    if (node._parent) {
      throw new Error(`${node.name} already has a parent. Remove it first.`);
    }
    let walk: Node | null = this;
    while (walk) {
      if (walk === node) {
        throw new Error("A node cannot be parented to its descendant.");
      }
      walk = walk._parent;
    }
    node.name = unique_child_name(this, checked_name(node.name));
    node._parent = this;
    this._children.push(node);
    if (this._tree) {
      node._entered(this._tree);
      if (this._ready_called) {
        node._ready_down();
      }
    }
  }

  remove_child(node: Node): void {
    const index = this._children.indexOf(node);
    if (index < 0) {
      throw new Error(`${node.name} is not a child of ${this.name}.`);
    }
    if (node._tree) {
      node._exited();
    }
    node._parent = null;
    this._children.splice(index, 1);
  }

  reparent(new_parent: Node): void {
    const old_parent = this._parent;
    if (!old_parent) {
      throw new Error(`${this.name} has no parent.`);
    }
    old_parent.remove_child(this);
    new_parent.add_child(this);
  }

  get_node(path: string): Node {
    const found = this.get_node_or_null(path);
    if (!found) {
      throw new Error(`Node not found: ${path}`);
    }
    return found;
  }

  get_node_or_null(path: string): Node | null {
    if (path === "" || path === ".") {
      return this;
    }
    let current: Node | null = this;
    let rest = path;
    if (rest.startsWith("/root")) {
      current = this._tree?.get_root() ?? null;
      rest = rest.slice("/root".length).replace(/^\//, "");
      if (rest === "") {
        return current;
      }
    }
    for (const part of rest.split("/")) {
      if (!current || part === "") {
        return null;
      }
      if (part === ".") {
        continue;
      }
      if (part === "..") {
        current = current._parent;
        continue;
      }
      current = current._children.find((child) => child.name === part) ?? null;
    }
    return current;
  }

  find_child(pattern: string, recursive = true, owned = true): Node | null {
    for (const child of this._children) {
      const same_owner = child.owner === this.owner || child.owner === this;
      if ((!owned || same_owner) && match_name(child.name, pattern)) {
        return child;
      }
      if (recursive) {
        const found = child.find_child(pattern, true, owned);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  add_to_group(group: string): void {
    this._groups.add(group);
  }

  remove_from_group(group: string): void {
    this._groups.delete(group);
  }

  is_in_group(group: string): boolean {
    return this._groups.has(group);
  }

  get_groups(): string[] {
    return [...this._groups];
  }

  set_meta(key: string, value: unknown): void {
    this._meta.set(key, value);
  }

  get_meta(key: string): unknown {
    return this._meta.get(key);
  }

  has_meta(key: string): boolean {
    return this._meta.has(key);
  }

  is_inside_tree(): boolean {
    return this._tree !== null;
  }

  is_queued_for_deletion(): boolean {
    return this._queued;
  }

  queue_free(): void {
    if (this._queued) {
      return;
    }
    this._queued = true;
    this._tree?.queue_delete(this);
  }

  /** @internal SceneTree calls this for the hidden root. */
  _become_root(tree: TreeHost): void {
    this._tree = tree;
    this._enter_tree();
    this._ready_called = true;
    try {
      this._ready();
    } catch (error) {
      tree._report_node_error?.(this, error, "ready");
    }
  }

  /** @internal */
  _process_branch(delta: number, parent_paused: boolean, tree_paused: boolean): void {
    const paused = this.paused_for(parent_paused, tree_paused);
    if (!paused) {
      try {
        this._process(delta);
      } catch (error) {
        this._tree?._report_node_error?.(this, error, "process");
      }
    }
    for (const child of [...this._children]) {
      if (child._tree) {
        child._process_branch(delta, paused, tree_paused);
      }
    }
  }

  /** Godot's ProcessMode resolution against the tree's pause state. */
  private paused_for(parent_paused: boolean, tree_paused: boolean): boolean {
    switch (this.process_mode) {
      case ProcessMode.PAUSABLE:
        return tree_paused;
      case ProcessMode.WHEN_PAUSED:
        return !tree_paused;
      case ProcessMode.ALWAYS:
        return false;
      case ProcessMode.DISABLED:
        return true;
      default:
        return parent_paused;
    }
  }

  /** @internal Cleared after the node leaves the tree. */
  _clear_queue(): void {
    this._queued = false;
  }

  _enter_tree(): void {}

  _ready(): void {}

  _process(_delta: number): void {}

  /**
   * Godot 4 `Node._input`. Only called when a subclass overrides it; the
   * caller of `SceneTree.push_input` feeds the event to every live node.
   */
  _input(_event: InputEvent): void {}

  _exit_tree(): void {}

  /**
   * Godot 4 `process_mode`: how this node behaves when the tree is paused.
   * `INHERIT` follows the parent, like Godot's default.
   */
  process_mode: ProcessMode = ProcessMode.INHERIT;

  /** The SceneTree this node lives in, or null outside the tree — Godot's `get_tree`. */
  get_tree(): SceneTree | null {
    // Only SceneTree ever acts as the host; a cast keeps node.ts out of the
    // module cycle (scene_tree's imports reach Node's declaration).
    return this._tree as SceneTree | null;
  }

  private _entered(tree: TreeHost): void {
    this._tree = tree;
    this._enter_tree();
    for (const child of [...this._children]) {
      child._entered(tree);
    }
  }

  private _ready_down(): void {
    for (const child of [...this._children]) {
      if (!child._ready_called) {
        child._ready_down();
      }
    }
    if (!this._ready_called) {
      this._ready_called = true;
      try {
        this._ready();
      } catch (error) {
        this._tree?._report_node_error?.(this, error, "ready");
      }
    }
  }

  private _exited(): void {
    for (const child of [...this._children]) {
      child._exited();
    }
    this._exit_tree();
    this._tree = null;
  }
}

function checked_name(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("A node needs a name.");
  }
  if (NAME_CHARS.test(trimmed)) {
    throw new Error("A node name cannot contain . / : @ or %.");
  }
  return trimmed;
}

function unique_child_name(parent: Node, name: string): string {
  const taken = new Set(parent.get_children().map((child) => child.name));
  if (!taken.has(name)) {
    return name;
  }
  let index = 2;
  while (taken.has(`${name}${index}`)) {
    index += 1;
  }
  return `${name}${index}`;
}
