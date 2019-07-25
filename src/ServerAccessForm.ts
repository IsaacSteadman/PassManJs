import { getUrlParams } from "./StrUtils";

function sanitizeHex(str: string) {
  if (typeof str !== 'string') return false;
  if (str.length & 1) return false;
  for (let i = 0; i < str.length; ++i) {
    const ch = str.charAt(i);
    if (!/[0-9A-Fa-f]/.test(ch)) {
      return false;
    }
  }
  return true
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
    const params = getUrlParams(window.location.href);
    if (params.server_pass != null) {
      this.password.value = params.server_pass;
    }
    if (params.server_ns != null) {
      this.namespace.value = params.server_ns;
    }
    this.passwordStr = this.password.value;
    this.namespaceStr = this.namespace.value;
    this.password.setAttribute('type', this.showPassword.checked ? 'text' : 'password');
  }
  handleEvent(e: Event) {
    if (e.currentTarget === this.showPassword) {
      this.password.setAttribute('type', this.showPassword.checked ? 'text' : 'password');
    } else if (e.currentTarget === this.password) {
      this.passwordStr = this.password.value;
    } else if (e.currentTarget === this.namespace) {
      this.namespaceStr = this.namespace.value;
    } else if (e.currentTarget === this.form) {
      e.preventDefault();
    }
  }
}
