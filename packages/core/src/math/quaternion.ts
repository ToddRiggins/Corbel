import { is_equal_approx, is_zero_approx } from "./approx.js";
import { Basis } from "./basis.js";
import { Vector3 } from "./vector3.js";

/** Godot 4 Quaternion, stored as x, y, z, w. Identity is (0, 0, 0, 1). */
export class Quaternion {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}

  static readonly IDENTITY = new Quaternion(0, 0, 0, 1);

  static from_euler(euler: Vector3): Quaternion {
    return Basis.from_euler(euler).get_quaternion();
  }

  length_squared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  length(): number {
    return Math.sqrt(this.length_squared());
  }

  normalized(): Quaternion {
    const len = this.length();
    if (len === 0) {
      return new Quaternion(0, 0, 0, 0);
    }
    return new Quaternion(this.x / len, this.y / len, this.z / len, this.w / len);
  }

  dot(with_: Quaternion): number {
    return this.x * with_.x + this.y * with_.y + this.z * with_.z + this.w * with_.w;
  }

  inverse(): Quaternion {
    const s = this.length_squared();
    return new Quaternion(-this.x / s, -this.y / s, -this.z / s, this.w / s);
  }

  /** Hamilton product. Godot writes this as `a * b`. */
  mul(q: Quaternion): Quaternion {
    return new Quaternion(
      this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y,
      this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x,
      this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w,
      this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z,
    );
  }

  xform(v: Vector3): Vector3 {
    const qv = new Quaternion(v.x, v.y, v.z, 0);
    const r = this.mul(qv).mul(this.inverse());
    return new Vector3(r.x, r.y, r.z);
  }

  slerp(to: Quaternion, weight: number): Quaternion {
    let cosom = this.dot(to);
    let tx = to.x;
    let ty = to.y;
    let tz = to.z;
    let tw = to.w;
    if (cosom < 0) {
      cosom = -cosom;
      tx = -tx;
      ty = -ty;
      tz = -tz;
      tw = -tw;
    }
    let scale0: number;
    let scale1: number;
    if (1 - cosom > 0.00001) {
      const omega = Math.acos(cosom);
      const sinom = Math.sin(omega);
      scale0 = Math.sin((1 - weight) * omega) / sinom;
      scale1 = Math.sin(weight * omega) / sinom;
    } else {
      scale0 = 1 - weight;
      scale1 = weight;
    }
    return new Quaternion(
      scale0 * this.x + scale1 * tx,
      scale0 * this.y + scale1 * ty,
      scale0 * this.z + scale1 * tz,
      scale0 * this.w + scale1 * tw,
    );
  }

  /** Euler angles in Godot's default YXZ order, in radians. */
  get_euler(): Vector3 {
    return new Basis(this).get_euler();
  }

  is_equal_approx(q: Quaternion): boolean {
    return (
      is_equal_approx(this.x, q.x) &&
      is_equal_approx(this.y, q.y) &&
      is_equal_approx(this.z, q.z) &&
      is_equal_approx(this.w, q.w)
    );
  }

  is_zero_approx(): boolean {
    return (
      is_zero_approx(this.x) &&
      is_zero_approx(this.y) &&
      is_zero_approx(this.z) &&
      is_zero_approx(this.w)
    );
  }
}
