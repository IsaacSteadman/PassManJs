import { open, rename, rm } from 'fs/promises';
import { KeyedShareableLock } from '../utils/KeyedShareableLock';
import { WrappedFile } from '../utils/WrappedFile';
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
  writeable: WrappedFile
) => Promise<void>;

type OperateWrite = (
  user: User,
  state: State,
  writeable: WrappedFile
) => Promise<void>;

export async function getUserDataBufferV2({
  path,
  password,
  authErr,
  ...options
}: {
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
      conditions: Conditions;
      preconditionErr: (
        state: State,
        preconditionChecksFailed: string[]
      ) => Promise<void>;
      afterSavedIfNotResponded?: (state: State) => Promise<void>;
    }
  | { type: 'new'; operate: OperateWrite }
)): Promise<void> {
  const state = { responded: false, completed: false };
  let lockAcquired = false;
  let authenticated = false;
  let authenticationThrewError = false;
  try {
    if (options.type === 'new') {
      await userLock.acquire(path, 'exclusive');
      const writeable = new WrappedFile(await open(path, 'w'));
      try {
        const user = await User.getNewUser();
        options.operate(user, state, writeable);
      } finally {
        await writeable.fh.close();
      }
    } else {
      const readable = new WrappedFile(await open(path, 'r'));
      try {
        const readAndWriteCommon = async () => {
          lockAcquired = true;
          const user = await User.getUser(readable);
          authenticationThrewError = true;
          const verified = await user.verifyPassword(password);
          authenticationThrewError = false;
          if (!verified) {
            throw new Error('invalid username or password');
          }
          authenticated = true;
          return user;
        };
        if (options.type === 'write') {
          await userLock.acquire(path, 'exclusive');
          const writeable = new WrappedFile(await open(`${path} new`, 'w'));
          try {
            const user = await readAndWriteCommon();
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
                await options.preconditionErr(state, failures);
                return;
              }
            }
            await options.operate(user, state, readable, writeable);
          } finally {
            await writeable.fh.close();
          }
        } else {
          await userLock.acquire(path, 'shared');
          const user = await readAndWriteCommon();
          await options.operate(user, state, readable);
        }
      } finally {
        await readable.fh.close();
      }
    }
  } catch (exc) {
    if (options.type === 'write' && !state.completed) {
      await rm(path);
      await rename(`${path} new`, path);
      state.completed = true;
    }
    if (!authenticated && !authenticationThrewError) {
      await authErr(state);
    } else {
      await authErr(state, exc);
    }
  } finally {
    if (state.completed) {
      if (options.type === 'write') {
        await rm(path);
        await rename(`${path} new`, path);
        if (
          !state.responded &&
          typeof options.afterSavedIfNotResponded === 'function'
        ) {
          try {
            await options.afterSavedIfNotResponded(state);
          } catch (exc) {
            console.warn('WARN: afterSavedIfNotResponded threw', exc);
          }
        }
      }
    } else {
      if (options.type === 'write') {
        await rm(`${path} new`);
      } else if (options.type === 'new') {
        await rm(path);
      }
      state.completed = true;
    }
    if (lockAcquired) {
      userLock.release(path, options.type !== 'read' ? 'exclusive' : 'shared');
    }
    if (!state.responded) {
      console.warn('WARN: operate function did not respond');
    }
  }
}
