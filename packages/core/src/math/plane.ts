import { CMP_EPSILON, is_equal_approx, is_zero_approx } from "./approx.js";
import { Vector3 } from "./vector3.js";

/**
 * Godot 4 Plane. The equation is `normal · point = d`.
 * `distance_to` is `normal.dot(point) - d`.
 */
export class Plane {
  normal: Vector3;
  d: number;

  constructor(normal: Vector3 = Vector3.UP, d = 0) {
    this.normal = normal;
    this.d = d;
  }

  static from_point_normal(point: Vector3, normal: Vector3): Plane {
    const n = normal.normalized();
    return new Plane(n, n.dot(point));
  }

  distance_to(point: Vector3): number {
    return this.normal.dot(point) - this.d;
  }

  project(point: Vector3): Vector3 {
    return point.sub(this.normal.mul(this.distance_to(point)));
  }

  /**
   * Ray against this plane. `dir` does not need to be normalized.
   * Returns null when the ray is parallel or points away from the plane.
   */
  intersects_ray(from: Vector3, dir: Vector3): Vector3 | null {
    const den = this.normal.dot(dir);
    if (is_zero_approx(den)) {
      return null;
    }
    const dist = (this.normal.dot(from) - this.d) / den;
    if (dist > CMP_EPSILON) {
      return null;
    }
    return from.add(dir.mul(-dist));
  }

  is_equal_approx(p: Plane): boolean {
    return this.normal.is_equal_approx(p.normal) && is_equal_approx(this.d, p.d);
  }
}
