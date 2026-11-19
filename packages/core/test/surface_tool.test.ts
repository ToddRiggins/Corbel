import { describe, expect, it } from "vitest";
import { Color } from "../src/math/color.js";
import { Plane } from "../src/math/plane.js";
import { Vector2 } from "../src/math/vector2.js";
import { Vector3 } from "../src/math/vector3.js";
import { BoxMesh } from "../src/scene/mesh.js";
import { PrimitiveType, SurfaceTool } from "../src/scene/surface_tool.js";

describe("SurfaceTool", () => {
  it("rebuilds the BoxMesh vertex for vertex", () => {
    const size = new Vector3(2, 4, 6);
    const expected = new BoxMesh(size).surface();

    const tool = new SurfaceTool();
    tool.begin(PrimitiveType.TRIANGLES);
    // Build the same six quads as BoxMesh: [normal, a, b] with a.cross(b) = normal.
    const faces: [Vector3, Vector3, Vector3][] = [
      [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
      [new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0)],
      [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
      [new Vector3(0, -1, 0), new Vector3(0, 0, -1), new Vector3(1, 0, 0)],
      [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
      [new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, -1)],
    ];
    const half = size.mul(0.5);
    const along = (axis: Vector3): Vector3 =>
      new Vector3(Math.abs(axis.x) * half.x, Math.abs(axis.y) * half.y, Math.abs(axis.z) * half.z);
    for (const [n, a, b] of faces) {
      const center = n.mul(1).mul(along(n));
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        tool.set_normal(n);
        tool.set_color(new Color(1, 1, 1, 1));
        tool.add_vertex(center.add(a.mul(i * along(a).dot(a.abs()))).add(b.mul(j * along(b).dot(b.abs()))));
      }
    }
    const built = tool.commit().surface();

    expect([...built.positions]).toEqual([...expected.positions]);
    expect([...built.colors ?? []]).toEqual([...expected.colors ?? []]);
    // An unindexed triangle list references its vertices in order.
    expect([...built.indices]).toEqual([...Array(24).keys()]);
    expect(built.uvs).toBeUndefined();
    expect(built.tangents).toBeUndefined();
  });

  it("commit without begin throws, and an unfinished triangle throws", () => {
    const tool = new SurfaceTool();
    expect(() => tool.commit()).toThrow(/begin/);

    tool.begin(PrimitiveType.TRIANGLES);
    tool.add_vertex(new Vector3(0, 0, 0));
    tool.add_vertex(new Vector3(1, 0, 0));
    expect(() => tool.commit()).toThrow(/threes/);
  });

  it("attributes reset after each add_vertex, like Godot", () => {
    const tool = new SurfaceTool();
    tool.begin(PrimitiveType.TRIANGLES);
    tool.set_color(new Color(1, 0, 0, 1));
    tool.add_vertex(new Vector3(0, 0, 0));
    tool.add_vertex(new Vector3(1, 0, 0)); // No color set: stays without one.
    tool.add_vertex(new Vector3(0, 1, 0));

    const surface = tool.commit().surface();
    // The color array exists once one vertex set a color; unset vertices use white.
    expect([...(surface.colors ?? [])]).toEqual([1, 0, 0, 1, 1, 1, 1, 1, 1]);
  });

  it("generate_normals smooths face normals onto shared vertices", () => {
    const tool = new SurfaceTool();
    tool.begin(PrimitiveType.TRIANGLES);
    // A flat quad in XY: two triangles, one shared edge.
    tool.add_vertex(new Vector3(0, 0, 0));
    tool.add_vertex(new Vector3(2, 0, 0));
    tool.add_vertex(new Vector3(2, 1, 0));
    tool.add_vertex(new Vector3(0, 0, 0));
    tool.add_vertex(new Vector3(2, 1, 0));
    tool.add_vertex(new Vector3(0, 1, 0));
    tool.generate_normals();

    const surface = tool.commit().surface();
    const normals = surface.normals ?? [];
    for (let i = 0; i < 6; i += 1) {
      expect(normals[i * 3]).toBeCloseTo(0);
      expect(normals[i * 3 + 1]).toBeCloseTo(0);
      expect(Math.abs(normals[i * 3 + 2])).toBeCloseTo(1);
    }
  });

  it("index() merges identical vertices into shared indices", () => {
    const tool = new SurfaceTool();
    tool.begin(PrimitiveType.TRIANGLES);
    // Same quad: only four distinct positions exist; index() collapses 6 to 4.
    for (const point of [
      new Vector3(0, 0, 0),
      new Vector3(2, 0, 0),
      new Vector3(2, 1, 0),
      new Vector3(0, 0, 0),
      new Vector3(2, 1, 0),
      new Vector3(0, 1, 0),
    ]) {
      tool.add_vertex(point);
    }
    tool.index();
    const surface = tool.commit().surface();
    expect(surface.positions.length / 3).toBe(4);
    expect([...surface.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("generate_tangents fills a 4-float tangent with the UV direction", () => {
    const tool = new SurfaceTool();
    tool.begin(PrimitiveType.TRIANGLES);
    // A flat quad in XY whose UVs run along +X.
    for (const [point, uv] of [
      [new Vector3(0, 0, 0), new Vector2(0, 0)],
      [new Vector3(2, 0, 0), new Vector2(2, 0)],
      [new Vector3(2, 1, 0), new Vector2(2, 1)],
      [new Vector3(0, 0, 0), new Vector2(0, 0)],
      [new Vector3(2, 1, 0), new Vector2(2, 1)],
      [new Vector3(0, 1, 0), new Vector2(0, 1)],
    ] as const) {
      tool.set_uv(uv);
      tool.add_vertex(point);
    }
    tool.generate_tangents();
    const surface = tool.commit().surface();
    const tangents = surface.tangents ?? [];
    expect(tangents.length).toBe(surface.positions.length / 3 * 4);
    // UVs increase along +X, so every tangent is +X with a positive sign.
    for (let i = 0; i < tangents.length; i += 4) {
      expect(tangents[i]).toBeCloseTo(1);
      expect(Math.abs(tangents[i + 1])).toBeCloseTo(0);
      expect(tangents[i + 3]).toBe(1);
    }
  });

  it("generate_tangents without UVs explains what is missing", () => {
    const tool = new SurfaceTool();
    tool.begin(PrimitiveType.TRIANGLES);
    tool.add_vertex(new Vector3(0, 0, 0));
    tool.add_vertex(new Vector3(1, 0, 0));
    tool.add_vertex(new Vector3(0, 1, 0));
    expect(() => tool.generate_tangents()).toThrow(/UV/);
  });
});
