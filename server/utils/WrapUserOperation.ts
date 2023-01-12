import { Request, Response } from 'express';
import { fileLock, LockMode } from './KeyedShareableLock';
import { lpad } from './lpad';
import { User } from './User';
import { FsSource, WrappedFile } from './WrappedFile';

type State = { responded: boolean; completed: boolean };

export interface UserOperationArg {
  req: Request;
  res: Response;
  state: State;
  setUserFilePath: (path: string) => Promise<void>;
  errorLog: (...args: any[]) => void;
  warnLog: (...args: any[]) => void;
  log: (...args: any[]) => void;
  infoLog: (...args: any[]) => void;
  debugLog: (...args: any[]) => void;
  authUser: (password: Buffer) => Promise<User>;
  acquireRead: () => Promise<void>;
  getReadable: () => Promise<WrappedFile>;
  upgradeLock: () => Promise<void>;
  getWritable: () => Promise<WrappedFile>;
  fsSource: FsSource;
}

/** if operate returns a function then that function will be called after
 *  all files are closed, but before releasing the lock
 **/
export type UserOperationReturn = void | (() => Promise<void>);

const maxDateLen = new Date(2022, 11, 30).toLocaleString().length;
type LogEntry = {
  level: 'error' | 'warn' | 'log' | 'info' | 'debug';
  time: number;
  line: any[];
};

function outputLogEntry({ level, time, line }: LogEntry, tag?: string) {
  console[level](
    `[${lpad(maxDateLen, new Date(time).toLocaleString(), ' ')} (${lpad(
      5,
      `${time % 1000}ms`,
      ' '
    )})]`,
    `[${lpad(5, level.toUpperCase(), ' ')}]`,
    ...(tag == null ? line : [tag, ...line])
  );
}

export async function wrapUserOperation(
  req: Request,
  res: Response,
  type: 'create' | 'read' | 'update',
  operate: (options: UserOperationArg) => Promise<UserOperationReturn>,
  fsSource: FsSource
): Promise<void> {
  const state: {
    lockMode: 'unlocked' | LockMode;
    operationState: State;
    userPath?: string;
    writable?: {
      path: string;
      promise: Promise<WrappedFile>;
    };
    readable?: {
      path: string;
      promise: Promise<WrappedFile>;
    };
  } = {
    lockMode: 'unlocked',
    operationState: {
      completed: false,
      responded: false,
    },
  };
  const logData: LogEntry[] = [];
  const errorLog = (...line: any[]) => {
    logData.push({ level: 'error', time: Date.now(), line });
  };
  const warnLog = (...line: any[]) => {
    logData.push({ level: 'warn', time: Date.now(), line });
  };
  const log = (...line: any[]) => {
    logData.push({ level: 'log', time: Date.now(), line });
  };
  const infoLog = (...line: any[]) => {
    logData.push({ level: 'info', time: Date.now(), line });
  };
  const debugLog = (...line: any[]) => {
    logData.push({ level: 'debug', time: Date.now(), line });
  };
  const getReadable: UserOperationArg['getReadable'] = () => {
    debugLog('  get readable request');
    if (state.lockMode === 'unlocked') {
      throw new Error('expected to be locked but was unlocked');
    }
    if (state.userPath == null) {
      throw new Error('must call setUserFilePath before getting readable');
    }
    if (type === 'create') {
      throw new Error(
        'cannot read if does not exist (type = create assumes does not previously exist)'
      );
    }
    if (state.readable == null) {
      debugLog('    creating new file handle in read mode');
      const path = state.userPath;
      state.readable = {
        path,
        promise: fsSource.openFile(path, 'r').catch((err) =>
          Promise.reject(
            err?.code === 'ENOENT'
              ? {
                  type: 'json-response',
                  jsonStatus: 400,
                  jsonBody: {
                    type: 'E_AUTH',
                    query_param: 'username|password',
                    message: 'username or password is incorrect',
                  },
                }
              : err
          )
        ),
      };
    }
    return state.readable.promise.then((wf) => {
      debugLog('    readable gotten');
      return wf;
    });
  };
  const authUser: UserOperationArg['authUser'] = async (password) => {
    debugLog('  auth user request');
    const readable = await getReadable();
    const user = await User.getUser(readable);
    const verified = await user.verifyPassword(password);
    if (!verified) {
      debugLog('    auth user failed');
      throw {
        type: 'json-response',
        jsonStatus: 400,
        jsonBody: {
          type: 'E_AUTH',
          query_param: 'username|password',
          message: 'username or password is incorrect',
        },
      };
    }
    debugLog('    auth user success');
    return user;
  };

  const getWritable = () => {
    debugLog('  get readable request');
    if (state.lockMode !== 'exclusive') {
      throw new Error('cannot get writable file if not in exclusive lock mode');
    }
    if (state.userPath == null) {
      throw new Error('must call setUserFilePath before getting writable');
    }
    if (state.writable == null) {
      const path = type === 'update' ? `${state.userPath} new` : state.userPath;
      debugLog('    creating new file handle in read mode');
      state.writable = {
        path,
        promise: fsSource.openFile(path, 'w'),
      };
    }
    return state.writable.promise.then((wf) => {
      debugLog('    readable gotten');
      return wf;
    });
  };
  const setUserFilePath = async (path) => {
    debugLog('  set user file path', JSON.stringify(path));
    state.userPath = path;
  };
  const upgradeLock = async () => {
    debugLog('  upgrade lock request');
    if (type === 'read') {
      throw new Error(
        'cannot upgrade lock to exclusive for operation of type "read"'
      );
    }
    if (state.userPath == null) {
      throw new Error('must call setUserFilePath before acquiring locks');
    }
    if (state.lockMode !== 'shared') {
      throw new Error(
        `expected to be locked in shared mode, but got "${state.lockMode}"`
      );
    }
    await fileLock.upgrade(state.userPath, 'prevent-new-acquisitions');
    state.lockMode = 'exclusive';
    debugLog('    lock upgraded to exclusive');
  };
  const acquireRead = async () => {
    debugLog('  acquire read request');
    if (state.userPath == null) {
      throw new Error('must call setUserFilePath before acquiring locks');
    }
    if (state.lockMode !== 'unlocked') {
      throw new Error(`expected to be unlocked, but got ${state.lockMode}`);
    }
    await fileLock.acquire(state.userPath, 'shared');
    state.lockMode = 'shared';
    debugLog('    shared read access granted');
  };
  let afterCloseFn: UserOperationReturn;
  try {
    afterCloseFn = await operate({
      req,
      res,
      state: state.operationState,
      setUserFilePath,
      acquireRead,
      upgradeLock,
      getWritable,
      authUser,
      getReadable,
      errorLog,
      warnLog,
      log,
      infoLog,
      debugLog,
      fsSource,
    });
  } catch (err) {
    if (err?.type === 'json-response' && !state.operationState.responded) {
      res.status(err?.jsonStatus || 400).json(err?.jsonBody || {});
      state.operationState.responded = true;
    } else {
      res.status(500).json({ type: 'SERVER_ERROR' });
      state.operationState.responded = true;
      errorLog(err);
    }
  } finally {
    try {
      (await state.readable?.promise)?.close();
    } catch (err) {
      errorLog('error occurred attempting to close readable', err);
    }
    try {
      (await state.writable?.promise)?.close();
    } catch (err) {
      errorLog('error occurred attempting to close writable', err);
    }
    try {
      const runAfterClose = async () => {
        if (typeof afterCloseFn === 'function') {
          debugLog('  running after close callback');
          try {
            await afterCloseFn();
          } catch (err) {
            errorLog('error occurred running afterCloseFn', err);
          }
        }
      };
      if (state.operationState.completed) {
        if (
          state.writable != null &&
          state.readable != null &&
          state.writable.path !== state.readable.path
        ) {
          await fsSource.renameToReplace(
            state.writable.path,
            state.readable.path
          );
        }
        await runAfterClose();
        if (!state.operationState.responded) {
          errorLog('  function responded = false, but completed = true');
          res.status(200).json({ type: 'SUCCESS' });
        }
      } else {
        if (
          state.writable != null &&
          state.readable != null &&
          state.writable.path !== state.readable.path
        ) {
          await fsSource.remove(state.writable.path);
        }
        await runAfterClose();
        if (!state.operationState.responded) {
          errorLog('  function responded = false, and completed = false');
          res.status(500).json({ type: 'E_UNKNOWN' });
        }
      }
      if (state.lockMode !== 'unlocked') {
        if (state.userPath == null) {
          errorLog(
            'ERR: userPath is null and lock is still locked, but userPath is required to unlock'
          );
        } else {
          fileLock.release(state.userPath, state.lockMode);
          debugLog(`  ${state.lockMode} lock released`);
          state.lockMode = 'unlocked';
        }
      }
    } finally {
      logData.forEach((ent) => outputLogEntry(ent));
    }
  }
}
