import { serverPolicyAuthThrow } from '../ServerPolicy';
import {
  getPasswordThrow,
  getUserInfo,
  getUsernameStrThrow,
  UserOperationArg,
  UserOperationReturn,
  stringifyDateHeader,
} from '../utils';

export async function getPassTable({
  acquireRead,
  req,
  res,
  state,
  setUserFilePath,
  getReadable,
  authUser,
  debugLog,
}: UserOperationArg): Promise<UserOperationReturn> {
  debugLog('getPassTable');
  const policy = serverPolicyAuthThrow(req);
  const username = getUsernameStrThrow(req);
  const password = getPasswordThrow(req);
  const accepted = req.accepts(['json', 'octet-stream']);
  if (!accepted) {
    throw {
      type: 'json-response',
      jsonStatus: 406,
      jsonBody: {
        type: 'E_BAD_ACCEPTS',
        message: 'the response type would be unacceptable to the request',
        availableResponseTypes: [
          'application/json',
          'application/octet-stream',
        ],
      },
    };
  }
  const { path } = getUserInfo(username);
  await setUserFilePath(path);
  await acquireRead();
  const user = await authUser(password);
  const readable = await getReadable();
  await user.loadBody(readable);
  const data = await user.getDataBuffer();
  if (!(await policy.readAccountHook(username, data))) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_POLICY',
        action: 'readAccount',
        message: 'action was blocked by server policy',
      },
    };
  }

  const mtime = await readable.getMTime();
  const lastModified = stringifyDateHeader(mtime);
  if (accepted === 'octet-stream') {
    res
      .status(200)
      .header('last-modified', lastModified)
      .header('content-type', 'application/octet-stream')
      .write(data);
  } else {
    res
      .status(200)
      .header('last-modified', lastModified)
      .json({
        type: 'SUCCESS',
        data: data.toString('hex'),
      });
  }
  state.responded = true;
  state.completed = true;
}
