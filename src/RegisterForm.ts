import { ServerAccessForm } from "./ServerAccessForm";
import { stringToArrayBuffer, arrayBufferToHexString, concatBuffers } from "./StrUtils";
import { encryptAes256CBC } from "./CryptoUtils";

function sanitizeUsername(name: string) {
  if (typeof name !== 'string') return false;
  if (name === '.') return false;
  if (name === '..') return false;
  for (let i = 0; i < name.length; ++i) {
    const ch = name.charAt(i);
    if (!/[A-Za-z0-9_\.$-]/.test(ch)) {
      return false;
    }
  }
  return true;
};

export class RegisterForm {
  div: HTMLDivElement;
  form: HTMLFormElement;
  serverAccess: ServerAccessForm;
  username: HTMLInputElement;
  password: HTMLInputElement;
  showPassword: HTMLInputElement;
  confirmPassword: HTMLInputElement;
  constructor(div: HTMLDivElement, serverAccess: ServerAccessForm) {
    this.div = div;
    this.form = div.getElementsByTagName('form')[0];
    const elems = this.form.elements;
    this.username = <HTMLInputElement>elems.namedItem('username');
    this.password = <HTMLInputElement>elems.namedItem('new_pass');
    this.confirmPassword = <HTMLInputElement>elems.namedItem('confirm_new_pass');
    this.showPassword = <HTMLInputElement>elems.namedItem('show-new-pass');
    this.showPassword.addEventListener('change', this);
    this.serverAccess = serverAccess;
    this.form.addEventListener('submit', this);
  }
  handleEvent(e: Event) {
    if (e.currentTarget === this.showPassword) {
      const type = this.showPassword.checked ? 'text' : 'password';
      this.password.setAttribute('type', type);
      this.confirmPassword.setAttribute('type', type);
    } else if (e.currentTarget === this.form) {
      e.preventDefault();
      if (this.password.value !== this.confirmPassword.value) {
        alert('password and confirm password must match');
        return;
      }
      if (!sanitizeUsername(this.username.value)) {
        alert('username is not valid (must contain ony letters, numbers, "_", ".", "$", or "-"');
        return;
      }
      const password = stringToArrayBuffer(this.password.value);
      const passwordKeyPromise = Promise.resolve(crypto.subtle.importKey(
        'raw',
        password,
        { name: 'PBKDF2', length: null },
        false,
        ['deriveKey', 'deriveBits']
      )).catch(err => {
        console.log('passwordKeyPromise', err)
        return Promise.reject(err);
      });
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
      }).catch(err => {
        console.log('encryptionKeyPromise', err)
        return Promise.reject(err);
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
        );
      }).catch(err => {
        console.log('authenticationKeyPromise', err)
        return Promise.reject(err);
      });
      const fetchDataPromise = Promise.all([authenticationKeyPromise, encryptionKeyPromise]).then(x => {
        const [authKeyBuf, encKey] = x;
        const sPass = this.serverAccess.passwordStr;
        const user = this.username.value;
        const pass = arrayBufferToHexString(authKeyBuf);
        const header = new ArrayBuffer(4);
        (new DataView(header)).setUint32(0, 0x80000000, true);
        return encryptAes256CBC(encKey, concatBuffers(header, stringToArrayBuffer('[]')))
          .then(
            encBuf => {
              return fetch(
                `pass-table?server_pass=${sPass}&username=${user}&new_pass=${pass}`,
                {
                  method: 'POST',
                  headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({data: arrayBufferToHexString(encBuf)})
                }
              ).catch(err => {
                console.log('immediate fetch error');
                return Promise.reject(err);
              });
            },
            err => {
              console.log('encryptAes256CBC error', err);
              return Promise.reject(err);
            }
          );
      }).then(x => {
        if (x.status >= 200 && x.status < 300) {
          alert('account created successfully');
        } else {
          x.json().then(console.log);
        }
      }).catch(err => {
        console.log('fetchDataPromise', err)
        return Promise.reject(err);
      });
    }
  }
}