/** A Godot-style signal. Listeners run in the order they connected. */
export class Signal<T extends unknown[] = []> {
  private readonly _slots: Array<(...args: T) => void> = [];

  connect(callback: (...args: T) => void): void {
    if (!this._slots.includes(callback)) {
      this._slots.push(callback);
    }
  }

  disconnect(callback: (...args: T) => void): void {
    const index = this._slots.indexOf(callback);
    if (index >= 0) {
      this._slots.splice(index, 1);
    }
  }

  is_connected(callback: (...args: T) => void): boolean {
    return this._slots.includes(callback);
  }

  emit(...args: T): void {
    for (const slot of [...this._slots]) {
      slot(...args);
    }
  }
}
