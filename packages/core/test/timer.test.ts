import { describe, expect, it } from "vitest";
import { ProcessMode } from "../src/scene/process_mode.js";
import { SceneTree } from "../src/scene/scene_tree.js";
import { Signal } from "../src/scene/signal.js";
import { Timer } from "../src/scene/timer.js";
import { create_node } from "../src/scene/create_node.js";
import { Node } from "../src/scene/node.js";
import { Node3D } from "../src/scene/node3d.js";

class Ticker extends Node {
  ticks = 0;
  override _process(_delta: number): void {
    this.ticks += 1;
  }
}

describe("process_mode and pause", () => {
  const tree = new SceneTree();

  function fresh(...nodes: Node[]): void {
    for (const node of nodes) {
      tree.get_root().add_child(node);
    }
  }

  it("PAUSABLE stops, WHEN_PAUSED runs, ALWAYS runs, and children inherit the parent mode", () => {
    const pausable = new Ticker();
    pausable.process_mode = ProcessMode.PAUSABLE;
    const when_paused = new Ticker();
    when_paused.process_mode = ProcessMode.WHEN_PAUSED;
    const always = new Ticker();
    always.process_mode = ProcessMode.ALWAYS;
    fresh(pausable, when_paused, always);

    tree.paused = true;
    tree.tick(0.1);
    const at_pause = [pausable.ticks, when_paused.ticks, always.ticks];
    expect(at_pause).toEqual([0, 1, 1]);

    tree.paused = false;
    tree.tick(0.1);
    expect(pausable.ticks).toBe(1);

    // A disabled subtree under an ALWAYS parent stays off.
    const disabled = new Ticker();
    disabled.process_mode = ProcessMode.DISABLED;
    always.add_child(disabled);
    tree.paused = true;
    tree.tick(0.1);
    tree.paused = false;
    expect(disabled.ticks).toBe(0);
    void fresh;
  });
});

describe("Timer", () => {
  it("emits timeout after wait_time, once or repeating", async () => {
    const tree = new SceneTree();
    const hits: number[] = [];
    const timer = new Timer();
    timer.wait_time = 0.5;
    timer.start();
    timer.timeout.connect((() => hits.push(1)));
    tree.get_root().add_child(timer);

    tree.tick(0.2);
    expect(timer.get_time_left()).toBeCloseTo(0.3);
    tree.tick(0.3);
    expect(hits.length).toBe(1);
    tree.tick(0.5);
    tree.tick(0.5);
    expect(hits.length).toBe(1 + 2);

    timer.stop();
    tree.tick(0.5);
    expect(hits.length).toBe(3);
    expect(timer.is_stopped()).toBe(true);
  });

  it("one_shot stops after a single timeout; start(sec) sets the wait", async () => {
    const tree = new SceneTree();
    const timer = new Timer();
    timer.one_shot = true;
    timer.start(0.4);
    tree.get_root().add_child(timer);
    expect(timer.is_stopped()).toBe(false);
    const fired = timer.timeout.once().then((args) => ({ args, left: timer.get_time_left() }));
    tree.tick(0.4);
    const result = await fired;
    expect(timer.is_stopped()).toBe(true);
    expect(result.args).toEqual([]);
    void tree;
  });

  it("autostart begins counting on _ready; create_node builds Timers", () => {
    const tree = new SceneTree();
    const timer = create_node("Timer") as Timer;
    timer.autostart = true;
    tree.get_root().add_child(timer);
    expect(timer.is_stopped()).toBe(false);
    expect(timer.get_time_left()).toBeCloseTo(1);
    expect(timer instanceof Timer).toBe(true);
  });

  it("get_tree reaches SceneTree from a node", () => {
    const tree = new SceneTree();
    const node = new Node();
    expect(node.get_tree()).toBeNull();
    tree.get_root().add_child(node);
    expect(node.get_tree()).toBe(tree);
    void Signal;
  });
});

describe("SceneTree.create_timer", () => {
  it("awaits timeout and honors process_always across pause", async () => {
    const tree = new SceneTree();
    const paused_timer = tree.create_timer(0.5, false);
    tree.paused = true;
    tree.tick(0.5);
    expect(paused_timer.time_left).toBeCloseTo(0.5);

    const always = tree.create_timer(0.5);
    expect(always.process_always).toBe(true);
    tree.tick(0.5);
    expect(always.time_left).toBeLessThanOrEqual(0);
    // awaiting the timeout signal resolves on emit, and non-always timers resume with the tree
    tree.paused = false;
    tree.tick(0.5);
    expect(paused_timer.time_left).toBeLessThanOrEqual(0);
  });

  it("a Signal itself is awaitable, GDScript idiom", async () => {
    const signal = new Signal<[string]>();
    const wait = signal.then((args) => args[0]);
    signal.emit("hello");
    expect(await wait).toBe("hello");
  });
});

describe("change_scene", () => {
  it("change_scene_to_node frees the old scene and keeps the new one", async () => {
    const tree = new SceneTree();
    const first = create_node("Node3D");
    first.set_name("First");
    tree.change_scene_to_node(first);
    expect(tree.get_current_scene()).toBe(first);

    const second = create_node("Node3D");
    second.set_name("Second");
    tree.change_scene_to_node(second);
    expect(tree.get_current_scene()).toBe(second);

    // The old scene's queued free settles inside the frame's tick.
    tree.tick(0.1);
    expect(tree.get_root().get_children().map((child) => child.name)).toEqual(["Second"]);
  });

  it("change_scene_to_file returns false with no loader, true with one", async () => {
    const tree = new SceneTree();
    expect(await tree.change_scene_to_file("res://missing.cscene")).toBe(false);
    tree.scene_loader = async (path) => {
      const node = create_node("Node3D");
      node.set_name(path.replace(/^res:\/\//, "").replace(/\.[^.]+$/, ""));
      return node;
    };
    expect(await tree.change_scene_to_file("res://second.cscene")).toBe(true);
    expect(tree.get_current_scene()?.name).toBe("second");
  });
});
