import { serverConfig } from "./consts";
import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { resolve } from 'path';
import { readFile, writeFile, watchFile } from 'fs';
import { writeFilePromise, readFilePromise } from "./routes/helpers";

const policies = {};

const policyPath = resolve(__dirname, '../policies.json');

async function loadPolicies() {
  const str = await readFilePromise(policyPath, 'utf8');
  const data = JSON.parse(str);
  if (data instanceof Array) throw new TypeError('expected object (got array) for file "policies.json"');
  if (typeof data !== 'object') throw new TypeError(`expected object (got ${typeof data}) for file "policies.json"`);
  for (const k in policies) {
    if (data[k] == null) {
      delete policies[k];
    }
  }
  Object.assign(policies, data);
}

loadPolicies().catch(async function (err) {
  if (err.code === 'ENOENT') {
    console.log('no policies.json found, creating a new one');
    await writeFilePromise(policyPath, '{}', 'utf8');
  } else {
    return Promise.reject(err);
  }
}).then(x => {
  watchFile(policyPath, async function (curr, prev) {
    console.log('reloading policies');
    try {
      await loadPolicies();
      console.log('successfully reloaded policies');
    } catch (exc) {
      console.error('error reloading policies');
      console.error(exc);
    }
  });
});

export class ServerPolicy {
  policyData: { [key: string]: any };
  policyName: string;
  constructor(policyData: { [key: string]: any }, policyName: string) {
    this.policyData = policyData;
    this.policyName = policyName;
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
  async save(): Promise<void> {
    if (this.policyName != null) {
      if (policies[this.policyName] !== this.policyData) {
        throw new TypeError('expected to be same object (for thread safety reasons)')
      }
      const data = JSON.stringify(policies);
      await writeFilePromise(policyPath, data, 'utf8');
    }
  }
}

class LimitedPolicy extends ServerPolicy {
  readAccountHook(username: string, data: Buffer): boolean {
    return true;
  }
  createAccountHook(username: string, data: Buffer): boolean {
    const n = this.policyData.NumAccounts + 1;
    if (n > this.policyData.MaxAccounts) {
      return false;
    }
    if (this.policyData.MaxDataSize != null && data.length > this.policyData.MaxDataSize) {
      return false;
    }
    return true;
  }
  updateAccountHook(username: string, data: Buffer): boolean {
    if (this.policyData.MaxDataSize != null && data.length > this.policyData.MaxDataSize) {
      return false;
    }
    return true;
  }
  updatePasswordHook(username: string, data: Buffer): boolean {
    if (this.policyData.MaxDataSize != null && data.length > this.policyData.MaxDataSize) {
      return false;
    }
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
  'ROOT_POLICY': ServerPolicy,
  'NULL_POLICY': NullPolicy,
  'LIMITED_POLICY': LimitedPolicy
};

export function serverPolicyAuth(req: Request, res: Response): ServerPolicy | null {
  const serverNs = req.query.server_ns
  if (serverNs != null && typeof serverNs === 'string') {
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
    const policyClass = serverPolicyMap[policy.PolicyType];
    if (policyClass == null) {
      console.warn(`Unrecognized PolicyType string: ${policy.PolicyType}`);
      return new serverPolicyMap['NULL_POLICY'](null, null);
    }
    return new policyClass(policy, serverNs);
  } else if (serverNs == null) {
    const server = Buffer.from(serverConfig.ServerAccessPassword, 'utf8');
    const client = Buffer.from(req.query.server_pass, 'utf8');
    if (server.length !== client.length || !timingSafeEqual(server, client)) {
      res.status(400).json({ type: 'E_AUTH', query_param: 'server_pass', message: 'bad server access password' });
      return null;
    }
    return new serverPolicyMap['ROOT_POLICY'](null, null);
  } else {
    res.status(400).json({
      type: 'E_SERVER_NS',
      queryParam: 'server_ns',
      message: 'improper/multiple usage of server_ns in query string'
    });
    return null;
  }
}
