const SVG_NS = 'http://www.w3.org/2000/svg';

function mkPath(d: string): SVGPathElement {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  return p;
}

export function createAddIcon(color: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const p0 = mkPath('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z');
  p0.setAttribute('fill', color);
  const p1 = mkPath('M0 0h24v24H0z');
  svg.appendChild(p0);
  svg.appendChild(p1);
  p1.setAttribute('fill', 'none');
  return svg;
}

export function createTrashOutlineIcon(color: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  const p0 = mkPath('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z');
  p0.setAttribute('fill', color);
  const p1 = mkPath('M0 0h24v24H0V0z');
  svg.appendChild(p0);
  svg.appendChild(p1);
  p1.setAttribute('fill', 'none');
  return svg;
}

const paths = [
  { name: 'add', url: '/icons/add.svg' },
  { name: 'close', url: '/icons/close.svg' },
  { name: 'copy', url: '/icons/copy.svg' },
  { name: 'delete', url: '/icons/delete_outline.svg' },
  { name: 'done', url: '/icons/done.svg' },
  { name: 'edit', url: '/icons/edit.svg' }
];

const svgImages: { [key: string]: SVGSVGElement } = {};

async function loadImages() {
  const images = await Promise.all(paths.map(path => fetch(path.url).then(x => x.text())));
  for (let i = 0; i < images.length; ++i) {
    images[i] = images[i].substring(images[i].indexOf('<svg'));
  }
  const div = document.createElement('div');
  for (let n = 0; n < images.length; ++n) {
    div.innerHTML = images[n];
    const svg = <SVGSVGElement>div.children[0];
    div.removeChild(svg);
    svgImages[paths[n].name] = svg;
  }
  return svgImages;
}

export const loadedImagesPromise = loadImages();

class CustomAnimation {
  elem: HTMLElement | SVGElement;
  intervalIndex: number;
  style: { [key: string]: (index: number) => string; };
  numFrames: number;
  durationMs: number;
  interval: any;
  attrs: { [key: string]: (index: number) => string; };
  clearAtEnd: boolean;
  endData: [{ [key: string]: string }, { [key: string]: string }];
  constructor(
    style: { [key: string]: (index: number) => string },
    attrs: { [key: string]: (index: number) => string },
    durationMs: number,
    numFrames: number,
    clearAtEnd: boolean = true,
    endData: [{ [key: string]: string }, { [key: string]: string }] = null
  ) {
    this.interval = null;
    this.intervalIndex = 0;
    this.style = style;
    this.attrs = attrs;
    this.elem = null;
    this.numFrames = numFrames;
    this.durationMs = durationMs;
    this.clearAtEnd = clearAtEnd;
    this.endData = endData;
  }
  stepInterval() {
    let i = this.intervalIndex++;
    if (i >= this.numFrames) {
      i = 0;
      clearInterval(this.interval);
      this.interval = null;
      if (!this.clearAtEnd) return;
      if (this.endData != null) {
        const [style, attrs] = this.endData;
        const {elem} = this;
        for (const k in style) {
          const attr = style[k];
          elem.style[k] = attr;
        }
        for (const k in attrs) {
          const attr = attrs[k];
          elem.setAttribute(k, attr);
        }
        return;
      }
    }
    const { style, attrs, elem } = this;
    for (const k in style) {
      const attr = style[k](i);
      elem.style[k] = attr;
    }
    for (const k in attrs) {
      const attr = attrs[k](i);
      elem.setAttribute(k, attr);
    }
  }
  execute(elem: SVGElement | HTMLElement) {
    this.elem = elem;
    if (this.interval != null) {
      clearInterval(this.interval);
    }
    this.intervalIndex = 0;
    this.stepInterval();
    this.interval = setInterval(() => this.stepInterval(), this.durationMs / this.numFrames);
  }
  stop() {
    if (this.interval != null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

function easeIn(t: number, p: number) {
  return Math.pow(t, p);
}

function easeOut(t: number, p: number) {
  return 1 - Math.pow(1 - t, p);
}

const rippleAnim = new CustomAnimation(
  {}, {
    r: (index) => '' + (12 * easeOut(index / 25, 3))
  }, 300, 42, false
);

const otherRipple = new CustomAnimation(
  {}, {
    'opacity': (index) => '' + 0.2 * (1 - easeIn(index / 42, 2))
  }, 500, 42, false, [{}, { 'opacity': '0.2', 'r': '0' }]
);

function doRippleEffect(ev: MouseEvent) {
  const tgt = <SVGSVGElement>ev.currentTarget;
  const circle = tgt.getElementsByTagName('circle')[0];
  circle.setAttribute('opacity', '0.2');
  rippleAnim.execute(circle);
  const fn = () => {
    rippleAnim.stop();
    otherRipple.execute(circle);
    tgt.removeEventListener('mouseup', fn);
    tgt.removeEventListener('mouseleave', fn);
    tgt.removeEventListener('touchend', fn);
  };
  tgt.addEventListener('mouseup', fn);
  tgt.addEventListener('mouseleave', fn);
  tgt.addEventListener('touchend', fn);
}

export function createIcon(action: string, clickListener: ((this: SVGSVGElement, ev: MouseEvent) => any) | { handleEvent: (ev: MouseEvent) => any }): SVGSVGElement {
  const svg = <SVGSVGElement>svgImages[action].cloneNode(true);
  svg.addEventListener('click', clickListener);
  if (action === 'copy') {
    svg.addEventListener('mousedown', doRippleEffect);
    svg.addEventListener('touchstart', doRippleEffect);
  }
  return svg;
}
