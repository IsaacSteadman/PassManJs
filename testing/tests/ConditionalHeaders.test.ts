import { describe, it } from '@jest/globals';
import {
  parseDateHeader,
  stringifyDateHeader,
} from '../../dist-server/utils/ConditionalHeaders';

describe('ConditionalHeaders', () => {
  it.each([
    1645048777882, 1660073362367, 1667361570088, 1670052794208, 1667466389841,
    1644538483914, 1655573672145, 1652919420643, 1648400386138, 1668854938465,
  ])('specific timestamp', (timeStamp) => {
    const date = new Date(timeStamp);
    const stringified = stringifyDateHeader(date);
    const parsed = parseDateHeader(stringified);
    if (parsed == null) {
      throw {
        result: 'fail',
        date,
        stringified,
        parsed,
      };
    }
    const diff = parsed.getTime() - date.getTime();
    if (diff < 1000) {
      if (diff) {
        console.log({ result: 'too-loose', date, stringified, parsed, diff });
      } else {
        console.log({
          result: 'pass',
          date,
          stringified,
          parsed,
        });
      }
    } else {
      throw {
        result: 'fail',
        date,
        stringified,
        parsed,
      };
    }
  });
});
