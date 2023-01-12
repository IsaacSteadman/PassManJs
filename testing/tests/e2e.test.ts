import { beforeEach, describe, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';
import { resolve } from 'path';
import puppeteer, { Dialog, Page } from 'puppeteer';

const serverConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../../config.json'), 'utf8')
);

const serverBaseName = `http://localhost:${serverConfig.Port || 3050}`;

const passManUrl = `${serverBaseName}/?server_ns=&server_pass=test`;

function checkNonNull<T>(x: T): NonNullable<T> {
  if (x == null) {
    throw new Error('unexpected null');
  }
  return x;
}

const timeout = 2000;

interface PwEntry {
  name: string;
  link: string;
  username: string;
  password: string;
}

async function createAccount(
  page: Page,
  { username, password }: { username: string; password: string }
) {
  try {
    console.log('visit', passManUrl);
    await page.goto(passManUrl);
    // click register account
    const elem = await page
      .waitForSelector('#login a', { timeout })
      .then(checkNonNull);
    await elem.click();

    const [usernameElem, newPassElem, confirmNewPassElem, submitElem] =
      await Promise.all([
        page
          .waitForSelector('#register input[name="username"]', { timeout })
          .then(checkNonNull),
        page
          .waitForSelector('#register input[name="new_pass"]', { timeout })
          .then(checkNonNull),
        page
          .waitForSelector('#register input[name="confirm_new_pass"]', {
            timeout,
          })
          .then(checkNonNull),
        page
          .waitForSelector('#register input[type="submit"]', { timeout })
          .then(checkNonNull),
      ]);
    await usernameElem.type(username);
    await newPassElem.type(password);
    await confirmNewPassElem.type(password);
    const pAlert = new Promise((resolve, reject) => {
      const fn = (event: Dialog) => {
        clearTimeout(timeoutId);
        resolve(event);
      };
      page.once('dialog', fn);
      const timeoutId = setTimeout(() => {
        page.off('dialog', fn);
        reject('timed out waiting for alert');
      }, 5000);
    });
    await submitElem.click();
    await pAlert;
    return { username, password };
  } catch (exc) {
    console.log(exc);
    throw exc;
  }
}

async function loginAccount(
  page: Page,
  { username, password }: { username: string; password: string }
) {
  console.log('visit', passManUrl);
  await page.goto(passManUrl);

  const [usernameElem, passwordElem, submitElem] = await Promise.all([
    page
      .waitForSelector('#login input[name="username"]', { timeout })
      .then(checkNonNull),
    page
      .waitForSelector('#login input[name="password"]', { timeout })
      .then(checkNonNull),
    page
      .waitForSelector('#login input[type="submit"]', { timeout })
      .then(checkNonNull),
  ]);
  await usernameElem.evaluate((x) => (x.value = ''));
  await usernameElem.type(username);
  await passwordElem.evaluate((x) => (x.value = ''));
  await passwordElem.type(password);
  await submitElem.click();
  await pageWaitForXPath(page, '//span[contains(text(),"Credit Cards")]', {
    timeout,
  });
}

async function addPasswordLoggedInAccount(
  page: Page,
  { name, link, username, password }: PwEntry
) {
  const passwordTableDiv = await page
    .waitForSelector('#content>div>div:first-child', { timeout })
    .then(checkNonNull);
  const addPasswordButton = await passwordTableDiv
    .waitForSelector('thead>tr>th:last-child', { timeout })
    .then(checkNonNull);
  await addPasswordButton.click();
  const newPasswordRow = await passwordTableDiv
    .waitForSelector('tbody>tr:last-child', { timeout })
    .then(checkNonNull);

  const [nameEntry, linkEntry, usernameEntry, passwordEntry, saveButton] =
    await Promise.all([
      newPasswordRow
        .waitForSelector('td:nth-child(1) textarea', { timeout })
        .then(checkNonNull),
      newPasswordRow
        .waitForSelector('td:nth-child(2) input', { timeout })
        .then(checkNonNull),
      newPasswordRow
        .waitForSelector('td:nth-child(3) textarea', { timeout })
        .then(checkNonNull),
      newPasswordRow
        .waitForSelector('td:nth-child(4) input', { timeout })
        .then(checkNonNull),
      newPasswordRow
        .waitForSelector('td:nth-child(5) svg:first-child', { timeout })
        .then(checkNonNull),
    ]);

  await nameEntry.type(name);
  await linkEntry.type(link);
  await usernameEntry.type(username);
  await passwordEntry.type(password);
  await saveButton.click();
}

async function pageWaitForXPath(
  page: Page,
  xpath: string,
  options?: { timeout?: number }
): Promise<NonNullable<Awaited<ReturnType<Page['waitForXPath']>>>> {
  console.log('pageWaitForXPath', xpath, options);
  const elem = await page.waitForXPath(xpath, options);

  if (elem == null) {
    throw new Error('expected not null');
  }
  return elem;
}

async function deletePasswordLoggedInAccount(
  page: Page,
  entryIndex: number,
  { name }: { name: string }
) {
  const deletePasswordRow = await page
    .waitForSelector(
      `#content div[name="data"]>div:first-child tbody>tr:nth-child(${
        entryIndex + 1
      })`,
      { timeout }
    )
    .then(checkNonNull);
  const [testName, deleteButton] = await Promise.all([
    deletePasswordRow
      .waitForSelector('td:nth-child(1)', { timeout })
      .then(checkNonNull),
    deletePasswordRow
      .waitForSelector('td:last-child>:last-child', { timeout })
      .then(checkNonNull),
  ]);
  assertEquals(
    await (await testName.getProperty('innerText')).jsonValue(),
    name
  );
  await deleteButton.click();
}

async function editPasswordLoggedInAccount(
  page: Page,
  entryIndex: number,
  { name: oldName }: { name: string },
  { name, link, username, password }: PwEntry
) {
  console.log('editPasswordLoggedInAccount:step0');
  const editPasswordRow = await page
    .waitForSelector(
      `#content div[name="data"]>div:first-child tbody>tr:nth-child(${
        entryIndex + 1
      })`,
      { timeout }
    )
    .then(checkNonNull);
  console.log('editPasswordLoggedInAccount:step1');
  {
    console.log('editPasswordLoggedInAccount:step2');
    const [testName, editButton] = await Promise.all([
      editPasswordRow
        .waitForSelector('td:nth-child(1)', { timeout })
        .then(checkNonNull),
      editPasswordRow
        .waitForSelector('td:last-child>:first-child', { timeout })
        .then(checkNonNull),
    ]);
    console.log('editPasswordLoggedInAccount:step3');
    assertEquals(
      await (await testName.getProperty('innerText')).jsonValue(),
      oldName
    );
    console.log('editPasswordLoggedInAccount:step4');
    await editButton.click();
  }
  try {
    console.log('editPasswordLoggedInAccount:step5');
    const [nameEntry, linkEntry, usernameEntry, passwordEntry, saveButton] =
      await Promise.all([
        editPasswordRow
          .waitForSelector('td:nth-child(1) textarea', { timeout })
          .then(checkNonNull)
          .then((x) => {
            console.log('editPasswordLoggedInAccount:step5:nameEntry DONE');
            return x;
          }),
        editPasswordRow
          .waitForSelector('td:nth-child(2) input', { timeout })
          .then(checkNonNull)
          .then((x) => {
            console.log('editPasswordLoggedInAccount:step5:linkEntry DONE');
            return x;
          }),
        editPasswordRow
          .waitForSelector('td:nth-child(3) textarea', { timeout })
          .then(checkNonNull)
          .then((x) => {
            console.log('editPasswordLoggedInAccount:step5:usernameEntry DONE');
            return x;
          }),
        editPasswordRow
          .waitForSelector('td:nth-child(4) input', { timeout })
          .then(checkNonNull)
          .then((x) => {
            console.log('editPasswordLoggedInAccount:step5:passwordEntry DONE');
            return x;
          }),
        editPasswordRow
          .waitForSelector('td:nth-child(5) svg:first-child', { timeout })
          .then(checkNonNull)
          .then((x) => {
            console.log('editPasswordLoggedInAccount:step5:saveButton DONE');
            return x;
          }),
      ]);

    console.log('editPasswordLoggedInAccount:step5');
    await nameEntry.evaluate((x) => {
      x.value = '';
    });
    console.log('editPasswordLoggedInAccount:step6');
    await nameEntry.type(name);
    console.log('editPasswordLoggedInAccount:step7');
    await linkEntry.evaluate((x) => {
      x.value = '';
    });
    console.log('editPasswordLoggedInAccount:step8');
    await linkEntry.type(link);
    console.log('editPasswordLoggedInAccount:step9');
    await usernameEntry.evaluate((x) => {
      x.value = '';
    });
    console.log('editPasswordLoggedInAccount:step10');
    await usernameEntry.type(username);
    console.log('editPasswordLoggedInAccount:step11');
    await passwordEntry.evaluate((x) => {
      x.value = '';
    });
    console.log('editPasswordLoggedInAccount:step12');
    await passwordEntry.type(password);
    console.log('editPasswordLoggedInAccount:step13');
    await saveButton.click();
    console.log('editPasswordLoggedInAccount:step14');
  } catch (exc) {
    console.log('error in editPasswordLoggedInAccount');
    throw exc;
  }
}

function assertEquals(actual: string, expected: string, message: string = '') {
  if (actual !== expected) {
    throw new Error(
      `expected = ${JSON.stringify(expected)}, actual = ${JSON.stringify(
        actual
      )}${message.length > 0 ? `, message: ${message}` : ''}`
    );
  }
}

function assertStringObjectEquals<T extends Record<string, string>>(
  actual: T,
  expected: T,
  message: string = ''
) {
  if (typeof actual === typeof expected) {
    const aKeys = Object.keys(actual).sort();
    const eKeys = Object.keys(expected).sort();
    if (
      eKeys.length === aKeys.length &&
      eKeys.every(
        (ek, idx) => ek === aKeys[idx] && expected[ek] === actual[aKeys[idx]]
      )
    ) {
      return;
    }
  }
  throw new Error(
    `expected = ${JSON.stringify(expected, null, 2)}, actual = ${JSON.stringify(
      actual,
      null,
      2
    )}${message.length > 0 ? `, message: ${message}` : ''}`
  );
}

async function checkPasswordLoggedInAccount(
  page: Page,
  entryIndex: number,
  { name, link, username, password }: PwEntry
) {
  console.log('checkPasswordLoggedInAccount:step1');
  const testPasswordRow = await page
    .waitForSelector(
      `#content div[name="data"]>div:first-child tbody>tr:nth-child(${
        entryIndex + 1
      })`,
      { timeout }
    )
    .then(checkNonNull);
  console.log('checkPasswordLoggedInAccount:step2');

  const [testName, testLink, testUsername, testPassword] = await Promise.all([
    testPasswordRow
      .waitForSelector('td:nth-child(1)', { timeout })
      .then(checkNonNull)
      .then(
        (x) => (
          console.log('checkPasswordLoggedInAccount:step2:testName DONE'), x
        )
      ),
    testPasswordRow
      .waitForSelector('td:nth-child(2)>a', { timeout })
      .then(checkNonNull)
      .then(
        (x) => (
          console.log('checkPasswordLoggedInAccount:step2:testLink DONE'), x
        )
      ),
    testPasswordRow
      .waitForSelector('td:nth-child(3)', { timeout })
      .then(checkNonNull)
      .then(
        (x) => (
          console.log('checkPasswordLoggedInAccount:step2:testUsername DONE'), x
        )
      ),
    page
      .evaluate((i) => {
        const data = window['contentArea'].data as {
          title: string;
          spec: any[];
          data: any[][];
        }[];
        return data[0].data[i][3];
      }, entryIndex)
      .then(
        (x) => (
          console.log('checkPasswordLoggedInAccount:step2:testPassword DONE'), x
        )
      ),
  ]);

  console.log('checkPasswordLoggedInAccount:step3');
  assertEquals(
    await (await testName.getProperty('innerText')).jsonValue(),
    name
  );
  console.log('checkPasswordLoggedInAccount:step4');
  assertEquals(await (await testLink.getProperty('href')).jsonValue(), link);
  console.log('checkPasswordLoggedInAccount:step5');
  assertEquals(
    await (await testUsername.getProperty('innerText')).jsonValue(),
    username
  );
  console.log('checkPasswordLoggedInAccount:step6');
  assertStringObjectEquals(testPassword, { type: 'password', value: password });
  console.log('checkPasswordLoggedInAccount:step7');
}

async function saveAccount(page: Page) {
  const saveBtn = await page
    .waitForSelector('#content button[name="save"]', { timeout })
    .then(checkNonNull);
  await saveBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const lastModified = await page.evaluate(
    () => window['loginForm'].lastModified
  );
  console.log('lastModified =', lastModified);
  await pageWaitForXPath(
    page,
    '//span[contains(text(),"The password table has been saved")]',
    { timeout }
  );
}

describe('End-to-end test (mocked)', () => {
  it('end-to-end', async () => {
    const [{ page, browser }] = await Promise.all([
      (async () => {
        console.log('opening browser');
        const browser = await puppeteer.launch({
          headless: false,
          devtools: true,
        });

        const page = (await browser.pages())[0];
        return { page, browser };
      })(),
      (async () => {
        console.log('clearing server data (mocked)');
        const res = await fetch(`${serverBaseName}/dump-mock-server-data`, {
          method: 'POST',
          headers: {
            Accepts: 'application/json',
          },
          body: '{}',
        });
        const json = await res.json();
        if (!res.ok) {
          throw {
            message:
              'not ok, make sure you have the server running in mock data mode (yarn run start-testable)',
            methodAndUrl: `POST ${serverBaseName}/dump-mock-server-data`,
            statusReturned: res.status,
            json,
          };
        }
        return json;
      })(),
    ]);

    const creds1 = { username: 'Test', password: '1234' };
    const creds2 = { username: 'foo', password: '5678' };
    const creds3 = { username: 'bar', password: '9abc' };
    const pw: PwEntry[] = [
      {
        name: 'password 1',
        link: 'https://test123.com/',
        username: '1 username',
        password: 'secret',
      },
      {
        name: 'password abc',
        link: 'https://test123.com/ijk',
        username: 'username_abc',
        password: 'keep it secret',
      },
      {
        name: 'this is another password',
        link: 'https://test123abc.com/',
        username: 'user.name',
        password: 'super secret',
      },
      {
        name: 'yet another password',
        link: 'https://test123.com/xyz',
        username: 'this.user.name',
        password: 'more secrets',
      },
    ];
    console.log('step0');
    await createAccount(page, creds1);
    console.log('step1');
    await loginAccount(page, creds1);
    console.log('step2');
    await addPasswordLoggedInAccount(page, pw[0]);
    console.log('step3');
    await addPasswordLoggedInAccount(page, pw[2]);
    console.log('step4');
    await addPasswordLoggedInAccount(page, pw[3]);
    console.log(
      'after step4 data',
      JSON.stringify(
        await page.evaluate(() => window['contentArea'].data),
        null,
        2
      )
    );
    console.log('step5');
    await saveAccount(page);
    console.log('step6');
    await createAccount(page, creds2);
    console.log('step7');
    await loginAccount(page, creds2);
    console.log('step8');
    await addPasswordLoggedInAccount(page, pw[2]);
    console.log('step9');
    await addPasswordLoggedInAccount(page, pw[1]);
    console.log('step10');
    await saveAccount(page);
    console.log('step11');
    await loginAccount(page, creds1);
    console.log(
      'after step11 data',
      JSON.stringify(
        await page.evaluate(() => window['contentArea'].data),
        null,
        2
      )
    );
    console.log('step12');
    await checkPasswordLoggedInAccount(page, 1, pw[2]);
    console.log('step13');
    await checkPasswordLoggedInAccount(page, 0, pw[0]);
    console.log('step14');
    await checkPasswordLoggedInAccount(page, 2, pw[3]);
    console.log('step15');
    await editPasswordLoggedInAccount(page, 1, pw[2], pw[1]);
    console.log('step16');
    await saveAccount(page);
    console.log('step17');
    await loginAccount(page, creds2);
    console.log('step18');
    await loginAccount(page, creds1);
    console.log('step19');
    await checkPasswordLoggedInAccount(page, 1, pw[1]);
    console.log('step20');
    await checkPasswordLoggedInAccount(page, 2, pw[3]);
    console.log('step21');
    await checkPasswordLoggedInAccount(page, 0, pw[0]);
    console.log('step22');
    await loginAccount(page, creds2);
    console.log('step23');
    await checkPasswordLoggedInAccount(page, 1, pw[1]);
    console.log('step24');
    await checkPasswordLoggedInAccount(page, 0, pw[2]);
    console.log('step25');
    await browser.close();
  }, 25000);
});
