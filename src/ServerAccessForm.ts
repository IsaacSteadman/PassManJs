import { getUrlParams } from './StrUtils';

function sanitizeHex(str: string) {
  if (typeof str !== 'string') return false;
  if (str.length & 1) return false;
  for (let i = 0; i < str.length; ++i) {
    const ch = str.charAt(i);
    if (!/[0-9A-Fa-f]/.test(ch)) {
      return false;
    }
  }
  return true;
}

export class ServerAccessForm {
  form: HTMLFormElement;
  password: HTMLInputElement;
  showPassword: HTMLInputElement;
  namespace: HTMLInputElement;
  namespaceStr: string;
  passwordStr: string;
  constructor(form: HTMLFormElement) {
    this.form = form;
    const elems = form.elements;
    this.password = <HTMLInputElement>elems.namedItem('server_pass');
    this.password.addEventListener('change', this);
    this.showPassword = <HTMLInputElement>elems.namedItem('show-server-pass');
    this.showPassword.addEventListener('change', this);
    this.namespace = <HTMLInputElement>elems.namedItem('server_ns');
    this.namespace.addEventListener('change', this);
    const params = new URLSearchParams(window.location.search);
    const server_pass = params.get('server_pass');
    const server_ns = params.get('server_ns');
    if (server_pass != null) {
      this.password.value = server_pass;
    }
    if (server_ns != null) {
      this.namespace.value = server_ns;
    }
    this.passwordStr = this.password.value;
    this.namespaceStr = this.namespace.value;
    this.password.setAttribute(
      'type',
      this.showPassword.checked ? 'text' : 'password'
    );
  }
  handleEvent(e: Event) {
    if (e.currentTarget === this.showPassword) {
      this.password.setAttribute(
        'type',
        this.showPassword.checked ? 'text' : 'password'
      );
    } else if (e.currentTarget === this.password) {
      this.passwordStr = this.password.value;
    } else if (e.currentTarget === this.namespace) {
      this.namespaceStr = this.namespace.value;
    } else if (e.currentTarget === this.form) {
      e.preventDefault();
    }
  }
}
