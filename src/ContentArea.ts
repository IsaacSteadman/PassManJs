import { arrayBufferToString, stringToArrayBuffer, concatBuffers } from "./StrUtils";
import { ErrorLog } from "./ErrorLog";
import { getPromiseFileReader, FR_AS_TXT, readCSV } from "./FileUtils";
import { EditTable, MultiLineTextColSpec, LinkTextColSpec, PasswordTextColSpec } from "./EditTable";

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
  editTable: EditTable;
  readonly data: string[][];
  parent: ContentArea;
  onSetChanged: (b: boolean) => any;
  constructor(parent: ContentArea, div: HTMLDivElement, title: string, spec: PassTableColumnSpec[], data: string[][]) {
    {
      const span = document.createElement('span');
      span.innerText = title;
      div.appendChild(span);
    }
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
    this.editTable = new EditTable(<{ [key: string]: any }[]>data, tbl, spec.map((spec, i) => {
      if (spec.type === 'text') {
        return <MultiLineTextColSpec>{
          type: 'multi-line-text',
          attrName: '' + i
        };
      } else if (spec.type === 'link') {
        return <LinkTextColSpec>{
          type: 'link-text',
          attrName: '' + i
        };
      } else if (spec.type === 'password') {
        return <PasswordTextColSpec>{
          type: 'password-text',
          attrName: '' + i
        };
      }
    }), true);
    this.data = data;
    this.parent = parent;
    {
      const tbody = tbl.tBodies[0];
      for (let i = 0; i < this.data.length; ++i) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td></td>'.repeat(spec.length + 1);
        tbody.appendChild(tr);
        this.editTable.makeStatic(tr);
      }
    }
    this.editTable.createDefaultData = () => {
      return constructArray('', spec.length);
    };
    this.editTable.onChangeCallback = (arg, dataIndex) => {
      if (typeof this.onSetChanged === 'function') {
        this.onSetChanged(true);
      }
    };
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
