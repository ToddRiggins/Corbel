import { describe, expect, it } from "vitest";
import { Dictionary } from "../src/dictionary.js";

describe("Dictionary", () => {
  it("stores and reads string and number keys by value", () => {
    const d = new Dictionary<string | number, number>();
    d.set("one", 1);
    d.set("two", 2);
    d.set(3, 30);
    expect(d.size()).toBe(3);
    expect(d.has("one")).toBe(true);
    expect(d.has("missing")).toBe(false);
    expect(d.get("two")).toBe(2);
    expect(d.get("two", 99)).toBe(2);
    expect(d.get("missing")).toBeNull();
    expect(d.get("missing", 0)).toBe(0);
    expect(d.keys()).toEqual(["one", "two", 3]);
    expect(d.values()).toEqual([1, 2, 30]);
  });

  it("get_or_add, erase, clear, and is_empty", () => {
    const d = new Dictionary<string, number>();
    expect(d.get_or_add("hp", 100)).toBe(100);
    expect(d.get_or_add("hp", 5)).toBe(100);
    expect(d.erase("hp")).toBe(true);
    expect(d.erase("hp")).toBe(false);
    d.set("a", 1);
    d.set("b", 2);
    d.clear();
    expect(d.is_empty()).toBe(true);
    expect(d.size()).toBe(0);
  });

  it("has_all checks every key", () => {
    const d = new Dictionary<string, number>([["a", 1], ["b", 2]]);
    expect(d.has_all(["a", "b"])).toBe(true);
    expect(d.has_all(["a", "b", "c"])).toBe(false);
  });

  it("merge adds without overwrite by default, then with", () => {
    const a = new Dictionary<string, number>([["x", 1], ["y", 2]]);
    const b = new Dictionary<string, number>([["y", 9], ["z", 3]]);
    a.merge(b);
    expect(a.get("y")).toBe(2);
    expect(a.get("z")).toBe(3);
    a.merge(b, true);
    expect(a.get("y")).toBe(9);
  });

  it("duplicate is shallow by default and deep on request", () => {
    const nested = new Dictionary<string, number>();
    nested.set("deep", 7);
    const d = new Dictionary<string, unknown>();
    d.set("list", [1, 2]);
    d.set("dict", nested);

    const shallow = d.duplicate();
    expect(shallow.get("list")).toBe(d.get("list"));

    const deep = d.duplicate(true);
    const deep_list = deep.get("list") as number[];
    expect(deep_list).toEqual([1, 2]);
    expect(deep_list).not.toBe(d.get("list"));
    (deep.get("dict") as Dictionary<string, number>).set("deep", 8);
    expect(nested.get("deep")).toBe(7);
  });

  it("find_key matches values including float epsilon and nested dictionaries", () => {
    const d = new Dictionary<string, number | Dictionary<string, number>>();
    d.set("hp", 1.0000001);
    d.set("nested", new Dictionary<string, number>([["a", 1]]));
    expect(d.find_key(1)).toBe("hp");
    expect(d.find_key(new Dictionary<string, number>([["a", 1]]))).toBe("nested");
    expect(d.find_key(2)).toBeNull();
  });

  it("equals compares key sets and values", () => {
    const a = new Dictionary<string, number>([["x", 1], ["y", 2]]);
    const b = new Dictionary<string, number>([["y", 2], ["x", 1]]);
    expect(a.equals(b)).toBe(true);
    b.set("x", 3);
    expect(a.equals(b)).toBe(false);
  });
});
