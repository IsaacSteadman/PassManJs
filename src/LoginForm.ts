import { ServerAccessForm } from "./ServerAccessForm";
import { stringToArrayBuffer, arrayBufferToHexString, hexStringToArrayBuffer } from "./StrUtils";
import { ContentArea } from "./ContentArea";
import { encryptAes256CBC, decryptAes256CBC } from "./CryptoUtils";
import { ErrorLog } from "./ErrorLog";

export class LoginForm {
  form: HTMLFormElement;
  username: HTMLInputElement;
  password: HTMLInputElement;
  showPassword: HTMLInputElement;
  serverAccess: ServerAccessForm;
  encKey: CryptoKey;
  div: HTMLDivElement;
  contentArea: ContentArea;
  authKey: string;
  errorLog: ErrorLog;
  constructor(div: HTMLDivElement, serverAccess: ServerAccessForm, contentArea: ContentArea, errorLog: ErrorLog) {
    this.contentArea = contentArea;
    contentArea.onPreLogout = buf => {
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
    this.errorLog = errorLog;
    this.password.setAttribute('type', this.showPassword.checked ? 'text' : 'password');
  }
  async encryptAndSend(buf: ArrayBuffer) {
    const outBuf = await encryptAes256CBC(this.encKey, buf);
    const json = {
      data: '00000000' + arrayBufferToHexString(outBuf)
    };
    const sPass = this.serverAccess.passwordStr;
    const user = this.username.value;
    const pass = this.authKey;
    return fetch(
      `pass-table?server_pass=${encodeURIComponent(sPass)}&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(json)
      }
    ).then(res => {
      return res.json().then(json => {
        if (res.ok) return json;
        else return Promise.reject(json);
      });
    }).catch(err => {
      this.errorLog.logError(err);
    });
  }
  handleEvent(e: Event) {
    if (e.currentTarget === this.showPassword) {
      this.password.setAttribute('type', this.showPassword.checked ? 'text' : 'password');
    } else if (e.currentTarget === this.form) {
      e.preventDefault();
      const password = stringToArrayBuffer(this.password.value);
      const passwordKeyPromise = crypto.subtle.importKey(
        'raw',
        password,
        { name: 'PBKDF2', length: null },
        false,
        ['deriveKey', 'deriveBits']
      );
      const encryptionKeyPromise = passwordKeyPromise.then(key => {
        return crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: stringToArrayBuffer(this.username.value),
            hash: 'SHA-256',
            iterations: 100000
          },
          key,
          {
            name: 'AES-CBC',
            length: 256
          },
          true,
          ['encrypt', 'decrypt']
        );
      });
      const authenticationKeyPromise = <Promise<ArrayBuffer>>passwordKeyPromise.then(key => {
        return crypto.subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt: new Uint8Array([1, 2, 3, 4]),
            hash: 'SHA-256',
            iterations: 100000
          },
          key,
          256
        )
      });
      const fetchDataPromise = authenticationKeyPromise.then(buf => {
        const sPass = this.serverAccess.passwordStr;
        const user = this.username.value;
        const pass = arrayBufferToHexString(buf);
        this.authKey = pass;
        return fetch(
          `pass-table?server_pass=${encodeURIComponent(sPass)}&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );
      })
        .then(res => {
          return res.json().then(json => {
            if (res.ok) return json;
            else return Promise.reject(json);
          });
        })
        .then(function (json: { data: string }) { return json.data; });
      Promise.all([encryptionKeyPromise, fetchDataPromise]).then(x => {
        const [encKey, data] = x;
        this.encKey = encKey;
        const cipherTextBuf = hexStringToArrayBuffer(data);
        const ver = (new DataView(cipherTextBuf)).getUint32(0, true);
        if (ver !== 0) {
          return Promise.reject({type: 'E_CLIENT_ENCRYPTION_UNSUPPORTED', message: `client does not support version ${ver}`})
        }
        return decryptAes256CBC(encKey, cipherTextBuf.slice(4));
      }).then(buf => {
        this.contentArea.loadTableBuf(buf);
        this.div.style.display = 'none';
        this.contentArea.div.style.display = '';
      }).catch(err => {
        this.errorLog.logError(err);
      });
    }
  }
}