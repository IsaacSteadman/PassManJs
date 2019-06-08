import { ServerAccessForm } from "./ServerAccessForm";
import { stringToArrayBuffer, arrayBufferToHexString, hexStringToArrayBuffer } from "./StrUtils";
import { ContentArea } from "./ContentArea";
import { encryptAes256CBC, decryptAes256CBC } from "./CryptoUtils";

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
  constructor(div: HTMLDivElement, serverAccess: ServerAccessForm, contentArea: ContentArea) {
    this.contentArea = contentArea;
    contentArea.onPreLogout = buf => {
      return this.encryptAndSend(buf);
    };
    contentArea.onPostLogout = () => {
      this.encKey = null;
      this.authKey = null;
      this.username.value = '';
      this.password.value = '';
    };
    this.div = div;
    this.form = div.getElementsByTagName('form')[0];
    const elems = this.form.elements;
    this.username = <HTMLInputElement>elems.namedItem('username');
    this.password = <HTMLInputElement>elems.namedItem('password');
    this.showPassword = <HTMLInputElement>elems.namedItem('show-password');
    this.showPassword.addEventListener('change', this);
    this.serverAccess = serverAccess;
    this.encKey = null;
    this.authKey = null;
  }
  async encryptAndSend(buf: ArrayBuffer) {
    const outBuf = await encryptAes256CBC(this.encKey, buf);
    const json = {
      data: arrayBufferToHexString(outBuf)
    };
    const sPass = this.serverAccess.passwordStr;
    const user = this.username.value;
    const pass = this.authKey;
    return fetch(`pass-table?server_pass=${sPass}&username=${user}&password=${pass}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(json)
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
            iterations: 5000
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
            iterations: 5000
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
        return fetch(`pass-table?server_pass=${sPass}&username=${user}&password=${pass}` {
          headers: {
            'Accept': 'application/json'
          }
        });
      })
        .then(res => res.json())
        .then(function (json: { data: string }) { return json.data; });
      Promise.all([encryptionKeyPromise, fetchDataPromise]).then(x => {
        const [encKey, data] = x;
        this.encKey = encKey;
        return decryptAes256CBC(encKey, hexStringToArrayBuffer(data));
      }).then(buf => {
        this.contentArea.loadTableBuf(buf);
      });
    }
  }
}