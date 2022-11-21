export function stringToArrayBuffer(str: string): ArrayBuffer {
  const enc = new TextEncoder();
  return enc.encode(str).buffer;
}
export function concatBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
  const res = new ArrayBuffer(a.byteLength + b.byteLength);
  {
    const src = new Uint8Array(a);
    const dst = new Uint8Array(res, 0, src.length);
    for (let i = 0; i < src.length; ++i) {
      dst[i] = src[i];
    }
  }
  {
    const src = new Uint8Array(b);
    const dst = new Uint8Array(res, a.byteLength, src.length);
    for (let i = 0; i < src.length; ++i) {
      dst[i] = src[i];
    }
  }
  return res;
}
export function arrayBufferToString(buf: ArrayBuffer) {
  const dec = new TextDecoder();
  return dec.decode(buf);
}
const CODE_0 = '0'.charCodeAt(0);
const CODE_A = 'A'.charCodeAt(0) - 10;
const CODE_a = 'a'.charCodeAt(0) - 10;

export function hexStringToUint8Array(str: string): Uint8Array {
  if (str.length & 1) throw new Error('expected even length');
  const arr = new Uint8Array(str.length >> 1);
  for (let i = 0, j = 0; i < str.length; i += 2, ++j) {
    const msd = str.charCodeAt(i);
    let msv = msd - CODE_0;
    if (msv >= 10) {
      msv = msd - CODE_A;
      if (msv >= 16) {
        msv = msd - CODE_a;
      } else if (msv < 10) {
        msv = -1;
      }
    }
    if (msv < 0 || msv >= 16) {
      throw new Error(`bad char at pos str.charAt(${i}) = '${str.charAt(i)}'`);
    }
    const lsd = str.charCodeAt(i + 1);
    let lsv = lsd - CODE_0;
    if (lsv >= 10) {
      lsv = lsd - CODE_A;
      if (lsv >= 16) {
        lsv = lsd - CODE_a;
      } else if (lsv < 10) {
        lsv = -1;
      }
    }
    if (lsv < 0 || lsv >= 16) {
      throw new Error(
        `bad char at pos str.charAt(${i + 1}) = '${str.charAt(i + 1)}'`
      );
    }
    arr[j] = (msv << 4) | lsv;
  }
  return arr;
}
const digits = '0123456789abcdef';
export function arrayBufferToHexString(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < arr.length; ++i) {
    str += digits.charAt(arr[i] >> 4) + digits.charAt(arr[i] & 0xf);
  }
  return str;
}
export function generateURLQuery(
  url: string,
  query: { [key: string]: string }
) {
  const arr = Object.keys(query);
  if (arr.length === 0) return url;
  return (
    url + '?' + arr.map((k) => `${k}=${encodeURIComponent(query[k])}`).join('&')
  );
}
export function getUrlParams(url: string): { [key: string]: string } {
  const rtn = {};
  const pos = url.indexOf('?');
  if (pos !== -1) {
    url
      .substring(pos + 1)
      .split('&')
      .forEach((x) => {
        const i = x.indexOf('=');
        rtn[x.substring(0, i)] = decodeURIComponent(x.substring(i + 1));
      });
  }
  return rtn;
}
