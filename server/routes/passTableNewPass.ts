import { serverPolicyAuthThrow } from '../ServerPolicy';
import {
  checkConditions,
  getBinaryBodyDataThrow,
  getConditionsThrow,
  getNewPassThrow,
  getPasswordThrow,
  getUserInfo,
  getUsernameStrThrow,
  UserOperationArg,
  UserOperationReturn,
  stringifyDateHeader,
} from '../utils';

export async function passTableNewPass({
  acquireRead,
  getWritable,
  req,
  res,
  state,
  setUserFilePath,
  upgradeLock,
  getReadable,
  authUser,
  debugLog,
  fsSource,
}: UserOperationArg): Promise<UserOperationReturn> {
  debugLog('passTableNewPass');
  const policy = serverPolicyAuthThrow(req);
  const username = getUsernameStrThrow(req);
  const password = getPasswordThrow(req);
  const newPass = getNewPassThrow(req);
  const dataFromClient = getBinaryBodyDataThrow(req);
  const conditions = getConditionsThrow(req);
  const { path } = getUserInfo(username);
  await setUserFilePath(path);
  await acquireRead();
  const user = await authUser(password);
  if (!(await policy.updatePasswordHook(username, dataFromClient))) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_POLICY',
        action: 'updatePassword',
        message: 'action was blocked by server policy',
      },
    };
  }
  const readable = await getReadable();
  const preconditionChecksFailed = await checkConditions(conditions, readable);
  if (preconditionChecksFailed.length) {
    throw {
      type: 'json-response',
      jsonStatus: 412,
      jsonBody: {
        type: 'E_PRECONDITION',
        preconditionChecksFailed,
        message:
          'your password vault was probably modified by another session the current session was loaded',
      },
    };
  }
  await upgradeLock();
  const pWritable = getWritable();
  await user.setPassword(newPass);
  await user.putDataBuffer(dataFromClient);
  await user.save(await pWritable);
  state.completed = true;
  return async () => {
    res
      .status(200)
      .header(
        'last-modified',
        stringifyDateHeader(await fsSource.getMTime(path))
      )
      .json({
        type: 'SUCCESS',
        message: 'successfully saved password table',
      });
    state.responded = true;
  };
}
