export type LockMode = 'shared' | 'exclusive';
export type LockWaitingEntry = { mode: LockMode; resolve: () => void };
export type LockEntry = (
  | { mode: 'shared'; others: number }
  | { mode: 'exclusive' }
) & {
  waiting: LockWaitingEntry[];
};

export class KeyedShareableLock {
  // if a key has an entry as a key in this object then that key is assumed to be locked
  entries: Record<string, LockEntry>;
  constructor() {
    this.entries = {};
  }
  async acquire(key: string, mode: LockMode): Promise<void> {
    const entry = this.entries[key];
    if (entry == null) {
      this.entries[key] = {
        mode,
        others: 0,
        waiting: [],
      };
    } else if (mode === 'shared' && entry.mode === 'shared') {
      ++entry.others;
    } else {
      return new Promise((resolve) => entry.waiting.push({ mode, resolve }));
    }
  }
  release(key: string, mode: LockMode): void {
    const entry = this.entries[key];
    if (entry == null) {
      throw new Error('was not acquired');
    } else if (entry.mode !== mode) {
      throw new Error('was not acquired in same mode');
    }
    const next = () => {
      if (entry.waiting.length === 0) {
        delete this.entries[key];
        return;
      }
      const nextOne = entry.waiting.shift() as NonNullable<
        ReturnType<typeof entry.waiting.shift>
      >;
      if (nextOne.mode === 'shared') {
        const toCall = [nextOne.resolve];
        const waiting = entry.waiting.filter(({ mode, resolve }) => {
          if (mode === 'shared') {
            toCall.push(resolve);
            return false;
          } else {
            return true;
          }
        });
        this.entries[key] = {
          mode: 'shared',
          others: toCall.length - 1,
          waiting,
        };
        toCall.forEach((x) => x());
      } else {
        this.entries[key] = {
          mode: 'exclusive',
          waiting: entry.waiting,
        };
        nextOne.resolve();
      }
    };
    if (entry.mode === 'shared') {
      if (entry.others <= 0) {
        next();
      } else {
        --entry.others;
      }
    } else if (entry.mode === 'exclusive') {
      next();
    }
  }
}
