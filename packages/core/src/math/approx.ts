/** Godot's CMP_EPSILON. Comparisons in the math types use this. */
export const CMP_EPSILON = 0.00001;

export function is_equal_approx(a: number, b: number): boolean {
  if (a === b) {
    return true;
  }
  let tolerance = CMP_EPSILON * Math.abs(a);
  if (tolerance < CMP_EPSILON) {
    tolerance = CMP_EPSILON;
  }
  return Math.abs(a - b) < tolerance;
}

export function is_zero_approx(a: number): boolean {
  return Math.abs(a) < CMP_EPSILON;
}
