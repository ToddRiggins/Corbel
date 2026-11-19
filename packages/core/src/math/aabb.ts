import { Vector3 } from "./vector3.js";

/** Godot 4 AABB. `position` is the minimum corner. `size` is the extent. */
export class AABB {
  position: Vector3;
  size: Vector3;

  constructor(position: Vector3 = Vector3.ZERO, size: Vector3 = Vector3.ONE) {
    this.position = position;
    this.size = size;
  }

  get_center(): Vector3 {
    return this.position.add(this.size.mul(0.5));
  }

  get_end(): Vector3 {
    return this.position.add(this.size);
  }

  has_point(point: Vector3): boolean {
    const end = this.get_end();
    return (
      point.x >= this.position.x &&
      point.y >= this.position.y &&
      point.z >= this.position.z &&
      point.x <= end.x &&
      point.y <= end.y &&
      point.z <= end.z
    );
  }

  intersects(other: AABB): boolean {
    const a1 = this.get_end();
    const b1 = other.get_end();
    return (
      this.position.x < b1.x &&
      a1.x > other.position.x &&
      this.position.y < b1.y &&
      a1.y > other.position.y &&
      this.position.z < b1.z &&
      a1.z > other.position.z
    );
  }

  /** A copy grown to include `point`. */
  expand(point: Vector3): AABB {
    const end = this.get_end();
    const min = new Vector3(
      Math.min(this.position.x, point.x),
      Math.min(this.position.y, point.y),
      Math.min(this.position.z, point.z),
    );
    const max = new Vector3(Math.max(end.x, point.x), Math.max(end.y, point.y), Math.max(end.z, point.z));
    return new AABB(min, max.sub(min));
  }

  merge(other: AABB): AABB {
    return this.expand(other.position).expand(other.get_end());
  }
}
