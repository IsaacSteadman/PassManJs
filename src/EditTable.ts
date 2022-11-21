import { createIcon } from './icons';

interface ColumnSpecification {
  header?: string;
  attrName: string;
  editIsStatic?: boolean;
  // dataToCell?: ((data: any) => string | number | boolean) | null;
  // cellToData?: ((cell: string | number | boolean) => any) | null;
}

export interface StaticColSpec extends ColumnSpecification {
  type: 'static';
  dataToCell?: ((data: any) => string) | null;
  cellToData?: null;
}

export interface SingleLineTextColSpec extends ColumnSpecification {
  type: 'single-line-text';
  dataToCell?: ((data: any) => string) | null;
  cellToData?: ((cell: string) => any) | null;
}

export interface MultiLineTextColSpec extends ColumnSpecification {
  type: 'multi-line-text';
  dataToCell?: ((data: any) => string) | null;
  cellToData?: ((cell: string) => any) | null;
}

export interface TextColSpec extends ColumnSpecification {
  type: 'text';
  attrNameIsMultiLine: string;
  dataToCell?: ((data: any) => string) | null;
  cellToData?: ((cell: string) => any) | null;
}

export interface LinkTextColSpec extends ColumnSpecification {
  type: 'link-text';
  dataToCell?: ((data: any) => string) | null;
  cellToData?: ((cell: string) => any) | null;
}

export interface PasswordTextColSpec extends ColumnSpecification {
  type: 'password-text';
  dataToCell?: ((data: any) => string) | null;
  cellToData?: ((cell: string) => any) | null;
}

export interface BoolColSpec extends ColumnSpecification {
  type: 'boolean';
  boolNames?: [string, string];
  dataToCell?: ((data: any) => boolean) | null;
  cellToData?: ((cell: boolean) => any) | null;
}

export interface OptionColSpec extends ColumnSpecification {
  type: 'option';
  dataToCell?: ((data: any) => string) | null;
  cellToData?: ((cell: string) => any) | null;
  options: { key: string; title: string }[];
}

export interface NumberColSpec extends ColumnSpecification {
  type: 'number';
  dataToCell?: ((data: any) => number) | null;
  cellToData?: ((cell: number) => any) | null;
  numToStaticStr?: ((data: number) => string) | null;
  valueToNum?: ((value: string) => number) | null;
  numToValue?: ((data: number) => string) | null;
  min: string | number | null;
  max: string | number | null;
  step: string | number | null;
}

export interface CustomColSpec extends ColumnSpecification {
  type: 'custom';
  dataToCell?: null;
  cellToData?: null;
  dataFromEditableTd: (td: HTMLTableCellElement) => any;
  staticTdFromData: (td: HTMLTableCellElement, data: any) => void;
  editableTdFromData: (td: HTMLTableCellElement, data: any) => void;
}

export interface TriStateColSpec extends ColumnSpecification {
  type: 'tri-state';
  triStateInput?: boolean; // defaults to false
  // true, false, null
  boolNames?: [string, string, string];
  dataToCell?: ((data: any) => boolean | null) | null;
  cellToData?: ((cell: boolean | null) => any) | null;
}

export type ValidColSpec =
  | StaticColSpec
  | SingleLineTextColSpec
  | MultiLineTextColSpec
  | TextColSpec
  | LinkTextColSpec
  | PasswordTextColSpec
  | BoolColSpec
  | OptionColSpec
  | NumberColSpec
  | CustomColSpec
  | TriStateColSpec;

const passwordTextCopyListener = function (e: UIEvent) {
  const img = e.currentTarget as HTMLImageElement;
  const td = img.parentElement as HTMLTableCellElement;
  const pre = td.getElementsByTagName('pre')[0];
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pre.innerText);
    console.log('copy password successful');
    return;
  }
  pre.style.display = '';
  const range = document.createRange();
  range.selectNode(pre);
  window.getSelection()?.addRange(range);
  try {
    const successful = document.execCommand('copy');
    console.log(`copy password ${successful ? 'successful' : 'unsuccessful'}`);
  } catch (err) {
    console.log('copy password error', err);
  }
  window.getSelection()?.removeAllRanges();
  pre.style.display = 'none';
};

export function copyTextToClipboard(text: string) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    console.log('copy password successful');
    return;
  }
  window.getSelection()?.removeAllRanges();
  const pre = document.createElement('pre');
  pre.innerText = text;
  const range = document.createRange();
  range.selectNode(pre);
  window.getSelection()?.addRange(range);
  try {
    const successful = document.execCommand('copy');
    console.log(`copy password ${successful ? 'successful' : 'unsuccessful'}`);
  } catch (err) {
    console.log('copy password error', err);
  }
  window.getSelection()?.removeAllRanges();
  pre.remove();
}

function dispStatic(cs: ValidColSpec, td: HTMLTableDataCellElement, data: any) {
  switch (cs.type) {
    case 'static':
    case 'single-line-text':
    case 'multi-line-text':
    case 'text':
      {
        const str =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <string>data;
        td.innerText = str;
      }
      break;
    case 'link-text':
      {
        const str =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <string>data;
        td.innerHTML = '';
        const a = document.createElement('a');
        a.href = str;
        a.innerText = 'Link';
        td.appendChild(a);
      }
      break;
    case 'password-text':
      {
        const str =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <string>data;
        td.innerText = '\u2022'.repeat(str.length);
        const pre = document.createElement('pre');
        pre.innerText = str;
        pre.style.display = 'none';
        td.appendChild(pre);
        const img = makeIconImage('copy', passwordTextCopyListener);
        td.appendChild(img);
      }
      break;
    case 'option':
      {
        const optKey =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <string>data;
        td.innerText = cs.options.find((x) => x.key === optKey)?.title || '';
      }
      break;
    case 'boolean':
      {
        const b =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <boolean>data;
        td.innerText = (cs.boolNames || ['False', 'True'])[b ? 1 : 0];
      }
      break;
    case 'tri-state':
      {
        const b =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <boolean | null>data;
        td.innerText = (cs.boolNames || ['False', 'True', 'N/A'])[
          b == null ? 2 : b ? 1 : 0
        ];
      }
      break;
    case 'number':
      {
        const num =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <number>data;
        if (typeof cs.numToStaticStr === 'function') {
          td.innerText = cs.numToStaticStr(num);
        } else {
          td.innerText = '' + num;
        }
      }
      break;
    case 'custom':
      {
        td.innerHTML = '';
        cs.staticTdFromData(td, data);
      }
      break;
  }
}

function getData(cs: ValidColSpec, td: HTMLTableCellElement): any {
  switch (cs.type) {
    case 'static':
      throw new TypeError('cannot convert static table cell element to data');
    case 'single-line-text':
    case 'multi-line-text':
    case 'text':
    case 'link-text':
    case 'password-text':
    case 'option': {
      const elem = <HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>(
        td.children[0]
      );
      const data =
        typeof cs.cellToData === 'function'
          ? cs.cellToData(elem.value)
          : elem.value;
      return data;
    }
    case 'boolean': {
      const elem = <HTMLInputElement>td.children[0];
      const data =
        typeof cs.cellToData === 'function'
          ? cs.cellToData(elem.checked)
          : elem.checked;
      return data;
    }
    case 'tri-state': {
      let innerData: boolean | null = null;
      if (cs.triStateInput) {
        const elem = <HTMLSelectElement>td.children[0];
        innerData = elem.value === 'null' ? null : elem.value === 'true';
      } else {
        const elem = <HTMLInputElement>td.children[0];
        innerData = elem.checked;
      }
      return typeof cs.cellToData === 'function'
        ? cs.cellToData(innerData)
        : innerData;
    }
    case 'number': {
      const elem = <HTMLInputElement>td.children[0];
      const num =
        typeof cs.valueToNum === 'function'
          ? cs.valueToNum(elem.value)
          : +elem.value;
      const data =
        typeof cs.cellToData === 'function' ? cs.cellToData(num) : num;
      return data;
    }
    case 'custom':
      return cs.dataFromEditableTd(td);
  }
}

function dispEdit(
  cs: ValidColSpec,
  td: HTMLTableCellElement,
  data: any,
  wholeData: { [key: string]: any }
) {
  if (cs.editIsStatic) {
    dispStatic(cs, td, data);
    return;
  }
  switch (cs.type) {
    case 'static':
      {
        const str =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <string>data;
        td.innerText = str;
      }
      break;
    case 'single-line-text':
    case 'multi-line-text':
    case 'text':
    case 'link-text':
    case 'password-text':
      {
        const str =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <string>data;
        const isMultiLine =
          cs.type === 'text'
            ? wholeData[cs.attrNameIsMultiLine]
            : cs.type === 'multi-line-text';
        const elem = document.createElement(isMultiLine ? 'textarea' : 'input');
        if (
          cs.type === 'single-line-text' ||
          cs.type === 'link-text' ||
          cs.type == 'password-text'
        ) {
          (<HTMLInputElement>elem).type = 'text';
          elem.style.width = '100%';
          // elem.style.height = 'fit-content'
        }
        elem.value = str;
        td.innerHTML = '';
        td.appendChild(elem);
      }
      break;
    case 'option':
      {
        const elem = document.createElement('select');
        cs.options.forEach((opt) => {
          const optElem = document.createElement('option');
          optElem.value = opt.key;
          optElem.innerText = opt.title;
          elem.appendChild(optElem);
        });
        elem.value =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <string>data;
        td.innerHTML = '';
        td.appendChild(elem);
      }
      break;
    case 'tri-state':
      if (cs.triStateInput) {
        const elem = document.createElement('select');
        const vals = ['true', 'false', 'null'];
        (cs.boolNames || vals).forEach((opt, i) => {
          const optElem = document.createElement('option');
          optElem.value = vals[i];
          optElem.innerText = opt;
          elem.appendChild(optElem);
        });
        elem.value =
          '' +
          (typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <boolean | null>data);
        td.innerHTML = '';
        td.appendChild(elem);
        break;
      }
    case 'boolean':
      {
        const elem = document.createElement('input');
        elem.type = 'checkbox';
        const b =
          typeof cs.dataToCell === 'function' ? !!cs.dataToCell(data) : !!data;
        elem.checked = b;
        td.innerHTML = '';
        td.appendChild(elem);
      }
      break;
    case 'number':
      {
        const elem = document.createElement('input');
        elem.type = 'number';
        const num =
          typeof cs.dataToCell === 'function'
            ? cs.dataToCell(data)
            : <number>data;
        if (typeof cs.numToValue === 'function') {
          elem.value = cs.numToValue(num);
        } else {
          elem.value = '' + num;
        }
        if (cs.min != null) {
          if (typeof cs.min === 'string') {
            elem.min = cs.min;
          } else {
            elem.min = '' + cs.min;
          }
        }
        if (cs.max != null) {
          if (typeof cs.max === 'string') {
            elem.max = cs.max;
          } else {
            elem.max = '' + cs.max;
          }
        }
        if (cs.step != null) {
          if (typeof cs.step === 'string') {
            elem.step = cs.step;
          } else {
            elem.step = '' + cs.step;
          }
        }
        td.innerHTML = '';
        td.appendChild(elem);
      }
      break;
    case 'custom':
      cs.editableTdFromData(td, data);
      break;
  }
}

const iconPaths = {
  add: '/icons/add.svg',
  done: '/icons/done.svg',
  cancel: '/icons/close.svg',
  edit: '/icons/edit.svg',
  delete: '/icons/delete_outline.svg',
  copy: '/icons/copy.svg',
};

export function makeIconImage(
  action: string,
  listener:
    | ((this: SVGSVGElement, ev: MouseEvent) => any)
    | { handleEvent: (ev: MouseEvent) => any }
): HTMLImageElement | SVGSVGElement {
  const svg = createIcon(action, listener);
  svg.setAttribute('data-action', action);
  svg.style.width = '24px';
  svg.style.height = '24px';
  return svg;
}

export class SearchHelper {
  test: (str: string) => boolean;
  constructor(test: (str: string) => boolean) {
    this.test = test;
  }
}

export const MSG_ADDED = 0;
export const MSG_CHANGED = 1;
export const MSG_REMOVED = 2;

export class EditTable {
  tbl: HTMLTableElement;
  thead: HTMLTableSectionElement;
  tbody: HTMLTableSectionElement;
  colSpec: ValidColSpec[];
  backingData: { [key: string]: any }[];
  controlColumn: number;
  allowAddRemove: boolean;
  createDefaultData: null | ((arg: EditTable) => { [key: string]: any });
  onChangeCallback:
    | null
    | ((arg: EditTable, dataIndex: number, msg: 0 | 1 | 2) => void);
  constructor(
    backingData: { [key: string]: any }[],
    tbl: HTMLTableElement,
    colSpec: ValidColSpec[],
    allowAddRemove: boolean = false
  ) {
    this.tbl = tbl;
    this.thead = tbl.tHead as typeof this.thead;
    this.tbody = tbl.tBodies[0];
    this.colSpec = colSpec;
    this.backingData = backingData;
    this.controlColumn = this.colSpec.length;
    this.allowAddRemove = allowAddRemove;
    this.createDefaultData = null;
    this.onChangeCallback = null;
    if (this.allowAddRemove) {
      const th = this.thead.rows[0].cells[this.controlColumn];
      const addImg = makeIconImage('add', this);
      th.appendChild(addImg);
    }
  }
  search(re: RegExp | SearchHelper, col: number = 0) {
    const rows = this.tbody.rows;
    for (let i = 0; i < rows.length; ++i) {
      const tr = rows[i];
      tr.style.display = re.test(tr.cells[col].innerText) ? '' : 'none';
    }
  }
  makeEditable(tr: HTMLTableRowElement) {
    const dataIndex = tr.rowIndex - 1;
    const rowData = this.backingData[dataIndex];
    for (let i = 0; i < this.colSpec.length; ++i) {
      const td = tr.cells[i];
      const cs = this.colSpec[i];
      const data = rowData[cs.attrName];
      dispEdit(cs, td, data, rowData);
      const inputs = td.getElementsByTagName('input');
      for (let i = 0; i < inputs.length; ++i) {
        inputs[i].addEventListener('keydown', this);
      }
      const textareas = td.getElementsByTagName('textarea');
      for (let i = 0; i < textareas.length; ++i) {
        textareas[i].addEventListener('keydown', this);
      }
    }
    const control = tr.cells[this.controlColumn];
    control.innerHTML = '';
    const doneImg = makeIconImage('done', this);
    const closeImg = makeIconImage('close', this);
    control.appendChild(doneImg);
    control.appendChild(closeImg);
  }
  makeStatic(tr: HTMLTableRowElement) {
    const dataIndex = tr.rowIndex - 1;
    const rowData = this.backingData[dataIndex];
    for (let i = 0; i < this.colSpec.length; ++i) {
      const td = tr.cells[i];
      const cs = this.colSpec[i];
      const data = rowData[cs.attrName];
      dispStatic(cs, td, data);
    }
    if (rowData._doEditButtons == null || rowData._doEditButtons) {
      const control = tr.cells[this.controlColumn];
      control.innerHTML = '';
      const editImg = makeIconImage('edit', this);
      control.appendChild(editImg);
      editImg.addEventListener('click', this);
      if (this.allowAddRemove) {
        const removeImg = makeIconImage('delete', this);
        control.appendChild(removeImg);
        removeImg.addEventListener('click', this);
      }
    }
  }
  saveRow(tr: HTMLTableRowElement): boolean {
    const dataIndex = tr.rowIndex - 1;
    const rowData = this.backingData[dataIndex];
    let changed = false;
    for (let i = 0; i < this.colSpec.length; ++i) {
      const td = tr.cells[i];
      const cs = this.colSpec[i];
      if (cs.type === 'static' || cs.editIsStatic) {
        continue;
      }
      const oldData = rowData[cs.attrName];
      const newData = getData(cs, td);
      if (newData !== oldData) {
        changed = true;
        rowData[cs.attrName] = newData;
      }
    }
    return changed;
  }
  doneRow(tr: HTMLTableRowElement) {
    const changed = this.saveRow(tr);
    this.makeStatic(tr);
    if (changed) {
      this.onChangeCallback?.(this, tr.rowIndex - 1, MSG_CHANGED);
    }
  }
  addRow(alterRow: null | ((row: { [key: string]: any }) => any)) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td>'.repeat(this.colSpec.length + 1);
    const row =
      typeof this.createDefaultData === 'function'
        ? this.createDefaultData(this)
        : {};
    if (typeof alterRow === 'function') {
      alterRow(row);
    }
    this.backingData.push(row);
    this.onChangeCallback?.(this, tr.rowIndex - 1, MSG_ADDED);
    this.tbody.appendChild(tr);
    this.makeEditable(tr);
  }
  handleEvent(e: UIEvent) {
    const tgt = <HTMLElement>e.currentTarget;
    if (tgt.parentElement == null) return;
    if (tgt.getAttribute('data-action') != null) {
      const action = tgt.getAttribute('data-action');
      const tr = tgt.parentElement.parentElement as HTMLTableRowElement;
      if (action === 'done') {
        this.doneRow(tr);
      } else if (action === 'close') {
        this.makeStatic(tr);
      } else if (action === 'edit') {
        this.makeEditable(tr);
      } else if (action === 'add') {
        this.addRow(null);
      } else {
        // action === 'delete'
        const dataIndex = tr.rowIndex - 1;
        tr.parentElement?.removeChild(tr);
        this.backingData.splice(dataIndex, 1);
        this.onChangeCallback?.(this, dataIndex, MSG_REMOVED);
      }
    } else if (e.type === 'keydown' && tgt.parentElement.tagName === 'TD') {
      const tr = tgt.parentElement.parentElement as HTMLTableRowElement;
      if (tgt.tagName === 'INPUT') {
        if ((e as KeyboardEvent).keyCode === 13) {
          this.doneRow(tr);
          e.preventDefault();
        }
      } else if (tgt.tagName === 'TEXTAREA') {
        if (
          (e as KeyboardEvent).ctrlKey &&
          (e as KeyboardEvent).keyCode === 13
        ) {
          this.doneRow(tr);
          e.preventDefault();
        }
      }
    }
  }
}
