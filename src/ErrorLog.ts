export class ErrorLog {
  errorPanel: HTMLDivElement;
  pre: HTMLPreElement;
  counter: number;
  constructor(errorPanel: HTMLDivElement) {
    this.errorPanel = errorPanel;
    this.pre = errorPanel.getElementsByTagName('pre')[0];
    this.counter = 0;
  }
  clear() {
    this.pre.innerHTML = '';
    this.counter = 0;
  }
  logError(err: Error | Object): number {
    const { counter } = this;
    ++this.counter;
    this.pre.insertAdjacentText('beforeend', '\n');
    this.pre.insertAdjacentHTML(
      'beforeend',
      `<span style="color: orange">[Error ${counter}] </span>`
    );
    this.pre.insertAdjacentText(
      'beforeend',
      `${err instanceof Error ? err : JSON.stringify(err, null, 2)}`
    );
    return counter;
  }
}
