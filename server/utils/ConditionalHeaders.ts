import type { Request, Response } from 'express';

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

function lpad(n: number, s: string, ch: string = '0') {
  return ch.repeat(Math.max(0, n - s.length)) + s;
}

export function stringifyDateHeader(dateObj: Date): string {
  const day = 'Sun|Mon|Tue|Wed|Thu|Fri|Sat'.split('|')[dateObj.getUTCDay()];
  const date = dateObj.getUTCDate();
  const month = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'.split('|')[
    dateObj.getUTCMonth()
  ];
  const year = dateObj.getUTCFullYear();
  const hours = lpad(2, `${dateObj.getUTCHours()}`);
  const minutes = lpad(2, `${dateObj.getUTCMinutes()}`);
  const seconds = lpad(2, `${dateObj.getUTCSeconds()}`);
  return `${day}, ${date} ${month} ${year} ${hours}:${minutes}:${seconds} GMT`;
}

export function getConditions(req: Request, res: Response): Conditions | null {
  const unsupportedConditionsAttempted = [
    'if-range',
    'if-match',
    'if-none-match',
  ].filter((header) => req.header(header) != null);
  if (unsupportedConditionsAttempted.length) {
    res.status(400).json({
      type: 'E_UNSUPPORTED_CONDITIONAL_HEADER',
      message: 'unsupported conditional header was specified',
      unsupportedConditionsAttempted,
    });
    return null;
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
    res.status(400).json({
      type: 'E_INVAL_CONDITIONAL_HEADER',
      invalidConditionalHeaders: failures,
    });
    return null;
  }
  return result;
}
