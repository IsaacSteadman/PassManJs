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
  passwordStr: string;
  constructor(form: HTMLFormElement) {
    this.form = form;
    const elems = form.elements;
    this.password = <HTMLInputElement>elems.namedItem('server_pass');
    this.showPassword = <HTMLInputElement>elems.namedItem('show-server-pass');
    this.showPassword.addEventListener('change', this);
    this.passwordStr = '';
  }
  handleEvent(e: Event) {
    if (e.currentTarget === this.showPassword) {
      this.password.setAttribute('type', this.showPassword.checked ? 'text' : 'password');
    } else if (e.currentTarget === this.form) {
      e.preventDefault();
      if (!sanitizeHex(this.password.value)) {
        alert('server access password must be hexadecimal');
        return;
      }
      this.passwordStr = this.password.value;
    }
  }
}