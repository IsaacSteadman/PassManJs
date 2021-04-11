import { ErrorLog } from "./ErrorLog";
import { createIcon } from "./icons";
import { ContentArea } from "./ContentArea";

const upperAlpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const lowerAlpha = 'abcdefghijklmnopqrstuvwxyz';
const alphaOptions = {
  'only-upper': upperAlpha,
  'only-lower': lowerAlpha,
  'all': upperAlpha + lowerAlpha,
};

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

function generatePassword(bitlength: number, symbolsAllowed: string, mustHaveUpper: boolean, mustHaveLower: boolean, mustHaveDigit: boolean, mustHaveSymbol: boolean, hasSpaces: boolean, remainingLettersAllowed: keyof typeof alphaOptions) {
  const allChars = alphaOptions[remainingLettersAllowed] + digits + symbolsAllowed + (hasSpaces ? ' ' : '');
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
    const l = BigInt(symbolsAllowed.length);
    rtn += symbolsAllowed.charAt(Number(n % l));
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
  symbolCharset: HTMLInputElement;
  chkHasSpaces: HTMLInputElement;
  contentArea: ContentArea;
  selectAddTable: HTMLSelectElement;
  addButton: SVGSVGElement;
  selLettersAllowed: HTMLSelectElement;
  constructor(div: HTMLDivElement, contentArea: ContentArea, errorLog: ErrorLog) {
    this.div = div;
    this.errorLog = errorLog;
    if (typeof BigInt === 'undefined') {
      div.innerHTML = '<p><span style="color: red; font-weight: bold; font-size: 24px">Your browser is too old.</span><br/>In order to use PassGen, use a browser that supports the new <span style="display:inline;color:darkcyan;font-style: italic;font-family:consolas">BigInt</span> standard.</p>';
      return;
    }
    this.form = div.getElementsByTagName('form')[0];
    this.bitlength = <HTMLInputElement>this.form.children.namedItem('bitlength');
    this.resetCharset = <HTMLButtonElement>this.form.children.namedItem('reset-charset');
    this.symbolCharset = <HTMLInputElement>this.form.children.namedItem('symbol-charset');
    this.symbolCharset.value = symbols;
    this.chkUpper = <HTMLInputElement>this.form.children.namedItem('chk-upper');
    this.chkLower = <HTMLInputElement>this.form.children.namedItem('chk-lower');
    this.chkDigit = <HTMLInputElement>this.form.children.namedItem('chk-digit');
    this.chkSymbol = <HTMLInputElement>this.form.children.namedItem('chk-symbol');
    this.chkHasSpaces = <HTMLInputElement>this.form.children.namedItem('chk-spaces');
    this.selLettersAllowed = <HTMLSelectElement>this.form.children.namedItem('sel-letters-allowed');
    this.passwordOutput = <HTMLInputElement>this.form.children.namedItem('password');
    this.selectAddTable = <HTMLSelectElement>this.form.children.namedItem('password-add-table');
    this.contentArea = contentArea;
    const copyButton = createIcon('copy', () => {
      const src = this.passwordOutput;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(src.value);
        console.log('copy password successful');
        return;
      }
      const range = document.createRange();
      range.selectNode(src);
      window.getSelection().addRange(range);
      try {
        const successful = document.execCommand('copy');
        console.log(`copy password ${successful ? 'successful' : 'unsuccessful'}`);
      } catch (err) {
        console.log('copy password error', err);
      }
      window.getSelection().removeAllRanges();
    });
    copyButton.style.width = '24px';
    copyButton.style.height = '24px';
    copyButton.setAttribute('data-action', 'copy');
    this.addButton = createIcon('add', () => {
      if (this.contentArea.data == null) {
        alert('need to be logged in to add this');
        return;
      }
      const table = contentArea.tables[+this.selectAddTable.value];
      if (table == null) {
        alert('please select a valid table');
        return;
      }
      const column = table.spec.map((x, i) => ({spec: x, idx: i})).filter(x => x.spec.type === 'password');
      if (column.length !== 1) {
        alert('please select a table with EXACTLY ONE password column');
        return;
      }
      table.editTable.addRow((row) => {
        row[column[0].idx] = this.passwordOutput.value;
      });
    });
    this.addButton.style.width = '24px';
    this.addButton.style.height = '24px';
    this.addButton.setAttribute('data-action', 'add');
    contentArea.onTables = (tables) => {
      if (tables == null) {
        this.addButton.style.display = 'none';
        this.selectAddTable.style.display = 'none';
      } else {
        this.selectAddTable.innerHTML = '';
        tables.forEach((table, i) => {
          const opt = document.createElement('option');
          opt.innerText = table.title;
          opt.value = `${i}`;
          this.selectAddTable.appendChild(opt);
        });
        this.selectAddTable.value = '0';
        this.addButton.style.display = '';
        this.selectAddTable.style.display = '';
      }
    };
    contentArea.onTables(null);
    this.passwordOutput.insertAdjacentElement('afterend', copyButton);
    this.selectAddTable.insertAdjacentElement('afterend', this.addButton)

    this.btnGenerate = <HTMLInputElement>this.form.children.namedItem('generate');
    this.form.addEventListener('submit', this);
    this.resetCharset.addEventListener('click', this);
  }

  handleEvent(evt: UIEvent) {
    if (evt.currentTarget === this.charset) {
    } else if (evt.currentTarget === this.resetCharset) {
      this.symbolCharset.value = symbols;
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
      const symbolsAllowed = this.symbolCharset.value;
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
        bitlength,
        symbolsAllowed,
        this.chkUpper.checked,
        this.chkLower.checked,
        this.chkDigit.checked,
        this.chkSymbol.checked,
        this.chkHasSpaces.checked,
        this.selLettersAllowed.value as keyof typeof alphaOptions,
      );
    }
  }
}
