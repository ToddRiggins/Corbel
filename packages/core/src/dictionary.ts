/**
 * Godot 4 Dictionary. An insertion-ordered key/value map, the same role as
 * `var d = {}` in GDScript. Keys are strings and numbers, compared by value.
 */
export class Dictionary<K extends string | number = string, V = unknown> {
  private readonly _pairs = new Map<K, V>();

  constructor(entries?: Iterable<readonly [K, V]>) {
    if (entries) {
      for (const [key, value] of entries) {
        this._pairs.set(key, value);
      }
    }
  }

  size(): number {
    return this._pairs.size;
  }

  is_empty(): boolean {
    return this._pairs.size === 0;
  }

  clear(): void {
    this._pairs.clear();
  }

  has(key: K): boolean {
    return this._pairs.has(key);
  }

  has_all(keys: K[]): boolean {
    return keys.every((key) => this._pairs.has(key));
  }

  /** Returns the value at `key`, or `fallback` (null) when the key is missing. */
  get(key: K, fallback: V = null as V): V {
    return this._pairs.get(key) ?? fallback;
  }

  set(key: K, value: V): void {
    this._pairs.set(key, value);
  }

  /** `get_or_add` in Godot: returns the value, and stores `fallback` first when missing. */
  get_or_add(key: K, fallback: V): V {
    if (!this._pairs.has(key)) {
      this._pairs.set(key, fallback);
    }
    return this._pairs.get(key)!;
  }

  erase(key: K): boolean {
    return this._pairs.delete(key);
  }

  keys(): K[] {
    return [...this._pairs.keys()];
  }

  values(): V[] {
    return [...this._pairs.values()];
  }

  /** Combines `other` into this dictionary. `overwrite` replaces existing values. */
  merge(other: Dictionary<K, V>, overwrite = false): void {
    for (const [key, value] of other._pairs) {
      if (overwrite || !this._pairs.has(key)) {
        this._pairs.set(key, value);
      }
    }
  }

  /** First key whose value matches. Numbers compare with Godot's float epsilon. */
  find_key(value: V): K | null {
    for (const [key, current] of this._pairs) {
      if (same_value(current, value)) {
        return key;
      }
    }
    return null;
  }

  /** Deep copies nested Dictionaries and arrays when `deep` is true. */
  duplicate(deep = false): Dictionary<K, V> {
    const out = new Dictionary<K, V>();
    for (const [key, value] of this._pairs) {
      out._pairs.set(key, deep ? (deep_copy(value) as V) : value);
    }
    return out;
  }

  equals(other: Dictionary<K, V>): boolean {
    if (this._pairs.size !== other._pairs.size) {
      return false;
    }
    for (const [key, value] of this._pairs) {
      if (!other._pairs.has(key) || !same_value(other._pairs.get(key) as V, value)) {
        return false;
      }
    }
    return true;
  }
}

function same_value(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a === "number" && typeof b === "number") {
    return is_zero_eps(a - b);
  }
  if (a instanceof Dictionary && b instanceof Dictionary) {
    return a.equals(b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => same_value(item, b[i]));
  }
  return false;
}

function is_zero_eps(delta: number): boolean {
  return Math.abs(delta) < 1e-5;
}

function deep_copy(value: unknown): unknown {
  if (value instanceof Dictionary) {
    return value.duplicate(true);
  }
  if (Array.isArray(value)) {
    return value.map(deep_copy);
  }
  return value;
}
