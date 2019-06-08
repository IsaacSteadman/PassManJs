import { arrayBufferToString, stringToArrayBuffer } from "./StrUtils";

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
  changed: boolean;
  data: PassTableRow[];
  logoutBtn: HTMLButtonElement;
  onPostLogout: () => any;
  onPreLogout: (buf: ArrayBuffer) => Promise;
  constructor(div: HTMLDivElement) {
    this.div = div;
    this.tbl = div.getElementsByTagName('table')[0];
    this.changed = false;
    this.data = null;
    for (let i = 0; i < div.children.length; ++i) {
      const elem = div.children[i];
      if (elem.getAttribute('name') === 'logout') {
        this.logoutBtn = <HTMLButtonElement>elem;
      }
    }
    this.onPreLogout = null;
    this.onPostLogout = null;
  }
  constructRow(data: PassTableRow, isEditing: boolean): HTMLTableRowElement {
    const tr = document.createElement('tr');
    const tdSiteName = document.createElement('td');
    const tdSiteLink = document.createElement('td');
    const tdUsername = document.createElement('td');
    const tdPassword = document.createElement('td');
    const tdEditCell = document.createElement('td');
    const tdKillCell = document.createElement('td');
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
    const r = tr.rowIndex;
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
    if (tgt.tagName === 'TD') {
      const td = <HTMLTableCellElement>tgt;
      const tr = <HTMLTableRowElement>td.parentElement;
      const x = td.cellIndex;
      if (x === CELL_EDIT_INDEX) {
        this.toggleEditRow(tr, td);
      } else if (x === CELL_KILL_INDEX) {
        this.removeRow(tr);
      }
    } else if (tgt === this.logoutBtn) {
      this.onPreLogout(stringToArrayBuffer(JSON.stringify(this.data))).then(x => {
        this.tbl.tBodies[0].innerHTML = '';
        this.data = null;
        this.changed = false;
        this.onPostLogout();
      });
    }
  }
  toggleEditRow(tr: HTMLTableRowElement, tdEditCell: HTMLTableCellElement) {
    const jsonRow = this.data[tr.rowIndex];
    if (tdEditCell.textContent.toUpperCase() === 'EDIT') {
      const tdSiteName = tr.cells[CELL_SITE_NAME_INDEX];
      const tdSiteLink = tr.cells[CELL_SITE_LINK_INDEX];
      const tdUsername = tr.cells[CELL_USERNAME_INDEX];
      const tdPassword = tr.cells[CELL_PASSWORD_INDEX];
      tdSiteName.setAttribute('contenteditable', 'true');
      tdUsername.setAttribute('contenteditable', 'true');
      tdPassword.textContent = jsonRow.password;
      const link = (<HTMLAnchorElement>tdSiteLink.children[0]).href;
      tdSiteLink.textContent = link;
      tdSiteLink.setAttribute('contenteditable', 'true');
      tdEditCell.textContent = 'SAVE';
    } else {
      this.changed = true;
      const tdSiteName = tr.cells[CELL_SITE_NAME_INDEX];
      const tdSiteLink = tr.cells[CELL_SITE_LINK_INDEX];
      const tdUsername = tr.cells[CELL_USERNAME_INDEX];
      const tdPassword = tr.cells[CELL_PASSWORD_INDEX];
      tdSiteName.removeAttribute('contenteditable');
      tdSiteLink.removeAttribute('contenteditable');
      tdUsername.removeAttribute('contenteditable');
      jsonRow.username = tdUsername.textContent;
      tdPassword.removeAttribute('contenteditable');
      jsonRow.password = tdPassword.textContent;
      tdPassword.textContent = '\u2022'.repeat(jsonRow.password.length);
      jsonRow.siteName = tdSiteName.textContent;
      const a = document.createElement('a');
      // single '=' is intentional
      a.setAttribute('href', jsonRow.siteLink = tdSiteLink.textContent.trim());
      a.textContent = 'link';
      tdSiteLink.innerHTML = '';
      tdSiteLink.appendChild(a);
      tdEditCell.textContent = 'SAVE';
    }
  }
}
