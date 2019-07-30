import { serverConfig } from "./consts";
import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";

export class ServerPolicy {
  constructor() {
  }
  readAccountHook(username: string, data: Buffer): boolean {
    return true;
  }
  createAccountHook(username: string, data: Buffer): boolean {
    return true;
  }
  updateAccountHook(username: string, data: Buffer): boolean {
    return true;
  }
  updatePasswordHook(username: string, data: Buffer): boolean {
    return true;
  }
}

export class NullPolicy extends ServerPolicy {
  readAccountHook(username: string, data: Buffer): boolean {
    return false;
  }
  createAccountHook(username: string, data: Buffer): boolean {
    return false;
  }
  updateAccountHook(username: string, data: Buffer): boolean {
    return false;
  }
  updatePasswordHook(username: string, data: Buffer): boolean {
    return false;
  }
}

export const serverPolicyMap = {
  'ROOT_POLICY': new ServerPolicy(),
  'NULL_POLICY': new NullPolicy()
};

export function serverPolicyAuth(req: Request, res: Response): ServerPolicy | null {
  const serverNs = req.query.server_ns
  if (serverNs != null && typeof serverNs === 'string') {
    const policies = serverConfig.PolicySpaces
    if (policies == null) {
      res.status(400).json({
        type: 'E_SERVER_NS',
        queryParams: ['server_ns', 'server_pass'],
        message: 'unrecognized server_ns or server_pass'
      });
      return null;
    }
    const policy = policies[serverNs];
    if (policy == null) {
      res.status(400).json({
        type: 'E_SERVER_NS',
        queryParams: ['server_ns', 'server_pass'],
        message: 'unrecognized server_ns or server_pass'
      });
      return null;
    }
    const server = Buffer.from(policy.Password, 'utf8');
    const client = Buffer.from(req.query.server_pass, 'utf8');
    if (server.length !== client.length || !timingSafeEqual(server, client)) {
      res.status(400).json({
        type: 'E_SERVER_NS',
        queryParams: ['server_ns', 'server_pass'],
        message: 'unrecognized server_ns or server_pass'
      });
      return null;
    }
    const policyObj = serverPolicyMap[policy.Policy];
    if (policyObj == null) {
      console.warn(`Unrecognized ServerPolicy string: ${policy.Policy}`);
      return serverPolicyMap['NULL_POLICY'];
    }
    return policyObj
  } else if (serverNs == null) {
    const server = Buffer.from(serverConfig.ServerAccessPassword, 'utf8');
    const client = Buffer.from(req.query.server_pass, 'utf8');
    if (server.length !== client.length || !timingSafeEqual(server, client)) {
      res.status(400).json({ type: 'E_AUTH', query_param: 'server_pass', message: 'bad server access password' });
      return null;
    }
    return serverPolicyMap['ROOT_POLICY'];
  } else {
    res.status(400).json({
      type: 'E_SERVER_NS',
      queryParam: 'server_ns',
      message: 'improper/multiple usage of server_ns in query string'
    });
    return null;
  }
}
