export type LockMode = 'shared' | 'exclusive';
export type LockWaitingEntry = {
  mode: LockMode;
  highPriority?: boolean; // if true and this is the next one
  resolve: () => void;
};
export type LockEntry = (
  | { mode: 'shared'; others: number }
  | { mode: 'exclusive' }
) & {
  waiting: LockWaitingEntry[];
};

export type LockPriority = 'default' | 'earlier' | 'prevent-new-acquisitions';

export class KeyedShareableLock {
  // if a key has an entry as a key in this object then that key is assumed to be locked
  entries: Record<string, LockEntry>;
  constructor() {
    this.entries = {};
  }
  async acquire(
    key: string,
    mode: LockMode,
    priorityLevel: LockPriority = 'default'
  ): Promise<void> {
    const entry = this.entries[key];
    if (entry == null) {
      this.entries[key] = {
        mode,
        others: 0,
        waiting: [],
      };
    } else if (
      mode === 'shared' &&
      entry.mode === 'shared' &&
      !entry.waiting?.[0]?.highPriority
    ) {
      ++entry.others;
    } else {
      return KeyedShareableLock.addLockWaitingEntry(entry, mode, priorityLevel);
    }
  }
  private static addLockWaitingEntry(
    entry: LockEntry,
    mode: LockMode,
    priorityLevel: LockPriority
  ): Promise<void> {
    return new Promise((resolve) => {
      const lwe: LockWaitingEntry = {
        mode,
        resolve,
        highPriority: priorityLevel === 'prevent-new-acquisitions',
      };
      if (priorityLevel === 'default') {
        entry.waiting.push({ mode, resolve });
      } else {
        entry.waiting.unshift(lwe);
      }
    });
  }
  // upgrade a lock currently locked in shared to exclusive mode without yielding shared lock access
  async upgrade(
    key: string,
    priorityLevel: LockPriority = 'default'
  ): Promise<void> {
    const entry = this.entries[key];
    if (entry == null) {
      throw new Error('was not acquired');
    } else if (entry.mode !== 'shared') {
      throw new Error('was not acquired in same mode (expected shared mode)');
    }
    if (entry.others === 0) {
      if (
        entry.waiting.length === 0 ||
        priorityLevel === 'prevent-new-acquisitions'
      ) {
        this.entries[key] = {
          mode: 'exclusive',
          waiting: entry.waiting,
        };
        return;
      }
    }
    // intentionally unawaited
    const res = KeyedShareableLock.addLockWaitingEntry(
      entry,
      'exclusive',
      priorityLevel
    );
    this.release(key, 'shared');
    return res;
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

export const fileLock = new KeyedShareableLock();
