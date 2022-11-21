import {
  arrayBufferToString,
  stringToArrayBuffer,
  concatBuffers,
} from './StrUtils';
import { ErrorLog } from './ErrorLog';
import { getPromiseFileReader, FR_AS_TXT, readCSV } from './FileUtils';
import {
  EditTable,
  MultiLineTextColSpec,
  LinkTextColSpec,
  PasswordTextColSpec,
  SearchHelper,
  CustomColSpec,
  makeIconImage,
  copyTextToClipboard,
} from './EditTable';
import { generateOtp } from './mfa';

interface PassTableColumnSpec {
  name: string;
  type: 'text' | 'link' | 'password';
}

function constructArray<T>(fill: T, length: number): T[] {
  const arr: T[] = [];
  for (let i = 0; i < length; ++i) {
    arr[i] = fill;
  }
  return arr;
}

function cloneData(data: string[][]): string[][] {
  const newData: string[][] = [];
  for (let y = 0; y < data.length; ++y) {
    const part: string[] = [];
    for (let x = 0; x < data[y].length; ++x) {
      part.push(data[y][x]);
    }
    newData.push(part);
  }
  return newData;
}

function arrayEquals(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; ++i) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

class PasswordTable {
  editTable: EditTable;
  readonly data: string[][];
  parent: ContentArea;
  search: HTMLInputElement;
  onSetChanged: (b: boolean) => any;
  importBtn: HTMLButtonElement;
  spec: PassTableColumnSpec[];
  highlightDiffs: HTMLInputElement;
  oldData: string[][];
  constructor(
    parent: ContentArea,
    div: HTMLDivElement,
    title: string,
    spec: PassTableColumnSpec[],
    data: string[][]
  ) {
    {
      const span = document.createElement('span');
      span.innerText = title;
      div.appendChild(span);
    }
    div.appendChild(document.createElement('br'));
    this.search = document.createElement('input');
    div.appendChild(this.search);
    this.search.addEventListener('keydown', this);
    this.search.addEventListener('input', this);
    div.appendChild(document.createElement('br'));
    const tbl = document.createElement('table');
    {
      div.appendChild(tbl);
      tbl.appendChild(document.createElement('tbody'));
      const thead = document.createElement('thead');
      tbl.appendChild(thead);
      const tr = document.createElement('tr');
      thead.appendChild(tr);
      for (let i = 0; i < spec.length; ++i) {
        const th = document.createElement('th');
        th.innerText = spec[i].name;
        tr.appendChild(th);
      }
      tr.appendChild(document.createElement('th'));
    }
    this.importBtn = document.createElement('button');
    this.importBtn.addEventListener('click', this);
    this.importBtn.innerText = 'Import CSV';
    div.appendChild(this.importBtn);
    this.editTable = new EditTable(
      data as { [key: string]: any }[],
      tbl,
      spec.map((spec, i) => {
        if (spec.type === 'text') {
          const res: MultiLineTextColSpec = {
            type: 'multi-line-text',
            attrName: `${i}`,
          };
          return res;
        } else if (spec.type === 'link') {
          const res: LinkTextColSpec = {
            type: 'link-text',
            attrName: `${i}`,
          };
          return res;
        } else if (spec.type === 'password') {
          const res: CustomColSpec = {
            type: 'custom',
            attrName: `${i}`,
            dataFromEditableTd: (td) => {
              const sel = td.getElementsByTagName('select')[0];
              if (sel.value === 'password') {
                const inp = td.getElementsByTagName('input')[0];
                return { type: 'password', value: inp.value };
              } else if (sel.value === 'mfa-key') {
                const inp = td.getElementsByTagName('input')[0];
                return { type: 'mfa-key', value: inp.value };
              } else {
                throw new Error('unrecognized type ' + sel.value);
              }
            },
            editableTdFromData: (td, data) => {
              if (typeof data === 'string') {
                data = { type: 'password', value: data };
              }
              const sel = document.createElement('select');
              sel.innerHTML = [
                '<option value="password">Password</option>',
                '<option value="mfa-key">MFA Key</option>',
              ].join('');
              sel.value = data.type;
              const elementCache: {
                password?: {
                  inp: HTMLInputElement;
                };
                'mfa-key'?: {
                  inp: HTMLInputElement;
                };
              } = {};
              const changeCb = () => {
                td.childNodes.forEach((node) => {
                  if (node === sel) {
                    return;
                  }
                  node.remove();
                });
                if (sel.value === 'password') {
                  let cache = elementCache[sel.value];
                  if (cache == null) {
                    const inp = document.createElement('input');
                    inp.value = data.value;
                    elementCache[sel.value] = cache = {
                      inp,
                    };
                  }
                  td.appendChild(cache.inp);
                } else if (sel.value === 'mfa-key') {
                  let cache = elementCache[sel.value];
                  if (cache == null) {
                    const inp = document.createElement('input');
                    inp.value = data.value;
                    elementCache[sel.value] = cache = {
                      inp,
                    };
                  }
                  td.appendChild(cache.inp);
                } else {
                  throw new Error('unrecognized type ' + data.type);
                }
              };
              td.innerHTML = '';
              td.appendChild(sel);
              sel.addEventListener('change', changeCb);
              changeCb();
            },
            staticTdFromData: (td, data) => {
              if (typeof data === 'string') {
                data = { type: 'password', value: data };
              }
              if (data.type === 'password') {
                td.innerText = 'password:' + '\u2022'.repeat(data.value.length);
                const copyButton = makeIconImage('copy', (e) => {
                  copyTextToClipboard(data.value);
                });
                td.appendChild(copyButton);
              } else if (data.type === 'mfa-key') {
                td.innerText = 'MFA Key:' + '\u2022'.repeat(data.value.length);
                const copyButton = makeIconImage('copy', async (e) => {
                  copyTextToClipboard(await generateOtp(data.value));
                });
                td.appendChild(copyButton);
              } else {
                throw new Error('unrecognized type ' + data.type);
              }
            },
          };
          return res;
        } else {
          throw new Error('unrecognized type ' + spec.type);
        }
      }),
      true
    );
    this.spec = spec;
    this.oldData = cloneData(data);
    this.data = data;
    this.parent = parent;
    {
      const tbody = tbl.tBodies[0];
      for (let i = 0; i < this.data.length; ++i) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td></td>'.repeat(spec.length + 1);
        tbody.appendChild(tr);
        this.editTable.makeStatic(tr);
        if (tr.rowIndex - 1 !== i)
          throw new TypeError('expected rowIndex to match');
      }
    }
    this.editTable.createDefaultData = () => {
      return constructArray('', spec.length);
    };
    this.editTable.onChangeCallback = (arg, dataIndex, reason) => {
      if (typeof this.onSetChanged === 'function') {
        this.onSetChanged(true);
      }
    };
    this.highlightDiffs = document.createElement('input');
    this.highlightDiffs.type = 'checkbox';
    this.highlightDiffs.checked = false;
    this.highlightDiffs.addEventListener('change', this);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createTextNode('Highlight Differences'));
    div.appendChild(this.highlightDiffs);
  }
  handleEvent(e: UIEvent) {
    if (e.currentTarget === this.search) {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') {
          this.search.value = '';
          this.editTable.search(new SearchHelper((str) => true));
        }
      } else if (e.type === 'input') {
        const v = this.search.value.toLowerCase();
        if (v.length) {
          this.editTable.search(
            new SearchHelper((str) => str.toLowerCase().indexOf(v) !== -1)
          );
        } else {
          this.editTable.search(new SearchHelper((str) => true));
        }
      }
    } else if (e.currentTarget === this.importBtn) {
      this.parent.impPane.show(this);
    } else if (e.currentTarget === this.highlightDiffs) {
      this.updateDiffs();
    }
  }
  updateDiffs() {
    const v = this.highlightDiffs.checked;
    if (v) {
      const rows = this.editTable.tbody.rows;
      for (let i = 0; i < rows.length; ++i) {
        if (i >= this.oldData.length) {
          rows[i].style.border = 'solid 1px blue';
          rows[i].style.backgroundColor = '#ddf';
        } else if (!arrayEquals(this.oldData[i], this.data[i])) {
          rows[i].style.border = 'solid 1px red';
          rows[i].style.backgroundColor = '#fdd';
        }
      }
    } else {
      const rows = this.editTable.tbody.rows;
      for (let i = 0; i < rows.length; ++i) {
        rows[i].style.border = '';
        rows[i].style.backgroundColor = '';
      }
    }
  }
  importData(data: string[][], options: { overwriteExisting: boolean }) {
    const newEntries = options.overwriteExisting ? [] : data;
    if (options.overwriteExisting) {
      const findFunction = (entSearch: string[]): number => {
        for (let i = 0; i < this.data.length; ++i) {
          const row = this.data[i];
          let cond = true;
          for (let c = 0; c < this.spec.length && cond; ++c) {
            if (this.spec[c].type === 'text') {
              cond = row[c] === entSearch[c];
            }
          }
          if (cond) {
            return i;
          }
        }
        return -1;
      };
      data.forEach((newDataRow) => {
        const pos = findFunction(newDataRow);
        if (pos === -1) {
          newEntries.push(newDataRow);
        } else {
          const dataRow = this.data[pos];
          for (let i = 0; i < newDataRow.length; ++i) {
            dataRow[i] = newDataRow[i];
          }
          this.editTable.makeStatic(this.editTable.tbody.rows[pos]);
        }
      });
    }
    const start = this.data.length;
    this.data.splice(start, 0, ...newEntries);
    for (let i = start; i < this.data.length; ++i) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td>'.repeat(this.data[i].length + 1);
      this.editTable.tbody.appendChild(tr);
      this.editTable.makeStatic(tr);
    }
  }
}

interface PassTableJson {
  title: string;
  spec: PassTableColumnSpec[];
  data: string[][];
}

class ImportOptions {
  parent: ContentArea;
  form: HTMLFormElement;
  impFile: HTMLInputElement;
  overwriteExisting: HTMLInputElement;
  importTopRow: HTMLInputElement;
  tbl: null | PasswordTable;
  showTs: number;
  constructor(parent: ContentArea, form: HTMLFormElement) {
    this.parent = parent;
    this.form = form;
    this.impFile = form.children.namedItem('imp-file') as HTMLInputElement; // type="file"
    this.overwriteExisting = <HTMLInputElement>(
      form.children.namedItem('overwrite')
    ); // type="checkbox"
    this.importTopRow = <HTMLInputElement>(
      form.children.namedItem('imp-top-row')
    ); // type="checkbox"
    form.addEventListener('submit', this);
    window.addEventListener('click', this);
    window.addEventListener('keydown', this);
    form.addEventListener('click', this);
    this.showTs = Date.now();
  }
  async handleEvent(e: UIEvent) {
    if (e.currentTarget === this.form) {
      if (e.type === 'submit') {
        e.preventDefault();
        if (this.tbl == null) {
          return;
        }
        const data = (await getPromiseFileReader(
          (this.impFile.files as FileList).item(0) as File,
          FR_AS_TXT
        )) as string;
        const csvData = readCSV(data);
        if (!this.importTopRow.checked) {
          csvData.shift();
        }
        this.tbl.importData(csvData, {
          overwriteExisting: this.overwriteExisting.checked,
        });
      } else {
        e.stopPropagation();
      }
    } else if (e.currentTarget === window) {
      if (e.type == 'click') {
        if (Date.now() - this.showTs > 100) {
          this.hide();
        }
      } else if (e.type === 'keydown') {
        if ((<KeyboardEvent>e).key === 'Escape') {
          this.hide();
        }
      }
    }
  }
  show(tbl: PasswordTable) {
    this.tbl = tbl;
    this.showTs = Date.now();
    this.form.style.display = '';
  }
  hide() {
    this.form.style.display = 'none';
  }
}

export class ContentArea {
  div: HTMLDivElement;
  _changed: boolean;
  data: PassTableJson[] | null;
  impPane: ImportOptions;
  logoutBtn: HTMLButtonElement;
  onPostLogout: null | (() => any);
  onTables: null | ((tables: PassTableJson[] | null) => any); // for PassGen, is called whenever a table is added/removed/login/logout
  onPreLogout: null | ((buf: ArrayBuffer) => Promise<any>);
  errorLog: ErrorLog;
  statSpan: HTMLSpanElement;
  saveBtn: HTMLButtonElement;
  dataDiv: HTMLDivElement;
  tables: PasswordTable[];
  constructor(div: HTMLDivElement, errorLog: ErrorLog) {
    this.div = div;
    this.impPane = new ImportOptions(
      this,
      <HTMLFormElement>document.getElementById('imp-pane')
    );
    this._changed = false;
    this.data = null;
    for (let i = 0; i < div.children.length; ++i) {
      const elem = div.children[i];
      const name = elem.getAttribute('name');
      if (name == null) continue;
      else if (name === 'logout') {
        this.logoutBtn = <HTMLButtonElement>elem;
      } else if (name === 'stat-span') {
        this.statSpan = <HTMLSpanElement>elem;
      } else if (name === 'save') {
        this.saveBtn = <HTMLButtonElement>elem;
      } else if (name === 'data') {
        this.dataDiv = <HTMLDivElement>elem;
      }
    }
    this.logoutBtn.addEventListener('click', this);
    this.saveBtn.addEventListener('click', this);
    this.onPreLogout = null;
    this.onPostLogout = null;
    this.errorLog = errorLog;
    this.tables = [];
    window.addEventListener('beforeunload', this);
  }
  set changed(b: boolean) {
    this._changed = b;
    if (b) {
      this.div.style.borderColor = 'red';
      this.statSpan.style.color = 'red';
      this.statSpan.innerText = 'You have pending changes to be saved';
    } else {
      this.div.style.borderColor = 'green';
      this.statSpan.style.color = 'green';
      this.statSpan.innerText = 'The password table has been saved';
    }
  }
  get changed(): boolean {
    return this._changed;
  }
  setWaiting(msg: string) {
    this.statSpan.style.color = 'purple';
    this.statSpan.innerText = msg;
  }
  removeRow(tr: HTMLTableRowElement) {
    const r = tr.rowIndex - 1;
    if (this.data == null || tr.parentElement == null) {
      return;
    }
    if (
      window.confirm(
        `are you sure you want to delete the password named ${tr.cells[0].textContent}`
      )
    ) {
      tr.parentElement.removeChild(tr);
      this.data.splice(r, 1);
      this.changed = true;
    }
  }
  loadTableBuf(buf: ArrayBuffer) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) & 0x80000000) {
      this.loadTableJson(JSON.parse(arrayBufferToString(buf.slice(4))));
      this.changed = false;
    } else {
      throw new TypeError('only JSON password vaults are supported right now');
    }
  }
  loadTableJson(json: PassTableJson[]) {
    this.data = json;
    const tables: Array<PasswordTable> = [];
    for (let i = 0; i < json.length; ++i) {
      const { title, spec, data } = json[i];
      const div = document.createElement('div');
      this.dataDiv.appendChild(div);
      const ptbl = new PasswordTable(this, div, title, spec, data);
      ptbl.onSetChanged = (b) => {
        this.changed = b;
      };
      tables.push(ptbl);
      this.dataDiv.appendChild(div);
    }
    this.tables = tables;
    if (typeof this.onTables === 'function') {
      this.onTables(this.data);
    }
    this.changed = false;
  }
  handleEvent(e: Event) {
    if (e.currentTarget === window) {
      if (this.changed) {
        e.preventDefault();
        e.returnValue = 'Data you have entered may not be saved' as any;
      }
      return;
    }
    const tgt = <Element>e.currentTarget;
    if (tgt === this.saveBtn) {
      const ver = new ArrayBuffer(4);
      new DataView(ver).setUint32(0, 0x80000000, true);
      const buf = concatBuffers(
        ver,
        stringToArrayBuffer(JSON.stringify(this.data))
      );
      this.setWaiting('Saving changes');
      this.onPreLogout?.(buf).then((x) => {
        this.tables.forEach((tbl) => {
          tbl.oldData = cloneData(tbl.data);
          tbl.highlightDiffs.checked = false;
          tbl.updateDiffs();
        });
        this.changed = false;
      });
    } else if (tgt === this.logoutBtn) {
      const ver = new ArrayBuffer(4);
      new DataView(ver).setUint32(0, 0x80000000, true);
      const buf = concatBuffers(
        ver,
        stringToArrayBuffer(JSON.stringify(this.data))
      );
      this.onPreLogout?.(buf).then((x) => {
        this.dataDiv.innerHTML = '';
        this.tables = [];
        this.data = null;
        if (typeof this.onTables === 'function') {
          this.onTables(this.data);
        }
        this.changed = false;
        this.onPostLogout?.();
      });
    }
  }
}
