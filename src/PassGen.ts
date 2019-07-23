import { ErrorLog } from "./ErrorLog";

class Charset {
  name: string;
  chars: string;
  constructor(name: string, chars: string) {
    this.name = name;
    this.chars = chars;
  }
}

const allChars = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

const upperAlpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const lowerAlpha = 'abcdefghijklmnopqrstuvwxyz';
const digits = '0123456789';
const symbols = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

function bigIntFromUint8Array(arr: Uint8Array): bigint {
  let rtn = BigInt(0);
  for (let i = 0; i < arr.length; ++i) {
    rtn <<= BigInt(8);
    rtn |= BigInt(arr[i]);
  }
  return rtn;
}

function generatePassword(bitlength: number, symbolsAllowed: string, mustHaveUpper: boolean, mustHaveLower: boolean, mustHaveDigit: boolean, mustHaveSymbol: boolean, hasSpaces: boolean) {
  const allChars = upperAlpha + lowerAlpha + digits + symbolsAllowed + (hasSpaces ? ' ' : '');
  const arr = new Uint8Array(Math.ceil(bitlength / 8));
  crypto.getRandomValues(arr);
  const mask = (BigInt(1) << BigInt(bitlength)) - BigInt(1)
  let n = bigIntFromUint8Array(arr) & mask;
  let rtn = '';
  if (mustHaveUpper) {
    const l = BigInt(upperAlpha.length);
    rtn += upperAlpha.charAt(Number(n % l));
    n /= l;
  }
  if (mustHaveLower) {
    const l = BigInt(lowerAlpha.length);
    rtn += lowerAlpha.charAt(Number(n % l));
    n /= l;
  }
  if (mustHaveDigit) {
    const l = BigInt(digits.length);
    rtn += digits.charAt(Number(n % l));
    n /= l;
  }
  if (mustHaveSymbol) {
    const l = BigInt(symbols.length);
    rtn += symbols.charAt(Number(n % l));
    n /= l;
  }
  const l = BigInt(allChars.length);
  while (n) {
    rtn += allChars.charAt(Number(n % l));
    n /= l;
  }
  return rtn;
}

export class PassGen {
  div: HTMLDivElement;
  errorLog: ErrorLog;
  form: HTMLFormElement;
  bitlength: HTMLInputElement;
  charset: HTMLSelectElement;
  resetCharset: HTMLButtonElement;
  chkUpper: HTMLInputElement;
  chkLower: HTMLInputElement;
  chkDigit: HTMLInputElement;
  chkSymbol: HTMLInputElement;
  passwordOutput: HTMLInputElement;
  btnGenerate: HTMLInputElement;
  charsetInput: HTMLInputElement;
  chkHasSpaces: HTMLInputElement;
  constructor(div: HTMLDivElement, errorLog: ErrorLog) {
    this.div = div;
    this.errorLog = errorLog;
    if (typeof BigInt === 'undefined') {
      div.innerHTML = '<p><span style="color: red; font-weight: bold; font-size: 24px">Your browser is too old.</span><br/>In order to use PassGen, use a browser that supports the new <span style="display:inline;color:darkcyan;font-style: italic;font-family:consolas">BigInt</span> standard.</p>';
      return;
    }
    this.form = div.getElementsByTagName('form')[0];
    this.bitlength = <HTMLInputElement>this.form.children.namedItem('bitlength');
    this.resetCharset = <HTMLButtonElement>this.form.children.namedItem('reset-charset');
    this.charset = <HTMLSelectElement>this.form.children.namedItem('charset');
    this.charsetInput = <HTMLInputElement>this.form.children.namedItem('charset-input');
    this.charsetInput.value = symbols;
    this.chkUpper = <HTMLInputElement>this.form.children.namedItem('chk-upper');
    this.chkLower = <HTMLInputElement>this.form.children.namedItem('chk-lower');
    this.chkDigit = <HTMLInputElement>this.form.children.namedItem('chk-digit');
    this.chkSymbol = <HTMLInputElement>this.form.children.namedItem('chk-symbol');
    this.chkHasSpaces = <HTMLInputElement>this.form.children.namedItem('chk-spaces');
    this.passwordOutput = <HTMLInputElement>this.form.children.namedItem('password');
    this.btnGenerate = <HTMLInputElement>this.form.children.namedItem('generate');
    this.form.addEventListener('submit', this);
    this.resetCharset.addEventListener('click', this);
  }

  handleEvent(evt: UIEvent) {
    if (evt.currentTarget === this.charset) {
    } else if (evt.currentTarget === this.resetCharset) {
      this.charsetInput.value = symbols;
    } else if (evt.currentTarget === this.form) {
      // submit
      evt.preventDefault();
      const bitlength = +this.bitlength.value;
      if (isNaN(bitlength) || bitlength <= 0) {
        this.errorLog.logError({
          type: 'E_BAD_BITLEN',
          message: 'expected number greater than 0'
        });
        return;
      }
      const symbolsAllowed = this.charsetInput.value;
      const stCheck = new Set(upperAlpha + lowerAlpha + digits);
      const unexpectedChars = new Set();
      for (let i = 0; i < symbolsAllowed.length; ++i) {
        const ch = symbolsAllowed.charAt(i);
        if (stCheck.has(ch)) {
          unexpectedChars.add(ch);
        }
      }
      if (unexpectedChars.size) {
        this.errorLog.logError({
          type: 'E_BAD_CHARSET',
          message: 'character specified more than once',
          characters: new Array(...unexpectedChars.keys())
        });
        return;
      }
      this.passwordOutput.value = generatePassword(
        bitlength, symbolsAllowed,
        this.chkUpper.checked,
        this.chkLower.checked,
        this.chkDigit.checked,
        this.chkSymbol.checked,
        this.chkHasSpaces.checked
      );
    }
  }
}
