import { describe, expect, it } from "vitest";
import { AABB, Basis, Color, Plane, Quaternion, Transform3D, Vector2, Vector3, Vector3i } from "../src/index.js";

describe("Vector3", () => {
  it("uses Godot axis constants", () => {
    expect(Vector3.FORWARD).toEqual(new Vector3(0, 0, -1));
    expect(Vector3.BACK).toEqual(new Vector3(0, 0, 1));
    expect(Vector3.UP).toEqual(new Vector3(0, 1, 0));
    expect(Vector3.RIGHT).toEqual(new Vector3(1, 0, 0));
  });

  it("matches length, dot, cross, and lerp", () => {
    expect(new Vector3(3, 4, 0).length()).toBe(5);
    expect(Vector3.RIGHT.dot(Vector3.UP)).toBe(0);
    expect(Vector3.RIGHT.cross(Vector3.UP)).toEqual(new Vector3(0, 0, 1));
    expect(Vector3.ZERO.lerp(new Vector3(10, 0, 0), 0.5)).toEqual(new Vector3(5, 0, 0));
  });

  it("turns a right angle into half pi", () => {
    expect(Vector3.RIGHT.angle_to(Vector3.FORWARD)).toBeCloseTo(Math.PI / 2);
  });
});

describe("Vector2", () => {
  it("points up toward -Y, the Godot 2D screen axis", () => {
    expect(Vector2.UP).toEqual(new Vector2(0, -1));
    expect(new Vector2(1, 0).cross(new Vector2(0, 1))).toBe(1);
  });
});

describe("Vector3i", () => {
  it("truncates toward zero and steps a cell", () => {
    expect(new Vector3i(1.9, -1.2, 0)).toEqual(new Vector3i(1, -1, 0));
    expect(new Vector3i(2, 3, 4).add(Vector3i.UP)).toEqual(new Vector3i(2, 4, 4));
  });
});

describe("Basis.looking_at", () => {
  it("looks down -Z when the target is in front of a camera", () => {
    const basis = Basis.looking_at(new Vector3(0, 0, -5));
    expect(basis.z.is_equal_approx(new Vector3(0, 0, 1))).toBe(true);
    expect(basis.xform(Vector3.FORWARD).is_equal_approx(new Vector3(0, 0, -1))).toBe(true);
  });

  it("faces +Z toward the camera when use_model_front is set", () => {
    const camera = new Vector3(0, 1.5, 4);
    const facing = Transform3D.IDENTITY.looking_at(camera, Vector3.UP, true);
    const toward = camera.normalized();
    expect(facing.basis.z.is_equal_approx(toward)).toBe(true);
    expect(facing.basis.xform(Vector3.BACK).is_equal_approx(toward)).toBe(true);
  });

  it("rotates +X to -Z for a quarter turn around Y", () => {
    const turned = Basis.from_euler(new Vector3(0, Math.PI / 2, 0));
    expect(turned.xform(Vector3.RIGHT).is_equal_approx(new Vector3(0, 0, -1))).toBe(true);
  });
});

describe("Quaternion", () => {
  it("round-trips a yaw through euler", () => {
    const euler = new Vector3(0, Math.PI / 2, 0);
    const again = Quaternion.from_euler(euler).get_euler();
    expect(again.is_equal_approx(euler)).toBe(true);
  });
});

describe("Plane and AABB and Color", () => {
  it("hits the ground plane from above", () => {
    const ground = new Plane(Vector3.UP, 0);
    const hit = ground.intersects_ray(new Vector3(1, 2, 3), new Vector3(0, -1, 0));
    expect(hit?.is_equal_approx(new Vector3(1, 0, 3))).toBe(true);
  });

  it("misses a ray that points away from the plane", () => {
    const ground = new Plane(Vector3.UP, 0);
    expect(ground.intersects_ray(new Vector3(0, 2, 0), Vector3.UP)).toBeNull();
  });

  it("contains its center and rejects a point outside", () => {
    const box = new AABB(new Vector3(0, 0, 0), new Vector3(2, 2, 2));
    expect(box.has_point(box.get_center())).toBe(true);
    expect(box.has_point(new Vector3(3, 0, 0))).toBe(false);
  });

  it("reads an html color", () => {
    const orange = Color.html("#ff8000");
    expect(orange.r).toBe(1);
    expect(orange.g).toBeCloseTo(128 / 255);
    expect(orange.b).toBe(0);
    expect(orange.to_html()).toBe("#ff8000");
  });
});
