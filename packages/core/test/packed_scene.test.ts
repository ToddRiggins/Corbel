import { describe, expect, it } from "vitest";
import { Dictionary } from "../src/dictionary.js";
import { Node3D } from "../src/scene/node3d.js";
import { Node } from "../src/scene/node.js";
import { PackedScene } from "../src/scene/packed_scene.js";
import { SceneTree } from "../src/scene/scene_tree.js";
import { resource_loader } from "../src/scene/resource_loader.js";
import { create_node } from "../src/scene/create_node.js";

describe("PackedScene", () => {
  const tree = new SceneTree();

  it("packs a live tree and instantiates a fresh node each call", () => {
    const original = new Node3D();
    original.set_name("Level");
    const body = create_node("Node3D");
    body.set_name("Body");
    original.add_child(body);

    const packed = PackedScene.from_node(original);
    expect(packed.get_name()).toBe("Level");

    const first = packed.instantiate();
    const second = packed.instantiate();
    expect(first).not.toBe(second);
    expect(first).toBeInstanceOf(Node3D);
    expect(first.name).toBe("Level");
    expect(first.get_node("Body")).toBeInstanceOf(Node3D);
    expect(second.get_node("Body")).not.toBe(first.get_node("Body"));

    // Instances join a tree and run the lifecycle.
    tree.get_root().add_child(first);
    expect(first.is_inside_tree() === true).toBe(true);
  });

  it("from_data wraps parsed .cscene JSON", () => {
    const packed = PackedScene.from_data({ type: "Node3D", name: "Saved", position: [1, 2, 3] });
    const node = packed.instantiate();
    expect(node.name).toBe("Saved");
    expect((node as Node3D).position.y).toBeCloseTo(2);
  });

  it("change_scene_to_packed instantiates and swaps the current scene", () => {
    const packed = PackedScene.from_data({ type: "Node3D", name: "Next" });
    tree.change_scene_to_packed(packed);
    expect(tree.get_current_scene()?.name).toBe("Next");
    tree.tick(0.1);
    expect(tree.get_root().get_children().map((child) => child.name)).toContain("Next");
  });
});

describe("ResourceLoader and load()", () => {
  const files: Record<string, string> = {
    "res://scenes/level.cscene": JSON.stringify({ type: "Node3D", name: "Level", children: [{ type: "Camera3D", name: "Eye" }] }),
    "res://scripts/enemy.ts": "export default class Enemy extends Node {}",
  };
  const loader = resource_loader();
  loader.set_file_loader(async (path) => {
    if (!(path in files)) {
      throw new Error(`missing file: ${path}`);
    }
    return files[path];
  });

  it("loads a cscene as a PackedScene and instantiates it", async () => {
    const packed = (await loader.load("res://scenes/level.cscene")) as PackedScene;
    expect(packed instanceof PackedScene).toBe(true);
    const node = packed.instantiate();
    expect(node.get_node("Eye")).toBeInstanceOf(Node);
  });

  it("caches by path: load twice returns the same resource", async () => {
    const first = loader.load("res://scenes/level.cscene");
    const again = loader.load("res://scenes/level.cscene");
    expect(await first).toBe(await again);
    expect(loader.has_cached("res://scenes/level.cscene")).toBe(true);
    expect(loader.has_cached("res://not-loaded/yet.cscene")).toBe(false);
  });

  it("script files load through registered handlers and custom ext handlers work", async () => {
    let handled = "";
    loader.set_loader("ts", async (text, path) => {
      handled = path;
      return { script: text, parsed: true } as unknown;
    });
    const enemy = (await loader.load("res://scripts/enemy.ts")) as { parsed?: boolean };
    expect(handled).toBe("res://scripts/enemy.ts");
    expect(enemy.parsed === true).toBe(true);
  });

  it("handlers take the file text through the injected read", async () => {
    let text_seen = "";
    loader.set_file_loader(async (path) => `{"kind":"${path.endsWith(".cmat") ? "mat" : "any"}"}`);
    loader.set_loader("cmat", (text) => {
      text_seen = text;
      return { got: JSON.parse(text) } as unknown;
    });
    const resource = (await loader.load("res://data/item.cmat")) as { got?: { kind?: string } };
    expect(text_seen).toBe('{"kind":"mat"}');
    expect(resource.got?.kind).toBe("mat");
  });

  it("load() is the global route to the shared instance", async () => {
    const { load } = await import("../src/scene/resource_loader.js");
    const dict = new Dictionary<string, number>();
    void dict;
    const packed = (await load("res://scenes/level.cscene")) as PackedScene;
    expect(packed instanceof PackedScene).toBe(true);
  });
});
