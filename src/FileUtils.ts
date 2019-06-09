const frDispatch = [
  FileReader.prototype.readAsArrayBuffer,
  FileReader.prototype.readAsBinaryString,
  FileReader.prototype.readAsDataURL,
  FileReader.prototype.readAsText
];
export const FR_AS_ARR_BUF = 0;
export const FR_AS_BIN_STR = 1;
export const FR_AS_DAT_URL = 2;
export const FR_AS_TXT = 3;
export function getPromiseFileReader(blob: Blob, readType: 0 | 1 | 2 | 3): Promise<string | ArrayBuffer> {
  const reader = new FileReader();
  return new Promise(function (resolve, reject) {
    reader.addEventListener('error', function (e) {
      reject((<FileReader>e.target).error);
    });
    reader.addEventListener('load', function (e) {
      resolve((<FileReader>e.target).result);
    });
    frDispatch[readType].call(reader, blob);
  });
}
export function escapeString(strOrig: string): string {
  let rtn = '';
  const ZERO = '0'.charCodeAt(0);
  const btnvfr = 'btnvfr';
  for (let c = 0; c < strOrig.length; ++c) {
    const v = strOrig.charCodeAt(c);
    if (v < 0x20 || v >= 0x7F) {
      if (v >= 0x08 && v <= 0x0d) {
        rtn += '\\' + btnvfr.charAt(v - 0x08);
      } else if (v === 0) {
        rtn += '\\0';
        const v1 = strOrig.charCodeAt(c + 1) - ZERO;
        if (v1 >= 0 && v1 < 10) {
          rtn += '00';
        }
      } else if (v > 0x00 && v <= 0xff) {
        const a0 = v & 0xf;
        const a1 = v & 0xf0 >> 4;
        rtn += '\\x' + a1 + a0;
      } else {
        const a0 = v & 0xf;
        const a1 = v & 0xf0 >> 4;
        const a2 = v & 0xf00 >> 8;
        const a3 = v & 0xf000 >> 12;
        rtn += '\\u' + a3 + a2 + a1 + a0;
      }
    } else if (v === 0x22 || v === 0x27 || v === 0x5c) {
      rtn += '\\' + strOrig.charAt(c);
    } else {
      rtn += strOrig.charAt(c);
    }
  }
  return rtn;
}
export function unescapeString(str: string): string {
  let rtn = '';
  let c = 0;
  const btnvfr = 'btnvfr';
  const ZERO = '0'.charCodeAt(0);
  while (c < str.length) {
    let c1;
    if ((c1 = str.indexOf('\\', c)) === -1) {
      break;
    }
    rtn += str.substring(c, c1);
    ++c1;
    const ch = str.charAt(c1);
    let pos = btnvfr.indexOf(ch);
    if (pos !== -1) {
      rtn += String.fromCharCode(pos + 0x08);
      c = c1 + 1;
      continue;
    }
    let val = ch.charCodeAt(0);
    if (val >= ZERO && val < ZERO + 8) {
      pos = 0;
      val -= ZERO;
      while (val >= 0 && val < 8 && pos < 3) {
        ++pos;
        if (pos > str.length) val = -1;
        else val = str.charCodeAt(c1 + pos) - ZERO;
      }
      val = Number('0o' + str.substr(c1, pos));
      rtn += String.fromCharCode(val);
      c = c1 + pos;
      continue;
    }
    ++c1;
    switch (ch) {
      case 'x':
        val = Number('0x' + str.substring(c1, c1 += 2));
        break;
      case 'u':
        val = Number('0x' + str.substring(c1, c1 += 4));
        break;
      case 'U':
        val = Number('0x' + str.substring(c1, c1 += 8));
        break;
      case '\'':
        val = 0x27;
        break;
      case '"':
        val = 0x22;
        break;
      case '\\':
        val = 0x5c;
        break;
      default:
        // val is the charCode of the character
        rtn += '\\';
        break;
    }
    rtn += String.fromCodePoint === undefined ? String.fromCharCode(val) : String.fromCodePoint(val);
    c = c1;
  }
  rtn += str.substring(c);
  return rtn;
}
export function readCSV(data: string, lineSep?: string): string[][] {
  if (lineSep == null) {
    if (data.indexOf('\r\n') !== -1) {
      lineSep = '\r\n';
    } else if (data.indexOf('\r') !== -1) {
      lineSep = '\r';
    } else {
      lineSep = '\n';
    }
  }
  const rows: string[][] = [[]];
  let curRow = rows[0];
  let curCell = '';
  let c = 0;
  while (c < data.length) {
    let iQ = data.indexOf('"', c);
    if (iQ === -1) iQ = data.length;
    let iC = data.indexOf(',', c);
    if (iC === -1) iC = data.length;
    let iL = data.indexOf(lineSep, c);
    if (iL === -1) iL = data.length;
    if (iQ < iC && iQ < iL) {
      let backslash = false;
      for (let c1 = iQ + 1; c1 < data.length; ++c1) {
        if (backslash) {
          backslash = false;
        } else if (data.charAt(c1) === '\\') {
          backslash = true;
        } else if (data.charAt(c1) === '"') {
          curCell += data.substring(c, c1 + 1);
          c = c1 + 1;
          break;
        }
      }
    } else if (iC < iQ && iC < iL) {
      curCell += data.substring(c, iC);
      curRow.push(curCell);
      curCell = '';
      c = iC + 1;
    } else if (iL < iC && iL < iQ) {
      curCell += data.substring(c, iL);
      curRow.push(curCell);
      curCell = '';
      rows.push(curRow = []); // single '=' is intentional
      c = iL + lineSep.length;
    } else {
      curCell += data.substring(c);
      curRow.push(curCell);
      curCell = '';
      c = data.length;
    }
  }
  const nCols = rows.length ? rows[0].length : 0;
  while (rows.length && rows[rows.length - 1].length === 0) {
    rows.pop();
  }
  for (let c = 0; c < rows.length; ++c) {
    const row = rows[c];
    if (row.length !== nCols) {
      throw new Error(`row ${c + 1} had ${row.length} elements when ${nCols} are expected`);
    }
    for (let c1 = 0; c1 < row.length; ++c1) {
      if (!row[c1].startsWith('"')) continue;
      row[c1] = unescapeString(row[c1].substring(1, row[c1].length - 1));
    }
  }
  return rows;
}
export function readCSV1(data, lineSep) {
  if (lineSep == null) {
    if (data.indexOf('\r\n') !== -1) {
      lineSep = '\r\n';
    } else if (data.indexOf('\r') !== -1) {
      lineSep = '\r';
    } else {
      lineSep = '\n';
    }
  }
  const rows = [];
  let line;
  let pos = 0;
  let posOrig = 0;
  let noLineSep;
  pos = data.indexOf(lineSep, posOrig);
  noLineSep = pos === -1;
  if (noLineSep) {
    line = data.substring(posOrig);
  } else {
    line = data.substring(posOrig, pos);
    posOrig = pos + lineSep.length;
  }
  while (line.length > 0 || !noLineSep) {
    if (line.length === 0) {
      continue;
    }
    const cur = [];
    let cur1 = '';
    for (let c = 0; c < line.length;) {
      if (line.charAt(c) === '"') {
        const tmp = c;
        ++c;
        while (c < line.length && line.charAt(c) !== '"') {
          if (line.charAt(c) === '\\')++c;
          ++c;
        }
        ++c;
        cur1 += line.substring(tmp, c);
      } else if (line.charAt(c) === ',') {
        cur.push(cur1);
        cur1 = '';
        ++c;
      } else {
        cur1 += line.charAt(c);
        ++c;
      }
    }
    cur.push(cur1);
    rows.push(cur);
    if (!noLineSep) {
      pos = data.indexOf(lineSep, pos + lineSep.length);
      noLineSep = pos === -1;
      if (noLineSep) {
        line = data.substring(posOrig);
      } else {
        line = data.substring(posOrig, pos);
        posOrig = pos + lineSep.length;
      }
    } else {
      line = '';
    }
  }
  const tmp = rows.length > 0 ? rows[0].length : 0;
  for (let c = 0; c < rows.length; ++c) {
    const cur = rows[c];
    if (cur.length !== tmp) {
      throw new Error('row ' + (c + 1) + ' had ' + cur.length + ' elements when ' + tmp + ' are expected');
    }
    for (let c1 = 0; c1 < cur.length; ++c1) {
      if (!cur[c1].startsWith('"')) continue;
      cur[c1] = unescapeString(cur[c1].substring(1, cur[c1].length - 1));
    }
  }
  return rows;
}
