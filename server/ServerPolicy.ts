import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { watchFile } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { serverConfig } from './consts';
import { fileLock } from './utils';

type PolicyConfig =
  | { PolicyType: 'ROOT_POLICY'; Password: string }
  | { PolicyType: 'NULL_POLICY'; Password: string }
  | {
      PolicyType: 'LIMITED_POLICY';
      Password: string;
      MaxAccounts: number;
      NumAccounts: number;
      MaxDataSize: number;
    };

const policies: Record<string, PolicyConfig> = {};

const policyPath = resolve(__dirname, '../policies.json');

async function loadPolicies() {
  const str = await (async () => {
    await fileLock.acquire(policyPath, 'shared');
    try {
      return await readFile(policyPath, 'utf8');
    } finally {
      fileLock.release(policyPath, 'shared');
    }
  })();
  const data = JSON.parse(str);
  if (data instanceof Array)
    throw new TypeError('expected object (got array) for file "policies.json"');
  if (typeof data !== 'object')
    throw new TypeError(
      `expected object (got ${typeof data}) for file "policies.json"`
    );
  for (const k in policies) {
    if (data[k] == null) {
      delete policies[k];
    }
  }
  Object.assign(policies, data);
}

loadPolicies()
  .catch(async (err) => {
    if (err.code === 'ENOENT') {
      console.log('no policies.json found, creating a new one');
      await fileLock.acquire(policyPath, 'exclusive');
      try {
        await writeFile(policyPath, '{}', 'utf8');
      } finally {
        fileLock.release(policyPath, 'exclusive');
      }
    } else {
      return Promise.reject(err);
    }
  })
  .then(() => {
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

export abstract class ServerPolicy {
  constructor(
    public policyData?: null | { [key: string]: any },
    public policyName?: null | string
  ) {
    this.policyData = policyData;
    this.policyName = policyName;
  }
  abstract readAccountHook(username: string, data: Buffer): Promise<boolean>;
  abstract createAccountHook(username: string, data: Buffer): Promise<boolean>;
  abstract updateAccountHook(username: string, data: Buffer): Promise<boolean>;
  abstract updatePasswordHook(username: string, data: Buffer): Promise<boolean>;
  protected async save(): Promise<void> {
    if (this.policyName != null) {
      if (policies[this.policyName] !== this.policyData) {
        throw new TypeError(
          'expected to be same object (for thread safety reasons)'
        );
      }
      let n = serverConfig.PrettyPoliciesJson;
      if (n == null) {
      } else if (typeof n !== 'number') {
        console.log('expected a number for serverConfig.PrettyPoliciesJson');
        n = null;
      } else if (n < 0) {
        console.log('expected number >= 0 for serverConfig.PrettyPoliciesJson');
        n = null;
      } else if ((n | 0) !== n) {
        console.log(
          'expected positive integer for serverConfig.PrettyPoliciesJson'
        );
        n = null;
      } else if (n > 24) {
        console.log(
          'expected positive integer <= 24 for serverConfig.PrettyPoliciesJson'
        );
        n = null;
      }
      const data = JSON.stringify(policies, null, n);
      await fileLock.acquire(policyPath, 'exclusive');
      try {
        await writeFile(policyPath, data, 'utf8');
      } finally {
        fileLock.release(policyPath, 'exclusive');
      }
    }
  }
}

class LimitedPolicy extends ServerPolicy {
  constructor(
    public policyData: { [key: string]: any },
    public policyName: string
  ) {
    super(policyData, policyName);
  }
  async readAccountHook(username: string, data: Buffer): Promise<boolean> {
    return true;
  }
  async createAccountHook(username: string, data: Buffer): Promise<boolean> {
    const n = this.policyData.NumAccounts + 1;
    if (n > this.policyData.MaxAccounts) {
      return false;
    }
    if (
      this.policyData.MaxDataSize != null &&
      data.length > this.policyData.MaxDataSize
    ) {
      return false;
    }
    this.policyData.NumAccounts = n;
    await this.save();
    return true;
  }
  async updateAccountHook(username: string, data: Buffer): Promise<boolean> {
    if (
      this.policyData.MaxDataSize != null &&
      data.length > this.policyData.MaxDataSize
    ) {
      return false;
    }
    return true;
  }
  async updatePasswordHook(username: string, data: Buffer): Promise<boolean> {
    if (
      this.policyData.MaxDataSize != null &&
      data.length > this.policyData.MaxDataSize
    ) {
      return false;
    }
    return true;
  }
}

export class NullPolicy extends ServerPolicy {
  async readAccountHook(username: string, data: Buffer): Promise<boolean> {
    return false;
  }
  async createAccountHook(username: string, data: Buffer): Promise<boolean> {
    return false;
  }
  async updateAccountHook(username: string, data: Buffer): Promise<boolean> {
    return false;
  }
  async updatePasswordHook(username: string, data: Buffer): Promise<boolean> {
    return false;
  }
}

export class RootPolicy extends ServerPolicy {
  async readAccountHook(username: string, data: Buffer): Promise<boolean> {
    return true;
  }
  async createAccountHook(username: string, data: Buffer): Promise<boolean> {
    return true;
  }
  async updateAccountHook(username: string, data: Buffer): Promise<boolean> {
    return true;
  }
  async updatePasswordHook(username: string, data: Buffer): Promise<boolean> {
    return true;
  }
}

export const serverPolicyMap: Record<
  PolicyConfig['PolicyType'],
  new (policyData: { [key: string]: any }, policyName: string) => ServerPolicy
> = {
  ROOT_POLICY: RootPolicy,
  NULL_POLICY: NullPolicy,
  LIMITED_POLICY: LimitedPolicy,
};

export function serverPolicyAuthThrow(req: Request): ServerPolicy {
  const serverNs = req.query.server_ns;
  const serverPass = req.query.server_pass;
  if (typeof serverPass !== 'string') {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_SERVER_PASS',
        queryParam: 'server_pass',
        message:
          'improper/multiple/missing usage of server_pass in query string',
      },
    };
  }
  if (serverNs != null) {
    if (typeof serverNs !== 'string') {
      throw {
        type: 'json-response',
        jsonStatus: 400,
        jsonBody: {
          type: 'E_SERVER_NS',
          queryParam: 'server_ns',
          message: 'improper/multiple usage of server_ns in query string',
        },
      };
    }
    const policy = policies[serverNs];
    if (policy == null) {
      throw {
        type: 'json-response',
        jsonStatus: 400,
        jsonBody: {
          type: 'E_SERVER_NS',
          queryParams: ['server_ns', 'server_pass'],
          message: 'unrecognized server_ns or server_pass',
        },
      };
    }
    const server = Buffer.from(policy.Password, 'utf8');

    const client = Buffer.from(serverPass, 'utf8');
    if (server.length !== client.length || !timingSafeEqual(server, client)) {
      throw {
        type: 'json-response',
        jsonStatus: 400,
        jsonBody: {
          type: 'E_SERVER_NS',
          queryParams: ['server_ns', 'server_pass'],
          message: 'unrecognized server_ns or server_pass',
        },
      };
    }
    const policyClass = serverPolicyMap[policy.PolicyType];
    if (policyClass == null) {
      console.warn(`Unrecognized PolicyType string: ${policy.PolicyType}`);
      return new NullPolicy(null, null);
    }
    return new policyClass(policy, serverNs);
  }
  const server = Buffer.from(serverConfig.ServerAccessPassword, 'utf8');
  const client = Buffer.from(<string>req.query.server_pass, 'utf8');
  if (server.length !== client.length || !timingSafeEqual(server, client)) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_AUTH',
        query_param: 'server_pass',
        message: 'bad server access password',
      },
    };
  }
  return new RootPolicy(null, null);
}
