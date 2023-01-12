import type { Request } from 'express';
import { lpad } from './lpad';
import type { WrappedFile } from './WrappedFile';

export type Conditions = { ifUnmodifiedSince?: Date; ifModifiedSince?: Date };

export function parseDateHeader(header: string): Date | null {
  const parsed =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), ([012][0-9]|3[01]) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) ([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]) GMT$/.exec(
      header
    );
  if (parsed == null) {
    return null;
  }
  const [whole, day, date, month, year, hours, minutes, seconds] = parsed;
  const monthIndices = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  try {
    return new Date(
      Date.UTC(
        +year,
        monthIndices[month],
        +date,
        +hours,
        +minutes,
        +seconds,
        999
      )
    );
  } catch (exc) {
    return null;
  }
}

export function stringifyDateHeader(dateObj: Date): string {
  const day = 'Sun|Mon|Tue|Wed|Thu|Fri|Sat'.split('|')[dateObj.getUTCDay()];
  const date = lpad(2, dateObj.getUTCDate());
  const month = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'.split('|')[
    dateObj.getUTCMonth()
  ];
  const year = lpad(4, dateObj.getUTCFullYear());
  const hours = lpad(2, dateObj.getUTCHours());
  const minutes = lpad(2, dateObj.getUTCMinutes());
  const seconds = lpad(2, dateObj.getUTCSeconds());
  return `${day}, ${date} ${month} ${year} ${hours}:${minutes}:${seconds} GMT`;
}

export function getConditionsThrow(req: Request): Conditions {
  const unsupportedConditionsAttempted = [
    'if-range',
    'if-match',
    'if-none-match',
  ].filter((header) => req.header(header) != null);
  if (unsupportedConditionsAttempted.length) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_UNSUPPORTED_CONDITIONAL_HEADER',
        message: 'unsupported conditional header was specified',
        unsupportedConditionsAttempted,
      },
    };
  }
  const ifUnmodifiedSinceHeader = req.header('if-unmodified-since');
  const ifModifiedSinceHeader = req.header('if-modified-since');
  const result: Conditions = {};
  const failures: string[] = [];
  if (ifModifiedSinceHeader != null) {
    const parsed = parseDateHeader(ifModifiedSinceHeader);
    if (parsed != null) {
      result.ifModifiedSince = parsed;
    } else {
      failures.push('if-modified-since');
    }
  }
  if (ifUnmodifiedSinceHeader != null) {
    const parsed = parseDateHeader(ifUnmodifiedSinceHeader);
    if (parsed != null) {
      result.ifUnmodifiedSince = parsed;
    } else {
      failures.push('if-unmodified-since');
    }
  }
  if (failures.length) {
    throw {
      type: 'json-response',
      jsonStatus: 400,
      jsonBody: {
        type: 'E_INVAL_CONDITIONAL_HEADER',
        invalidConditionalHeaders: failures,
      },
    };
  }
  return result;
}

const floorRadix = (n: number, radix: number) => n - (n % radix);

export async function checkConditions(
  conditions: Conditions,
  readable: WrappedFile
) {
  const { ifModifiedSince, ifUnmodifiedSince } = conditions;
  const failures: string[] = [];
  if (ifModifiedSince != null || ifUnmodifiedSince != null) {
    const inputMTime = (await readable.getMTime()).getTime();
    const mtime = floorRadix(inputMTime, 1000);

    if (ifModifiedSince != null && mtime <= ifModifiedSince.getTime()) {
      failures.push('if-modified-since');
    }

    if (ifUnmodifiedSince != null && mtime > ifUnmodifiedSince.getTime()) {
      failures.push('if-unmodified-since');
    }
  }
  return failures;
}
