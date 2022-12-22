import { ServerAccessForm } from './ServerAccessForm';
import {
  stringToArrayBuffer,
  arrayBufferToHexString,
  hexStringToUint8Array,
} from './StrUtils';
import { ContentArea } from './ContentArea';
import { encryptAes256CBC, decryptAes256CBC, subtle } from './CryptoUtils';
import { ErrorLog } from './ErrorLog';
import { ActionResult } from './types';

export class LoginForm {
  form: HTMLFormElement;
  username: HTMLInputElement;
  password: HTMLInputElement;
  showPassword: HTMLInputElement;
  serverAccess: ServerAccessForm;
  encKey: null | CryptoKey;
  div: HTMLDivElement;
  contentArea: ContentArea;
  authKey: null | string;
  errorLog: ErrorLog;
  lastModified: string | null;
  constructor(
    div: HTMLDivElement,
    serverAccess: ServerAccessForm,
    contentArea: ContentArea,
    errorLog: ErrorLog
  ) {
    this.contentArea = contentArea;
    contentArea.onPreLogout = (buf) => {
      return this.encryptAndSend(buf);
    };
    contentArea.onPostLogout = () => {
      this.encKey = null;
      this.authKey = null;
      this.username.value = '';
      this.password.value = '';
      this.div.style.display = '';
      this.contentArea.div.style.display = 'none';
    };
    this.div = div;
    this.form = div.getElementsByTagName('form')[0];
    const elems = this.form.elements;
    this.username = <HTMLInputElement>elems.namedItem('username');
    this.password = <HTMLInputElement>elems.namedItem('password');
    this.showPassword = <HTMLInputElement>elems.namedItem('show-password');
    this.showPassword.addEventListener('change', this);
    this.form.addEventListener('submit', this);
    this.serverAccess = serverAccess;
    this.encKey = null;
    this.authKey = null;
    this.lastModified = null;
    this.errorLog = errorLog;
    this.password.setAttribute(
      'type',
      this.showPassword.checked ? 'text' : 'password'
    );
  }
  async encryptAndSend(buf: ArrayBuffer): Promise<ActionResult> {
    if (this.encKey == null || this.authKey == null) {
      throw new Error('expected non-null keys');
    }
    const outBuf = await encryptAes256CBC(this.encKey, buf);
    const json = {
      data: '00000000' + arrayBufferToHexString(outBuf),
    };
    const sPass = this.serverAccess.passwordStr;
    const sNamespace = this.serverAccess.namespaceStr;
    const user = this.username.value;
    const pass = this.authKey;
    const uri = sNamespace.length
      ? `pass-table?server_ns=${encodeURIComponent(
          sNamespace
        )}&server_pass=${encodeURIComponent(
          sPass
        )}&username=${encodeURIComponent(user)}&password=${encodeURIComponent(
          pass
        )}`
      : `pass-table?server_pass=${encodeURIComponent(
          sPass
        )}&username=${encodeURIComponent(user)}&password=${encodeURIComponent(
          pass
        )}`;
    const res = await fetch(uri, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.lastModified != null
          ? { 'If-Unmodified-Since': this.lastModified }
          : {}),
      },
      body: JSON.stringify(json),
    });

    try {
      if (res.ok) {
        this.lastModified = res.headers.get('last-modified');
        if (this.lastModified == null) {
          this.errorLog.logError({
            type: 'WARN',
            message: 'last-modified header was not present',
            guidance: 'be careful having multiple logged in instances',
          });
        }
        return { ok: true, json: await res.json() };
      } else {
        return {
          ok: false,
          errorNumber: this.errorLog.logError(await res.json()),
        };
      }
    } catch (err) {
      return {
        ok: false,
        errorNumber: this.errorLog.logError(err),
      };
    }
  }
  handleEvent(e: Event) {
    if (e.currentTarget === this.showPassword) {
      this.password.setAttribute(
        'type',
        this.showPassword.checked ? 'text' : 'password'
      );
    } else if (e.currentTarget === this.form) {
      e.preventDefault();
      this.loginAttempt();
    }
  }
  async loginAttempt() {
    try {
      const password = stringToArrayBuffer(this.password.value);

      const passwordKeyPromise = subtle.importKey(
        'raw',
        password,
        { name: 'PBKDF2' },
        false,
        ['deriveKey', 'deriveBits']
      );
      const fetchDataPromise: Promise<{
        data: ReturnType<typeof hexStringToUint8Array>['buffer'];
        lastModified: string | null;
      }> = (async () => {
        const key = await passwordKeyPromise;
        const authKey = await subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt: new Uint8Array([1, 2, 3, 4]),
            hash: 'SHA-256',
            iterations: 100000,
          },
          key,
          256
        );
        const sPass = this.serverAccess.passwordStr;
        const sNamespace = this.serverAccess.namespaceStr;
        const user = this.username.value;
        const pass = arrayBufferToHexString(authKey);
        this.authKey = pass;
        const uri = sNamespace.length
          ? `pass-table?server_ns=${encodeURIComponent(
              sNamespace
            )}&server_pass=${encodeURIComponent(
              sPass
            )}&username=${encodeURIComponent(
              user
            )}&password=${encodeURIComponent(pass)}`
          : `pass-table?server_pass=${encodeURIComponent(
              sPass
            )}&username=${encodeURIComponent(
              user
            )}&password=${encodeURIComponent(pass)}`;
        const res = await fetch(uri, {
          headers: {
            Accept: 'application/json',
          },
        });
        if (!res.ok) {
          return Promise.reject(res.json());
        }
        const contentType = res.headers.get('content-type')?.split(';')?.[0];
        if (contentType === 'application/json') {
          const { data } = await res.json();
          return {
            data: hexStringToUint8Array(data).buffer,
            lastModified: res.headers.get('last-modified'),
          };
        } else if (contentType === 'application/octet-stream') {
          const data = await res.arrayBuffer();
          return { data, lastModified: res.headers.get('last-modified') };
        }
        return Promise.reject(
          `unrecognized content-type: ${JSON.stringify(
            contentType
          )}, body = ${await res.text()}`
        );
      })();
      const [{ data, lastModified }, encryptionKey] = await Promise.all([
        fetchDataPromise,
        (async () => {
          const key = await passwordKeyPromise;
          return subtle.deriveKey(
            {
              name: 'PBKDF2',
              salt: stringToArrayBuffer(this.username.value),
              hash: 'SHA-256',
              iterations: 100000,
            },
            key,
            {
              name: 'AES-CBC',
              length: 256,
            },
            false,
            ['encrypt', 'decrypt']
          );
        })(),
      ]);

      const version = new DataView(data).getUint32(0, true);
      if (version !== 0) {
        throw {
          type: 'E_CLIENT_ENCRYPTION_UNSUPPORTED',
          message: `client does not support version ${version}`,
        };
      }
      const plainText = await decryptAes256CBC(encryptionKey, data.slice(4));
      this.contentArea.loadTableBuf(plainText);
      this.div.style.display = 'none';
      this.contentArea.div.style.display = '';
      this.encKey = encryptionKey;
      this.lastModified = lastModified;
      if (this.lastModified == null) {
        this.errorLog.logError({
          type: 'WARN',
          message: 'last-modified header was not present',
          guidance: 'be careful having multiple logged in instances',
        });
      }
    } catch (err) {
      this.authKey = null;
      this.errorLog.logError(err);
    }
  }
}
