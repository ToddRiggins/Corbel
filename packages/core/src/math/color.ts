import { is_equal_approx } from "./approx.js";

/** Godot 4 Color. Components are 0 to 1. */
export class Color {
  constructor(
    public r = 0,
    public g = 0,
    public b = 0,
    public a = 1,
  ) {}

  static readonly WHITE = new Color(1, 1, 1, 1);
  static readonly BLACK = new Color(0, 0, 0, 1);

  /** `#rgb`, `#rrggbb`, or `#rrggbbaa`. */
  static html(code: string): Color {
    const hex = code.startsWith("#") ? code.slice(1) : code;
    const expand = (pair: string) => parseInt(pair, 16) / 255;
    if (hex.length === 3) {
      return new Color(expand(hex[0] + hex[0]), expand(hex[1] + hex[1]), expand(hex[2] + hex[2]), 1);
    }
    if (hex.length === 6 || hex.length === 8) {
      return new Color(
        expand(hex.slice(0, 2)),
        expand(hex.slice(2, 4)),
        expand(hex.slice(4, 6)),
        hex.length === 8 ? expand(hex.slice(6, 8)) : 1,
      );
    }
    throw new Error(`Color.html: expected #rgb, #rrggbb, or #rrggbbaa, got "${code}".`);
  }

  to_html(with_alpha = false): string {
    const byte = (n: number) =>
      Math.round(Math.min(1, Math.max(0, n)) * 255)
        .toString(16)
        .padStart(2, "0");
    const rgb = `#${byte(this.r)}${byte(this.g)}${byte(this.b)}`;
    return with_alpha ? rgb + byte(this.a) : rgb;
  }

  is_equal_approx(c: Color): boolean {
    return (
      is_equal_approx(this.r, c.r) &&
      is_equal_approx(this.g, c.g) &&
      is_equal_approx(this.b, c.b) &&
      is_equal_approx(this.a, c.a)
    );
  }
}
