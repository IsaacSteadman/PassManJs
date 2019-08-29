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

const svgImages: {[key: string]: SVGSVGElement} = {};

async function loadImages() {
  console.log('loading images');
  const images = await Promise.all(paths.map(path => fetch(path.url).then(x => x.text())));
  for (let i = 0; i < images.length; ++i) {
    images[i] = images[i].substring(images[i].indexOf('<svg'));
  }
  const div = document.createElement('div');
  for (let n = 0; n < images.length; ++n) {
    console.log('using SVG', images[n]);
    div.innerHTML = images[n];
    const svg = <SVGSVGElement>div.children[0];
    div.removeChild(svg);
    svgImages[paths[n].name] = svg;
  }
  console.log('loaded images');
  return svgImages;
}

export const loadedImagesPromise = loadImages();

export function createIcon(action: string): SVGSVGElement {
  return <SVGSVGElement>svgImages[action].cloneNode(true);
}
