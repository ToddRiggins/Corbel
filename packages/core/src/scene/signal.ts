/** A Godot-style signal. Listeners run in the order they connected. Awaiting a signal resolves on its next emit. */
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

  /**
   * Resolves with the emit arguments on the next emit, so scripts can port
   * Godot's `await signal` idiom: `await tree.create_timer(0.5).timeout`.
   */
  once(): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const listener = (...args: T): void => {
      this.disconnect(listener);
      resolve(args);
    };
    if (this._slots.includes(listener)) {
      reject(new Error("Signals do not await a listener that is already connected."));
      return promise;
    }
    this.connect(listener);
    return promise;
  }

  /** Promise interop for `await some_signal`, mirroring `await` in GDScript. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then(onFulfilled?: (value: T) => any, onRejected?: (reason: unknown) => any): PromiseLike<any> {
    return this.once().then((args) => (onFulfilled ? onFulfilled.call(this, args) : args), onRejected);
  }

  emit(...args: T): void {
    for (const slot of [...this._slots]) {
      slot(...args);
    }
  }
}
