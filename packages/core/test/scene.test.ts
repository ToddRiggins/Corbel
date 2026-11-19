import { describe, expect, it } from "vitest";
import {
  Camera3D,
  MeshInstance3D,
  Node,
  Node3D,
  SceneTree,
  Signal,
  Vector3,
  import_tscn,
  pack_scene,
  unpack_scene,
} from "../src/index.js";

class Probe extends Node {
  readonly log: string[];

  constructor(log: string[]) {
    super();
    this.log = log;
  }

  override _enter_tree(): void {
    this.log.push(`enter ${this.name}`);
  }

  override _ready(): void {
    this.log.push(`ready ${this.name}`);
  }

  override _exit_tree(): void {
    this.log.push(`exit ${this.name}`);
  }

  override _process(_delta: number): void {
    this.log.push(`process ${this.name}`);
  }
}

const LEVEL = `[gd_scene load_steps=3 format=3]

[ext_resource type="Script" path="res://player.gd" id="1_player"]
[ext_resource type="PackedScene" path="res://mob.tscn" id="2_mob"]

[node name="Main" type="Node3D"]

[node name="Camera" type="Camera3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.5, 4)

[node name="Player" type="Node3D" parent="."]
script = ExtResource("1_player")

[node name="Body" type="MeshInstance3D" parent="Player"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 0)

[node name="Label" type="Label" parent="."]

[node name="Mob" parent="." instance=ExtResource("2_mob")]
`;

const MOB = `[gd_scene load_steps=1 format=3]

[node name="Mob" type="Node3D"]

[node name="Sprite" type="Sprite3D" parent="."]
`;

describe("scene tree", () => {
  it("readies the child before the parent, and enters the parent first", () => {
    const log: string[] = [];
    const tree = new SceneTree();
    const parent = new Probe(log);
    parent.set_name("P");
    const child = new Probe(log);
    child.set_name("C");
    parent.add_child(child);
    tree.get_root().add_child(parent);

    expect(log).toEqual(["enter P", "enter C", "ready C", "ready P"]);
    expect(child.is_inside_tree()).toBe(true);
    expect(parent.get_node("C")).toBe(child);
    expect(tree.get_root().get_node("/root/P/C")).toBe(child);
  });

  it("calls _ready once, and _enter_tree again after a reparent", () => {
    const log: string[] = [];
    const tree = new SceneTree();
    const parent = new Node();
    parent.set_name("P");
    const child = new Probe(log);
    child.set_name("C");
    parent.add_child(child);
    tree.get_root().add_child(parent);
    parent.remove_child(child);
    parent.add_child(child);

    expect(log.filter((line) => line.startsWith("ready"))).toEqual(["ready C"]);
    expect(log.filter((line) => line.startsWith("enter"))).toEqual(["enter C", "enter C"]);
  });

  it("exits children before the parent", () => {
    const log: string[] = [];
    const tree = new SceneTree();
    const parent = new Probe(log);
    parent.set_name("P");
    const child = new Probe(log);
    child.set_name("C");
    parent.add_child(child);
    tree.get_root().add_child(parent);
    log.length = 0;
    tree.get_root().remove_child(parent);
    expect(log).toEqual(["exit C", "exit P"]);
    expect(parent.is_inside_tree()).toBe(false);
  });

  it("processes the parent before the child, then frees a queued node", () => {
    const log: string[] = [];
    const tree = new SceneTree();
    const parent = new Probe(log);
    parent.set_name("P");
    const child = new Probe(log);
    child.set_name("C");
    parent.add_child(child);
    tree.get_root().add_child(parent);
    child.queue_free();
    expect(child.is_queued_for_deletion()).toBe(true);
    log.length = 0;
    tree._process(0.016);
    expect(log).toEqual(["process P", "process C", "exit C"]);
    expect(child.get_parent()).toBeNull();
    expect(parent.get_child_count()).toBe(0);
  });

  it("renames a duplicate sibling and rejects a bad name", () => {
    const parent = new Node();
    const first = new Node();
    first.set_name("Item");
    const second = new Node();
    second.set_name("Item");
    parent.add_child(first);
    parent.add_child(second);
    expect(second.name).toBe("Item2");
    expect(() => first.set_name("Item2")).toThrow(/already named/);
  });

  it("emits a signal in connect order and finds a group", () => {
    const tree = new SceneTree();
    const signal = new Signal<[number]>();
    const got: number[] = [];
    const hear = (value: number): void => {
      got.push(value);
    };
    signal.connect(hear);
    signal.emit(3);
    signal.disconnect(hear);
    signal.emit(4);
    expect(got).toEqual([3]);

    const node = new Node();
    node.set_name("Coin");
    node.add_to_group("pickups");
    tree.get_root().add_child(node);
    expect(node.is_in_group("pickups")).toBe(true);
    expect(tree.get_nodes_in_group("pickups")).toEqual([node]);
  });
});

describe("scenes", () => {
  it("imports a Godot scene, including a script path and an instanced scene", () => {
    const files = new Map([["res://mob.tscn", MOB]]);
    const main = import_tscn(LEVEL, files);
    expect(main).toBeInstanceOf(Node3D);
    expect(main.name).toBe("Main");
    expect(main.get_child(0)).toBeInstanceOf(Camera3D);
    expect((main.get_child(0) as Node3D).position).toEqual(new Vector3(0, 1.5, 4));
    const player = main.get_node("Player");
    expect(player.get_meta("script_path")).toBe("res://player.gd");
    expect(player.get_node("Body")).toBeInstanceOf(MeshInstance3D);
    expect((player.get_node("Body") as Node3D).position.y).toBeCloseTo(0.5);
    expect(main.get_node("Label").get_meta("godot_type")).toBe("Label");
    const mob = main.get_node("Mob");
    expect(mob.get_node("Sprite").get_meta("godot_type")).toBe("Sprite3D");
  });

  it("round-trips a scene through the Corbel file", () => {
    const camera = new Camera3D();
    camera.set_name("Camera");
    camera.position = new Vector3(0, 1.5, 4);
    camera.rotation_degrees = new Vector3(0, 180, 0);
    const root = new Node3D();
    root.set_name("Main");
    root.add_child(camera);
    const again = unpack_scene(pack_scene(root));
    const copy = again.get_node("Camera") as Camera3D;
    expect(copy.position).toEqual(new Vector3(0, 1.5, 4));
    expect(copy.rotation_degrees.y).toBeCloseTo(180);
    expect(copy.owner).toBe(again);
  });
});

describe("script errors and pause", () => {
  class Bad extends Node {
    override _process(_delta: number): void {
      throw new Error("process boom");
    }
  }

  class Good extends Node {
    hits = 0;
    override _process(_delta: number): void {
      this.hits += 1;
    }
  }

  it("reports a failing _process and keeps the frame running", () => {
    const tree = new SceneTree();
    const seen: string[] = [];
    tree.on_node_error = (node, error, where) => {
      seen.push(`${node.name}:${where}:${(error as Error).message}`);
    };
    const good = new Good();
    tree.get_root().add_child(new Bad());
    tree.get_root().add_child(good);
    good.name = "Good";

    tree.tick(0.1);
    tree.tick(0.1);

    expect(seen).toEqual(["Bad:process:process boom", "Bad:process:process boom"]);
    expect(good.hits).toBe(2);
  });

  it("reports a failing _ready once and never calls it again", () => {
    const tree = new SceneTree();
    const seen: string[] = [];
    tree.on_node_error = (node, error, where) => {
      seen.push(`${node.name}:${where}:${(error as Error).message}`);
    };
    class ReadyBroke extends Node {
      override _ready(): void {
        throw new Error("ready boom");
      }
    }
    tree.get_root().add_child(new ReadyBroke());

    expect(seen).toEqual(["ReadyBroke:ready:ready boom"]);
  });

  it("paused skips _process but the frame still runs", () => {
    const tree = new SceneTree();
    const good = new Good();
    tree.get_root().add_child(good);

    tree.paused = true;
    tree.tick(0.1);
    expect(good.hits).toBe(0);

    tree.paused = false;
    tree.tick(0.1);
    expect(good.hits).toBe(1);
  });
});
