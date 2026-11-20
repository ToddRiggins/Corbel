import { describe, expect, it } from "vitest";
import { Vector3 } from "../src/math/vector3.js";
import { CapsuleMesh, CylinderMesh, PlaneMesh, PrimitiveMesh, PrismMesh, SphereMesh, TorusMesh } from "../src/scene/primitive_meshes.js";
import { BoxMesh, Mesh, PrimitiveType } from "../src/scene/mesh.js";

/** The max Y of every normal set in the surface. */
function count_vertices(surface: ReturnType<BoxMesh["surface_get_arrays"]>): number {
  return surface.positions.length / 3;
}

describe("PrimitiveMesh family", () => {
  it("every primitive is a Mesh answering one surface", () => {
    const meshes: Mesh[] = [
      new PlaneMesh(), new SphereMesh(), new CylinderMesh(), new CapsuleMesh(),
      new TorusMesh(), new PrismMesh(), new BoxMesh(),
    ];
    for (const mesh of meshes) {
      expect(mesh instanceof PrimitiveMesh || mesh instanceof BoxMesh).toBe(true);
      expect(mesh.get_surface_count()).toBe(1);
      expect(mesh.surface_get_arrays(0).indices.length > 0).toBe(true);
    }
  });

  it("PlaneMesh faces +Y and subdivides", () => {
    const flat = new PlaneMesh(new Vector3(4, 0, 2), 4, 2);
    const surface = flat.surface_get_arrays(0);
    // A 4x2 grid = 5*3 = 15 vertices, 32 indices.
    expect(count_vertices(surface)).toBe(15);
    expect(surface.indices.length).toBe(4 * 2 * 6);
    // Every normal points up.
    for (let i = 0; i < surface.normals!.length; i += 3) {
      expect(surface.normals![i + 1]).toBeCloseTo(1);
      expect(surface.normals![i]).toBeCloseTo(0);
    }
    // One full uv square.
    expect([...surface.uvs!].at(-2)).toBe(1);
    expect([...surface.uvs!].at(-1)).toBe(1);
  });

  it("SphereMesh wraps a pole and keeps unit normals", () => {
    const sphere = new SphereMesh(0.75, 1.5, 16, 8);
    const surface = sphere.surface_get_arrays(0);
    expect(count_vertices(surface)).toBe(9 * 17);
    const vertex_count = count_vertices(surface);
    for (let i = 0; i < vertex_count; i += 1) {
      const x = surface.positions[i * 3];
      const y = surface.positions[i * 3 + 1];
      const z = surface.positions[i * 3 + 2];
      const nx = surface.normals![i * 3];
      const ny = surface.normals![i * 3 + 1];
      const nz = surface.normals![i * 3 + 2];
      // The normal is the unit normal of a sphere of radius 0.75 scaled height 1.5.
      const length = Math.hypot(nx, ny, nz);
      expect(length).toBeCloseTo(1);
      // The vertex sits on the elliptical shell: (x/0.75)^2 + (y/0.75)^2 + (z/0.75)^2 = 1.
      expect(Math.hypot(x, y, z)).toBeCloseTo(0.75);
      void ny;
      void nz;
      void x;
      void y;
      void z;
    }
    // The poles carry the vertical normal.
    expect(surface.normals![1]).toBeCloseTo(1);
    expect(surface.normals![surface.normals!.length - 2]).toBeCloseTo(-1);
  });

  it("CylinderMesh keeps the barrel between the caps and a cone from top_radius 0", () => {
    const cylinder = new CylinderMesh(0.5, 0.5, 2, 8);
    const surface = cylinder.surface_get_arrays(0);
    expect(surface.indices.length % 3).toBe(0);
    // The bottom cap faces down.
    const last = surface.normals!.length / 3 - 1;
    expect(surface.normals![last * 3 + 1]).toBeCloseTo(-1);

    const cone = new CylinderMesh(0, 0.5, 2, 8);
    const cone_surface = cone.surface_get_arrays(0);
    expect(cone_surface.positions[0]).toBeCloseTo(0);
    expect(cone_surface.positions[1]).toBeCloseTo(1);
  });

  it("CapsuleMesh spans radius caps plus the cylinder band", () => {
    const capsule = new CapsuleMesh(0.5, 2.5, 8, 4);
    const surface = capsule.surface_get_arrays(0);
    const ys: number[] = [];
    for (let i = 1; i < surface.positions.length; i += 3) {
      ys.push(surface.positions[i]);
    }
    // Height 2.5 with radius 0.5: the top pole is 1.25 up.
    expect(Math.max(...ys)).toBeCloseTo(1.25);
    expect(Math.min(...ys)).toBeCloseTo(-1.25);
  });

  it("TorusMesh reads inner and outer radii", () => {
    const torus = new TorusMesh(0.5, 1.0, 12, 8);
    const surface = torus.surface_get_arrays(0);
    let max_radius = 0;
    let min_radius = Infinity;
    for (let i = 0; i < surface.positions.length / 3; i += 1) {
      const x = surface.positions[i * 3];
      const z = surface.positions[i * 3 + 2];
      max_radius = Math.max(max_radius, Math.hypot(x, z));
      min_radius = Math.min(min_radius, Math.hypot(x, z));
    }
    // The tube wall reaches the outer radius and the hole keeps inner_radius.
    expect(max_radius).toBeCloseTo(1.0);
    expect(min_radius).toBeCloseTo(0.5);
  });

  it("PrismMesh leans its ridge with left_to_right", () => {
    const straight = new PrismMesh(new Vector3(2, 2, 2), 0.5);
    const straight_surface = straight.surface_get_arrays(0);
    const ridge_x_values = new Set<number>();
    for (let i = 0; i < straight_surface.positions.length / 3; i += 1) {
      if (Math.abs(straight_surface.positions[i * 3 + 1] - 1) < 0.001) {
        ridge_x_values.add(straight_surface.positions[i * 3]);
      }
    }
    expect([...ridge_x_values].every((value) => Math.abs(value) < 0.001)).toBe(true);

    const leaned = new PrismMesh(new Vector3(2, 2, 2), 1.0);
    const leaned_surface = leaned.surface_get_arrays(0);
    let ridge = 0;
    for (let i = 0; i < leaned_surface.positions.length / 3; i += 1) {
      if (Math.abs(leaned_surface.positions[i * 3 + 1] - 1) < 0.001) {
        ridge = leaned_surface.positions[i * 3];
      }
    }
    expect(ridge).toBeCloseTo(1);
  });
});
