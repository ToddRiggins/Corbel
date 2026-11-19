import { Quaternion } from "./quaternion.js";
import { Vector3 } from "./vector3.js";

/**
 * Godot 4 Basis. Rows are stored in memory. `.x`, `.y`, and `.z` are the columns,
 * which are the local axes of the transform.
 */
export class Basis {
  readonly rows: [Vector3, Vector3, Vector3];

  constructor(a?: Quaternion | number, b = 0, c = 0, d = 0, e = 1, f = 0, g = 0, h = 0, i = 1) {
    if (a instanceof Quaternion) {
      this.rows = Basis._rows_from_quaternion(a);
      return;
    }
    const xx = a ?? 1;
    this.rows = [
      new Vector3(xx, b, c),
      new Vector3(d, e, f),
      new Vector3(g, h, i),
    ];
  }

  static readonly IDENTITY = new Basis();

  /** Columns are the local X, Y, and Z axes. */
  static from_columns(x: Vector3, y: Vector3, z: Vector3): Basis {
    return new Basis(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z);
  }

  static from_scale(scale: Vector3): Basis {
    return new Basis(scale.x, 0, 0, 0, scale.y, 0, 0, 0, scale.z);
  }

  /** Euler radians. Godot's default order is YXZ. */
  static from_euler(euler: Vector3): Basis {
    const cx = Math.cos(euler.x);
    const sx = Math.sin(euler.x);
    const cy = Math.cos(euler.y);
    const sy = Math.sin(euler.y);
    const cz = Math.cos(euler.z);
    const sz = Math.sin(euler.z);
    const xmat = new Basis(1, 0, 0, 0, cx, -sx, 0, sx, cx);
    const ymat = new Basis(cy, 0, sy, 0, 1, 0, -sy, 0, cy);
    const zmat = new Basis(cz, -sz, 0, sz, cz, 0, 0, 0, 1);
    return ymat.mul(xmat).mul(zmat);
  }

  /**
   * `target` is a direction. With `use_model_front`, local +Z points along that
   * direction, which is how a character faces the camera. Without it, local -Z
   * points along it, which is how a camera looks.
   */
  static looking_at(target: Vector3, up: Vector3 = Vector3.UP, use_model_front = false): Basis {
    if (target.is_zero_approx()) {
      throw new Error("Basis.looking_at: the target vector can't be zero.");
    }
    if (up.is_zero_approx()) {
      throw new Error("Basis.looking_at: the up vector can't be zero.");
    }
    let v_z = target.normalized();
    if (!use_model_front) {
      v_z = v_z.neg();
    }
    let v_x = up.cross(v_z);
    if (v_x.is_zero_approx()) {
      v_x = up.get_any_perpendicular();
    }
    v_x = v_x.normalized();
    const v_y = v_z.cross(v_x);
    return Basis.from_columns(v_x, v_y, v_z);
  }

  get x(): Vector3 {
    return this.get_column(0);
  }

  get y(): Vector3 {
    return this.get_column(1);
  }

  get z(): Vector3 {
    return this.get_column(2);
  }

  get_column(index: number): Vector3 {
    return new Vector3(this.rows[0].component(index), this.rows[1].component(index), this.rows[2].component(index));
  }

  xform(v: Vector3): Vector3 {
    return new Vector3(this.rows[0].dot(v), this.rows[1].dot(v), this.rows[2].dot(v));
  }

  xform_inv(v: Vector3): Vector3 {
    return this.inverse().xform(v);
  }

  mul(b: Basis): Basis {
    return Basis.from_columns(this.xform(b.x), this.xform(b.y), this.xform(b.z));
  }

  transposed(): Basis {
    const r = this.rows;
    return new Basis(r[0].x, r[1].x, r[2].x, r[0].y, r[1].y, r[2].y, r[0].z, r[1].z, r[2].z);
  }

  determinant(): number {
    const r = this.rows;
    return (
      r[0].x * (r[1].y * r[2].z - r[1].z * r[2].y) -
      r[0].y * (r[1].x * r[2].z - r[1].z * r[2].x) +
      r[0].z * (r[1].x * r[2].y - r[1].y * r[2].x)
    );
  }

  inverse(): Basis {
    const r = this.rows;
    const cofac = (row1: 0 | 1 | 2, col1: 0 | 1 | 2, row2: 0 | 1 | 2, col2: 0 | 1 | 2) =>
      r[row1].component(col1) * r[row2].component(col2) -
      r[row1].component(col2) * r[row2].component(col1);
    const c0 = cofac(1, 1, 2, 2);
    const c1 = cofac(1, 2, 2, 0);
    const c2 = cofac(1, 0, 2, 1);
    const det = r[0].x * c0 + r[0].y * c1 + r[0].z * c2;
    if (det === 0) {
      throw new Error("Basis.inverse: the basis has no inverse.");
    }
    const s = 1 / det;
    return new Basis(
      c0 * s,
      cofac(0, 2, 2, 1) * s,
      cofac(0, 1, 1, 2) * s,
      c1 * s,
      cofac(0, 0, 2, 2) * s,
      cofac(0, 2, 1, 0) * s,
      c2 * s,
      cofac(0, 1, 2, 0) * s,
      cofac(0, 0, 1, 1) * s,
    );
  }

  /** YXZ euler radians, matching Godot's default. */
  get_euler(): Vector3 {
    const r = this.rows;
    const epsilon = 0.00000025;
    const m12 = r[1].z;
    const euler = new Vector3();
    if (m12 < 1 - epsilon) {
      if (m12 > -(1 - epsilon)) {
        if (r[1].x === 0 && r[0].y === 0 && r[0].z === 0 && r[2].x === 0 && r[0].x === 1) {
          euler.x = Math.atan2(-m12, r[1].y);
          euler.y = 0;
          euler.z = 0;
        } else {
          euler.x = Math.asin(-m12);
          euler.y = Math.atan2(r[0].z, r[2].z);
          euler.z = Math.atan2(r[1].x, r[1].y);
        }
      } else {
        euler.x = Math.PI * 0.5;
        euler.y = Math.atan2(r[0].y, r[0].x);
        euler.z = 0;
      }
    } else {
      euler.x = -Math.PI * 0.5;
      euler.y = -Math.atan2(r[0].y, r[0].x);
      euler.z = 0;
    }
    return euler;
  }

  get_quaternion(): Quaternion {
    const m = this.rows;
    const trace = m[0].x + m[1].y + m[2].z;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1);
      const inv = 0.5 / s;
      return new Quaternion(
        (m[2].y - m[1].z) * inv,
        (m[0].z - m[2].x) * inv,
        (m[1].x - m[0].y) * inv,
        s * 0.5,
      );
    }
    const diag = [m[0].x, m[1].y, m[2].z];
    let i = diag[0] < diag[1] ? (diag[1] < diag[2] ? 2 : 1) : diag[0] < diag[2] ? 2 : 0;
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    const s = Math.sqrt(diag[i] - diag[j] - diag[k] + 1);
    const inv = 0.5 / s;
    const temp = [0, 0, 0, 0];
    temp[i] = s * 0.5;
    temp[3] = (m[k].component(j) - m[j].component(k)) * inv;
    temp[j] = (m[j].component(i) + m[i].component(j)) * inv;
    temp[k] = (m[k].component(i) + m[i].component(k)) * inv;
    return new Quaternion(temp[0], temp[1], temp[2], temp[3]);
  }

  is_equal_approx(b: Basis): boolean {
    return (
      this.rows[0].is_equal_approx(b.rows[0]) &&
      this.rows[1].is_equal_approx(b.rows[1]) &&
      this.rows[2].is_equal_approx(b.rows[2])
    );
  }

  private static _rows_from_quaternion(q: Quaternion): [Vector3, Vector3, Vector3] {
    const d = q.length_squared();
    const s = 2 / d;
    const xs = q.x * s;
    const ys = q.y * s;
    const zs = q.z * s;
    const wx = q.w * xs;
    const wy = q.w * ys;
    const wz = q.w * zs;
    const xx = q.x * xs;
    const xy = q.x * ys;
    const xz = q.x * zs;
    const yy = q.y * ys;
    const yz = q.y * zs;
    const zz = q.z * zs;
    return [
      new Vector3(1 - (yy + zz), xy - wz, xz + wy),
      new Vector3(xy + wz, 1 - (xx + zz), yz - wx),
      new Vector3(xz - wy, yz + wx, 1 - (xx + yy)),
    ];
  }
}
