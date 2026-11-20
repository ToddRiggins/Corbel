import type { CSceneNode } from "./cscene.js";
import { unpack_scene, pack_scene } from "./cscene.js";
import { Node } from "./node.js";

/**
 * Godot 4 PackedScene: saved scene data that `instantiate()` turns into a
 * fresh live tree, the way `scenes.instantiate()` works in GDScript.
 */
export class PackedScene {
  private constructor(private readonly _data: CSceneNode) {}

  /** Packs a live node tree into a PackedScene. */
  static from_node(node: Node): PackedScene {
    return new PackedScene(pack_scene(node));
  }

  /** Wraps already-parsed scene data (the JSON form of a `.cscene`). */
  static from_data(data: CSceneNode): PackedScene {
    return new PackedScene(data);
  }

  /** Builds a fresh instance — a new tree each call, never shared. */
  instantiate(): Node {
    return unpack_scene(this._data);
  }

  /** The scene's root name, Godot's `instantiate` preview. */
  get_name(): string {
    return this._data.name;
  }
}
