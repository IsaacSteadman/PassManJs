import { arrayBufferToString, stringToArrayBuffer, concatBuffers } from "./StrUtils";
import { ErrorLog } from "./ErrorLog";
import { getPromiseFileReader, FR_AS_TXT, readCSV } from "./FileUtils";

interface PassTableRow {
  siteName: string;
  siteLink: string;
  username: string;
  password: string;
}

interface PassTableColumnSpec {
  name: string;
  type: 'text' | 'link' | 'password'
}

function constructArray<T>(fill: T, length: number): Array<T> {
  const arr = [];
  for (let i = 0; i < length; ++i) {
    arr[i] = fill;
  }
  return arr;
}

class PasswordTable {
  spec: PassTableColumnSpec[];
  div: HTMLDivElement;
  tbl: HTMLTableElement;
  tHead: HTMLTableSectionElement;
  tBody: HTMLTableSectionElement;
  readonly data: string[][];
  thAddNew: HTMLTableHeaderCellElement;
  onSetChanged: (b: boolean) => any;
  fileImport: HTMLInputElement;
  parent: ContentArea;
  importTopRow: HTMLInputElement;
  constructor(parent: ContentArea, div: HTMLDivElement, title: string, spec: PassTableColumnSpec[], data: string[][]) {
    {
      const span = document.createElement('span');
      span.innerText = title;
      div.appendChild(span)
    }
    const tbl = document.createElement('table');
    {
      div.appendChild(tbl);
      this.tHead = document.createElement('thead');
      tbl.appendChild(this.tHead);
      const tr = document.createElement('tr');
      this.tHead.appendChild(tr);
      for (let i = 0; i < spec.length; ++i) {
        const th = document.createElement('th');
        th.innerText = spec[i].name;
        tr.appendChild(th);
      }
      const thEditSave = document.createElement('th');
      thEditSave.innerText = 'EDIT/SAVE';
      tr.appendChild(thEditSave);
      const thAddNew = document.createElement('th');
      thAddNew.innerText = 'Add New';
      thAddNew.classList.add('adder');
      tr.appendChild(thAddNew);
      this.thAddNew = thAddNew;
      thAddNew.addEventListener('click', this);
    }
    tbl.appendChild(this.tBody = document.createElement('tbody'));
    div.appendChild(tbl);
    this.parent = parent;
    this.fileImport = document.createElement('input');
    this.fileImport.type = 'file';
    this.fileImport.setAttribute('accept', '.csv');
    this.fileImport.addEventListener('change', this);
    div.appendChild(document.createTextNode('Import CSV: '));
    div.appendChild(this.fileImport);
    div.appendChild(document.createTextNode('Import Top Row?'));
    this.importTopRow = document.createElement('input');
    this.importTopRow.type = 'checkbox';
    div.appendChild(this.importTopRow);
    this.onSetChanged = null;
    this.spec = spec;
    this.div = div;
    this.tbl = tbl;
    this.data = data;
    for (let i = 0; i < data.length; ++i) {
      this.tBody.appendChild(this.constructRow(data[i], false));
    }
  }
  handleEvent(e: Event) {
    const tgt = <HTMLElement>e.currentTarget;
    if (tgt === this.thAddNew) {
      const arr = constructArray('', this.spec.length);
      this.data.push(arr)
      this.tBody.appendChild(this.constructRow(arr, true));
      this.onSetChanged(true);
    } else if (tgt.tagName === 'TD') {
      const tr = <HTMLTableRowElement>tgt.parentElement;
      if (tgt.classList.contains('remover')) {
        this.removeRow(tr);
      } else if (tgt.classList.contains('editor')) {
        this.toggleEditRow(tr, <HTMLTableCellElement>tgt);
      }
    } else if (tgt === this.fileImport) {
      getPromiseFileReader(this.fileImport.files[0], FR_AS_TXT).then(x => {
        x = <string>x;
        const csvData = readCSV(x);
        if (csvData[0].length !== this.spec.length) {
          alert('CSV must have same number of columns as this password table');
        }
        if (!this.importTopRow.checked) {
          csvData.splice(0, 1);
        }
        if (csvData.length === 0) return;
        const docFrag = document.createDocumentFragment();
        csvData.forEach(csvRow => {
          docFrag.appendChild(this.constructRow(csvRow, false));
        });
        this.data.splice(this.data.length, 0, ...csvData);
        this.tBody.appendChild(docFrag);
        this.onSetChanged(true);
      })
    }
  }
  constructRow(data: any[], isEditing: boolean) {
    const tr = document.createElement('tr');
    const tdEditCell = document.createElement('td');
    tdEditCell.classList.add('editor');
    const tdKillCell = document.createElement('td');
    tdKillCell.classList.add('remover');
    tdKillCell.innerText = 'Remove'
    if (isEditing) {
      for (let i = 0; i < this.spec.length; ++i) {
        const td = document.createElement('td');
        // TODO: currently the type does not affect how you edit the box
        td.innerText = data[i];
        td.setAttribute('contenteditable', 'true');
        tr.appendChild(td);
      }
      tdEditCell.innerText = 'SAVE';
    } else {
      for (let i = 0; i < this.spec.length; ++i) {
        const td = document.createElement('td');
        const spec = this.spec[i];
        if (spec.type === 'text') {
          td.innerText = data[i];
        } else if (spec.type === 'link') {
          const a = document.createElement('a');
          a.href = data[i].trim();
          a.setAttribute('target', '_blank');
          a.innerText = 'Link';
          td.appendChild(a);
        } else if (spec.type === 'password') {
          td.innerText = '\u2022'.repeat(data[i].length);
        }
        tr.appendChild(td);
      }
      tdEditCell.innerText = 'EDIT/VIEW';
    }
    tdEditCell.addEventListener('click', this);
    tdKillCell.addEventListener('click', this);
    tr.appendChild(tdEditCell);
    tr.appendChild(tdKillCell);
    return tr;
  }
  removeRow(tr: HTMLTableRowElement) {
    const r = tr.rowIndex - 1;
    if (window.confirm(`are you sure you want to delete the password named ${tr.cells[0].textContent}`)) {
      tr.parentElement.removeChild(tr);
      this.data.splice(r, 1);
      this.onSetChanged(true);
    }
  }
  toggleEditRow(tr: HTMLTableRowElement, tdEditCell: HTMLTableCellElement) {
    const jsonRow = this.data[tr.rowIndex - 1];
    if (tdEditCell.innerText.toUpperCase().trim() === 'SAVE') {
      let changed = false;
      for (let i = 0; i < this.spec.length; ++i) {
        const td = tr.cells[i];
        const spec = this.spec[i];
        if (spec.type === 'text') {
          const text = td.innerText;
          if (jsonRow[i] !== text) {
            changed = true;
            jsonRow[i] = text;
          }
        } else if (spec.type === 'link') {
          const link = td.innerText.trim();
          if (jsonRow[i] !== link) {
            changed = true;
            jsonRow[i] = link;
          }
          const a = document.createElement('a');
          a.setAttribute('target', '_blank');
          a.href = link;
          a.innerText = 'Link'
          td.innerHTML = '';
          td.appendChild(a);
        } else if (spec.type === 'password') {
          const pass = td.innerText;
          if (jsonRow[i] !== pass) {
            changed = true;
            jsonRow[i] = pass;
          }
          td.innerText = '\u2022'.repeat(pass.length);
        }
        td.removeAttribute('contenteditable');
      }
      if (changed) {
        this.onSetChanged(true)
      }
      tdEditCell.innerText = 'EDIT/VIEW';
    } else {
      for (let i = 0; i < this.spec.length; ++i) {
        const td = tr.cells[i];
        const spec = this.spec[i];
        if (spec.type === 'text') {
        } else if (spec.type === 'link') {
          td.innerText = jsonRow[i];
        } else if (spec.type === 'password') {
          td.innerText = jsonRow[i];
        }
        td.setAttribute('contenteditable', 'true');
      }
      tdEditCell.innerText = 'SAVE';
    }
  }
}

interface PassTableJson {
  title: string,
  spec: PassTableColumnSpec[],
  data: string[][]
}

export class ContentArea {
  div: HTMLDivElement;
  _changed: boolean;
  data: PassTableJson[];
  logoutBtn: HTMLButtonElement;
  onPostLogout: () => any;
  onPreLogout: (buf: ArrayBuffer) => Promise<any>;
  errorLog: ErrorLog;
  statSpan: HTMLSpanElement;
  saveBtn: HTMLButtonElement;
  dataDiv: HTMLDivElement;
  tables: PasswordTable[];
  constructor(div: HTMLDivElement, errorLog: ErrorLog) {
    this.div = div;
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
    this._changed = true;
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
    if (window.confirm(`are you sure you want to delete the password named ${tr.cells[0].textContent}`)) {
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
    console.log(json);
    this.data = json;
    const tables: Array<PasswordTable> = [];
    for (let i = 0; i < json.length; ++i) {
      const { title, spec, data } = json[i];
      const div = document.createElement('div');
      this.dataDiv.appendChild(div);
      const ptbl = new PasswordTable(this, div, title, spec, data)
      ptbl.onSetChanged = b => {
        this.changed = b;
      }
      tables.push(ptbl);
      this.dataDiv.appendChild(div);
    }
    this.tables = tables;
    this.changed = false;
  }
  handleEvent(e: Event) {
    if (e.currentTarget === window) {
      if (this.changed) {
        e.preventDefault();
        e.returnValue = <any>'Data you have entered may not be saved';
      }
      return;
    }
    const tgt = <Element>e.currentTarget
    if (tgt === this.saveBtn) {
      const ver = new ArrayBuffer(4);
      (new DataView(ver)).setUint32(0, 0x80000000, true);
      const buf = concatBuffers(ver, stringToArrayBuffer(JSON.stringify(this.data)));
      this.setWaiting('Saving changes');
      this.onPreLogout(buf).then(x => {
        this.changed = false;
      });
    } else if (tgt === this.logoutBtn) {
      const ver = new ArrayBuffer(4);
      (new DataView(ver)).setUint32(0, 0x80000000, true);
      const buf = concatBuffers(ver, stringToArrayBuffer(JSON.stringify(this.data)));
      this.onPreLogout(buf).then(x => {
        this.dataDiv.innerHTML = '';
        this.tables = [];
        this.data = null;
        this.changed = false;
        this.onPostLogout();
      });
    }
  }
}
