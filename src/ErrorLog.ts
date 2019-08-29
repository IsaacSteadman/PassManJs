export class ErrorLog {
  errorPanel: HTMLDivElement;
  pre: HTMLPreElement;
  constructor(errorPanel: HTMLDivElement) {
    this.errorPanel = errorPanel;
    this.pre = errorPanel.getElementsByTagName('pre')[0];
  }
  logError(err: Error | Object) {
    if (err instanceof Error) {
      this.pre.innerText += '\n' + err;
    } else {
      this.pre.innerText += '\n' + JSON.stringify(err, null, 2);
    }
  }
}
