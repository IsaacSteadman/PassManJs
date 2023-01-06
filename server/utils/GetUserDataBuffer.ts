import { open, rename, rm } from 'fs/promises';
import { KeyedShareableLock, LockMode } from './KeyedShareableLock';
import { WrappedFile } from './WrappedFile';
import type { Conditions } from './ConditionalHeaders';
import { User } from './User';

const userLock = new KeyedShareableLock();

type State = { responded: boolean; completed: boolean };

type OperateRead = (
  user: User,
  state: State,
  readable: WrappedFile
) => Promise<void>;

type OperateReadWrite = (
  user: User,
  state: State,
  readable: WrappedFile,
  writable: WrappedFile
) => Promise<void>;

type OperateWrite = (
  user: User,
  state: State,
  writable: WrappedFile
) => Promise<void>;

export async function getUserDataBufferV2({
  path,
  password,
  authErr,
  prependLog,
  ...options
}: {
  prependLog?: string;
  path: string;
  password: Buffer;
  authErr: (state: State, err?: any) => Promise<void>;
} & (
  | {
      type: 'read';
      operate: OperateRead;
    }
  | {
      type: 'write';
      operate: OperateReadWrite;
      preOpenWritable: (state: State) => Promise<void>;
      conditions: Conditions;
      preconditionErr: (
        state: State,
        preconditionChecksFailed: string[]
      ) => Promise<void>;
      afterSavedIfNotResponded?: (state: State) => Promise<void>;
    }
  | {
      type: 'new';
      operate: OperateWrite;
      preOpenWritable: (state: State) => Promise<void>;
    }
)): Promise<void> {
  const log = (s: string, ...args: any[]) => {
    if (typeof prependLog === 'string') {
      s = prependLog + s;
    }
    console.log(s, ...args);
  };
  const state = { responded: false, completed: false };
  let lockAcquired = false;
  let authenticated = false;
  let authenticationThrewError = false;
  let writableCreated = false;
  try {
    if (options.type === 'new') {
      log('acquire exclusive', JSON.stringify(path));
      await userLock.acquire(path, 'exclusive');
      log('preOpenWritable');
      await options.preOpenWritable(state);
      if (state.responded) {
        log('  responded (assume failed)');
        return;
      }
      log('open file (w)', JSON.stringify(path));
      const writable = new WrappedFile(await open(path, 'w'));
      try {
        writableCreated = true;
        log('getNewUser');
        const user = await User.getNewUser();
        log('operate (new)');
        await options.operate(user, state, writable);
      } finally {
        log('close file (w)');
        await writable.fh.close();
      }
    } else {
      const lockMode: LockMode =
        options.type === 'read' ? 'shared' : 'exclusive';
      log('acquire', lockMode, JSON.stringify(path));
      await userLock.acquire(path, lockMode);
      lockAcquired = true;
      log('open file (r)', JSON.stringify(path));
      const readable = new WrappedFile(await open(path, 'r'));
      try {
        const readAndWriteCommon = async () => {
          log('getUser');
          const user = await User.getUser(readable);
          authenticationThrewError = true;
          log('verify password');
          const verified = await user.verifyPassword(password);
          authenticationThrewError = false;
          if (!verified) {
            throw new Error('invalid username or password');
          }
          authenticated = true;
          log('got user');
          return user;
        };
        if (options.type === 'write') {
          const user = await readAndWriteCommon();
          log('checking preconditions');
          const { ifModifiedSince, ifUnmodifiedSince } = options.conditions;
          if (ifModifiedSince != null || ifUnmodifiedSince != null) {
            const failures: string[] = [];
            const { mtime } = await readable.fh.stat();

            if (
              ifModifiedSince != null &&
              mtime.getTime() <= ifModifiedSince.getTime()
            ) {
              failures.push('if-modified-since');
            }

            if (
              ifUnmodifiedSince != null &&
              mtime.getTime() > ifUnmodifiedSince.getTime()
            ) {
              failures.push('if-unmodified-since');
            }

            if (failures.length) {
              log('precondition error');
              await options.preconditionErr(state, failures);
              return;
            }
          }
          log('preOpenWritable');
          await options.preOpenWritable(state);
          if (state.responded) {
            log('  responded (assume failed)');
            return;
          }
          log('open file (w)', JSON.stringify(`${path} new`));
          const writable = new WrappedFile(await open(`${path} new`, 'w'));
          try {
            writableCreated = true;
            log('operate (write)');
            await options.operate(user, state, readable, writable);
          } finally {
            log('close file (w)');
            await writable.fh.close();
          }
        } else {
          const user = await readAndWriteCommon();
          log('operate (read)');
          await options.operate(user, state, readable);
        }
      } finally {
        log('close file (r)');
        await readable.fh.close();
      }
    }
  } catch (exc) {
    log('error');
    if (!authenticated && !authenticationThrewError) {
      await authErr(state);
    } else {
      await authErr(state, exc);
    }
  } finally {
    if (state.completed) {
      if (options.type === 'write') {
        log('completed write, deleting old and renaming new to current');
        try {
          await rm(path);
          await rename(`${path} new`, path);
          log('  done');
          if (
            !state.responded &&
            typeof options.afterSavedIfNotResponded === 'function'
          ) {
            try {
              log('running after saved');
              await options.afterSavedIfNotResponded(state);
            } catch (exc) {
              log('WARN: afterSavedIfNotResponded threw', exc);
            }
          }
        } catch (exc) {
          log('err', exc);
        }
      }
    } else {
      if (options.type === 'write') {
        log('not completed write');
        if (writableCreated) {
          log('removing', JSON.stringify(`${path} new`));
          try {
            await rm(`${path} new`);
          } catch (exc) {
            log('err removing', exc);
          }
        }
      } else if (options.type === 'new') {
        log('not completed new');
        if (writableCreated) {
          log('removing', JSON.stringify(path));
          try {
            await rm(path);
          } catch (exc) {
            log('err removing', exc);
          }
        }
      }
      state.completed = true;
    }
    if (lockAcquired) {
      const lockMode: LockMode =
        options.type !== 'read' ? 'exclusive' : 'shared';
      log('lock release', lockMode);
      userLock.release(path, lockMode);
    }
    if (!state.responded) {
      log('WARN: operate function did not respond');
    }
  }
}
