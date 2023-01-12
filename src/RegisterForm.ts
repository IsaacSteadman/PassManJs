import { ServerAccessForm } from './ServerAccessForm';
import {
  stringToArrayBuffer,
  arrayBufferToHexString,
  concatBuffers,
} from './StrUtils';
import { encryptAes256CBC, subtle } from './CryptoUtils';
import { ErrorLog } from './ErrorLog';
import { sanitizeUsername } from '../server/client-common/sanitizeUsername';

const defaultJson = [
  {
    title: 'Passwords',
    spec: [
      { name: 'Site Name', type: 'text' },
      { name: 'Site Link', type: 'link' },
      { name: 'Username', type: 'text' },
      { name: 'Password', type: 'password' },
    ],
    data: [],
  },
  {
    title: 'Credit Cards',
    spec: [
      { name: 'Name', type: 'text' },
      { name: 'Expiry Date', type: 'text' },
      { name: 'Billing Address', type: 'text' },
      { name: 'Number', type: 'password' },
      { name: 'Securty Code', type: 'password' },
    ],
    data: [],
  },
];

export class RegisterForm {
  div: HTMLDivElement;
  form: HTMLFormElement;
  serverAccess: ServerAccessForm;
  username: HTMLInputElement;
  password: HTMLInputElement;
  showPassword: HTMLInputElement;
  confirmPassword: HTMLInputElement;
  errorLog: ErrorLog;
  usernameValidityMessage: HTMLDivElement;
  constructor(
    div: HTMLDivElement,
    serverAccess: ServerAccessForm,
    errorLog: ErrorLog
  ) {
    this.div = div;
    this.form = div.getElementsByTagName('form')[0];
    const elems = this.form.elements;
    this.username = elems.namedItem('username') as HTMLInputElement;
    this.usernameValidityMessage = this.form.getElementsByClassName(
      'username-validity-message'
    )[0] as HTMLDivElement;
    this.password = elems.namedItem('new_pass') as HTMLInputElement;
    this.confirmPassword = elems.namedItem(
      'confirm_new_pass'
    ) as HTMLInputElement;
    this.showPassword = elems.namedItem('show-new-pass') as HTMLInputElement;
    this.showPassword.addEventListener('change', this);
    this.serverAccess = serverAccess;
    this.form.addEventListener('submit', this);
    this.errorLog = errorLog;
    const type = this.showPassword.checked ? 'text' : 'password';
    this.password.setAttribute('type', type);
    this.confirmPassword.setAttribute('type', type);
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
      const usernameValid = sanitizeUsername(this.username.value);
      if (!usernameValid) {
        this.usernameValidityMessage.style.display = '';
        return;
      }
      this.usernameValidityMessage.style.display = 'none';
      const password = stringToArrayBuffer(this.password.value);
      const passwordKeyPromise = Promise.resolve(
        subtle.importKey('raw', password, { name: 'PBKDF2' }, false, [
          'deriveKey',
          'deriveBits',
        ])
      ).catch((err) => {
        console.log('passwordKeyPromise', err);
        return Promise.reject(err);
      });
      const encryptionKeyPromise = passwordKeyPromise
        .then((key) => {
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
            true,
            ['encrypt', 'decrypt']
          );
        })
        .catch((err) => {
          console.log('encryptionKeyPromise', err);
          return Promise.reject(err);
        });
      const authenticationKeyPromise = passwordKeyPromise
        .then((key) => {
          return subtle.deriveBits(
            {
              name: 'PBKDF2',
              salt: new Uint8Array([1, 2, 3, 4]),
              hash: 'SHA-256',
              iterations: 100000,
            },
            key,
            256
          );
        })
        .catch((err) => {
          console.log('authenticationKeyPromise', err);
          return Promise.reject(err);
        });
      const fetchDataPromise = Promise.all([
        authenticationKeyPromise,
        encryptionKeyPromise,
      ])
        .then((x) => {
          const [authKeyBuf, encKey] = x;
          const sPass = this.serverAccess.passwordStr;
          const sNamespace = this.serverAccess.namespaceStr;
          const user = this.username.value;
          const pass = arrayBufferToHexString(authKeyBuf);
          const header = new ArrayBuffer(4);
          const uri = sNamespace.length
            ? `pass-table?server_ns=${encodeURIComponent(
                sNamespace
              )}&server_pass=${encodeURIComponent(
                sPass
              )}&username=${encodeURIComponent(
                user
              )}&new_pass=${encodeURIComponent(pass)}`
            : `pass-table?server_pass=${encodeURIComponent(
                sPass
              )}&username=${encodeURIComponent(
                user
              )}&new_pass=${encodeURIComponent(pass)}`;
          new DataView(header).setUint32(0, 0x80000000, true);
          return encryptAes256CBC(
            encKey,
            concatBuffers(
              header,
              stringToArrayBuffer(JSON.stringify(defaultJson))
            )
          ).then(
            (encBuf) => {
              return fetch(uri, {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: '00000000' + arrayBufferToHexString(encBuf),
                }),
              })
                .catch((err) => {
                  console.log('immediate fetch error');
                  return Promise.reject(err);
                })
                .then((res) => {
                  return res.json().then((json) => {
                    if (res.ok) return json;
                    else return Promise.reject(json);
                  });
                });
            },
            (err) => {
              console.log('encryptAes256CBC error', err);
              return Promise.reject(err);
            }
          );
        })
        .then((x) => {
          alert('account created successfully');
        })
        .catch((err) => {
          console.log('fetchDataPromise', err);
          this.errorLog.logError(err);
        });
    }
  }
}
