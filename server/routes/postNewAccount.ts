import { serverPolicyAuthThrow } from '../ServerPolicy';
import {
  getBinaryBodyDataThrow,
  getNewPassThrow,
  getUserInfo,
  getUsernameStrThrow,
  UserOperationArg,
  User,
  UserOperationReturn,
} from '../utils';

export async function postNewAccount({
  acquireRead,
  getWritable,
  req,
  res,
  state,
  setUserFilePath,
  upgradeLock,
  log,
  fsSource,
}: UserOperationArg): Promise<UserOperationReturn> {
  try {
    log('postNewAccount begin');
    const policy = serverPolicyAuthThrow(req);
    const username = getUsernameStrThrow(req);
    const newPass = getNewPassThrow(req);
    const dataFromClient = getBinaryBodyDataThrow(req);
    const { path } = getUserInfo(username);
    await setUserFilePath(path);
    if (!(await policy.createAccountHook(username, dataFromClient))) {
      throw {
        type: 'json-response',
        jsonStatus: 400,
        jsonBody: {
          type: 'E_POLICY',
          action: 'createAccount',
          message: 'action was blocked by server policy',
        },
      };
    }
    await acquireRead();
    if (await fsSource.exists(path)) {
      throw {
        type: 'json-response',
        jsonStatus: 400,
        jsonBody: { type: 'E_USER', message: 'username already taken' },
      };
    }
    await upgradeLock();
    const pWritable = getWritable();
    const user = await User.getNewUser();
    await user.setPassword(newPass);
    await user.putDataBuffer(dataFromClient);
    await user.save(await pWritable);
    state.completed = true;
    return async () => {
      res.status(201).json({
        type: 'SUCCESS',
        message: 'vault created successfully',
      });
      state.responded = true;
    };
  } finally {
    log('postNewAccount ended');
  }
}
