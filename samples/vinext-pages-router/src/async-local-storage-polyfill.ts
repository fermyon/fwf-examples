// src/async-local-storage-polyfill.ts
// Polyfill for AsyncLocalStorage that works in single-threaded environments

export class AsyncLocalStorage<T> {
  private _store: T | undefined = undefined;

  getStore(): T | undefined {
    return this._store;
  }

  run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
    const prev = this._store;
    this._store = store;
    try {
      return callback(...args);
    } finally {
      this._store = prev;
    }
  }

  exit<R>(callback: (...args: any[]) => R, ...args: any[]): R {
    const prev = this._store;
    this._store = undefined;
    try {
      return callback(...args);
    } finally {
      this._store = prev;
    }
  }

  enterWith(store: T): void {
    this._store = store;
  }

  disable(): void {
    this._store = undefined;
  }

  static bind<Func extends (...args: any[]) => any>(fn: Func): Func {
    return fn;
  }

  static snapshot(): <R, TArgs extends any[]>(fn: (...args: TArgs) => R, ...args: TArgs) => R {
    return (fn, ...args) => fn(...args);
  }
}

export default { AsyncLocalStorage };
