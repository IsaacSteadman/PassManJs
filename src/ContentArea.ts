import { arrayBufferToString, stringToArrayBuffer, concatBuffers } from "./StrUtils";
import { ErrorLog } from "./ErrorLog";

const CELL_SITE_NAME_INDEX = 0;
const CELL_SITE_LINK_INDEX = 1;
const CELL_USERNAME_INDEX = 2;
const CELL_PASSWORD_INDEX = 3;
const CELL_EDIT_INDEX = 4;
const CELL_KILL_INDEX = 5;

interface PassTableRow {
  siteName: string;
  siteLink: string;
  username: string;
  password: string;
}

export class ContentArea {
  div: HTMLDivElement;
  tbl: HTMLTableElement;
  _changed: boolean;
  data: PassTableRow[];
  logoutBtn: HTMLButtonElement;
  onPostLogout: () => any;
  onPreLogout: (buf: ArrayBuffer) => Promise<any>;
  errorLog: ErrorLog;
  topAdder: HTMLTableHeaderCellElement;
  statSpan: HTMLSpanElement;
  saveBtn: HTMLButtonElement;
  constructor(div: HTMLDivElement, errorLog: ErrorLog) {
    this.div = div;
    this.tbl = div.getElementsByTagName('table')[0];
    this.topAdder = <HTMLTableHeaderCellElement>this.tbl.tHead.rows[0].getElementsByClassName('adder')[0]
    this.topAdder.addEventListener('click', this);
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
      }
    }
    this.logoutBtn.addEventListener('click', this);
    this.saveBtn.addEventListener('click', this);
    this.onPreLogout = null;
    this.onPostLogout = null;
    this.errorLog = errorLog;
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
  constructRow(data: PassTableRow, isEditing: boolean): HTMLTableRowElement {
    const tr = document.createElement('tr');
    const tdSiteName = document.createElement('td');
    const tdSiteLink = document.createElement('td');
    const tdUsername = document.createElement('td');
    const tdPassword = document.createElement('td');
    const tdEditCell = document.createElement('td');
    tdEditCell.classList.add('editor');
    const tdKillCell = document.createElement('td');
    tdKillCell.classList.add('remover');
    tdKillCell.textContent = 'Remove'
    tdSiteName.textContent = data.siteName;
    tdUsername.textContent = data.username;
    if (isEditing) {
      tdSiteLink.textContent = data.siteLink;
      tdPassword.textContent = data.password;
      tdSiteName.setAttribute('contenteditable', 'true');
      tdSiteLink.setAttribute('contenteditable', 'true');
      tdUsername.setAttribute('contenteditable', 'true');
      tdPassword.setAttribute('contenteditable', 'true');
      tdEditCell.textContent = 'SAVE';
    } else {
      const a = document.createElement('a');
      a.setAttribute('href', data.siteLink);
      a.textContent = 'link';
      tdSiteLink.appendChild(a);
      tdPassword.textContent = '\u2022'.repeat(data.password.length);
      tdEditCell.textContent = 'EDIT';
    }
    tdEditCell.addEventListener('click', this);
    tdKillCell.addEventListener('click', this);
    tr.appendChild(tdSiteName);
    tr.appendChild(tdSiteLink);
    tr.appendChild(tdUsername);
    tr.appendChild(tdPassword);
    tr.appendChild(tdEditCell);
    tr.appendChild(tdKillCell);
    return tr;
  }
  removeRow(tr: HTMLTableRowElement) {
    const r = tr.rowIndex - 1;
    if (window.confirm(`are you sure you want to delete the password named ${tr.cells[CELL_SITE_NAME_INDEX].textContent}`)) {
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
  loadTableJson(json: PassTableRow[]) {
    this.changed = false;
    const tbody = this.tbl.tBodies[0];
    tbody.innerHTML = '';
    json.forEach(x => {
      tbody.appendChild(this.constructRow(x, false));
    });
    this.data = json;
  }
  handleEvent(e: Event) {
    const tgt = <Element>e.currentTarget
    if (tgt === this.topAdder) {
      this.data.push({ siteName: '', siteLink: '', username: '', password: '' });
      this.tbl.tBodies[0].appendChild(this.constructRow(this.data[this.data.length - 1], true))
    } else if (tgt.tagName === 'TD') {
      const td = <HTMLTableCellElement>tgt;
      const tr = <HTMLTableRowElement>td.parentElement;
      const x = td.cellIndex;
      if (x === CELL_EDIT_INDEX) {
        this.toggleEditRow(tr, td);
      } else if (x === CELL_KILL_INDEX) {
        this.removeRow(tr);
      }
    } else if (tgt === this.saveBtn) {
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
        this.tbl.tBodies[0].innerHTML = '';
        this.data = null;
        this.changed = false;
        this.onPostLogout();
      });
    }
  }
  toggleEditRow(tr: HTMLTableRowElement, tdEditCell: HTMLTableCellElement) {
    const jsonRow = this.data[tr.rowIndex - 1];
    if (tdEditCell.innerText.toUpperCase() === 'EDIT') {
      const tdSiteName = tr.cells[CELL_SITE_NAME_INDEX];
      const tdSiteLink = tr.cells[CELL_SITE_LINK_INDEX];
      const tdUsername = tr.cells[CELL_USERNAME_INDEX];
      const tdPassword = tr.cells[CELL_PASSWORD_INDEX];
      tdSiteName.setAttribute('contenteditable', 'true');
      tdUsername.setAttribute('contenteditable', 'true');
      tdPassword.innerText = jsonRow.password;
      tdPassword.setAttribute('contenteditable', 'true');
      const link = (<HTMLAnchorElement>tdSiteLink.children[0]).href;
      tdSiteLink.innerText = link;
      tdSiteLink.setAttribute('contenteditable', 'true');
      tdEditCell.innerText = 'SAVE';
    } else {
      const tdSiteName = tr.cells[CELL_SITE_NAME_INDEX];
      const tdSiteLink = tr.cells[CELL_SITE_LINK_INDEX];
      const tdUsername = tr.cells[CELL_USERNAME_INDEX];
      const tdPassword = tr.cells[CELL_PASSWORD_INDEX];
      tdSiteName.removeAttribute('contenteditable');
      tdSiteLink.removeAttribute('contenteditable');
      tdUsername.removeAttribute('contenteditable');
      const username = tdUsername.innerText;
      tdPassword.removeAttribute('contenteditable');
      const password = tdPassword.innerText
      tdPassword.innerText = '\u2022'.repeat(jsonRow.password.length);
      const siteName = tdSiteName.innerText;
      const a = document.createElement('a');
      // single '=' is intentional
      const siteLink = tdSiteLink.innerText.trim();
      a.setAttribute('href', siteLink);
      a.innerText = 'link';
      tdSiteLink.innerHTML = '';
      tdSiteLink.appendChild(a);
      tdEditCell.innerText = 'EDIT';
      if (jsonRow.siteName !== siteName) {
        jsonRow.siteName = siteName;
        this.changed = true;
      }
      if (jsonRow.siteLink !== siteLink) {
        jsonRow.siteLink = siteLink;
        this.changed = true;
      }
      if (jsonRow.username !== username) {
        jsonRow.username = username;
        this.changed = true;
      }
      if (jsonRow.password !== password) {
        jsonRow.password = password;
        this.changed = true;
      }
    }
  }
}
