import { subtle } from './CryptoUtils';
import { arrayBufferToHexString, hexStringToUint8Array } from './StrUtils';

function dec2hex(s: number): string {
  return (s < 15.5 ? '0' : '') + Math.round(s).toString(16);
}
function hex2dec(s: string): number {
  return parseInt(s, 16);
}

const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32tohex(base32: string) {
  let bits = '';
  let hex = '';

  for (let i = 0; i < base32.length; i++) {
    const val = base32chars.indexOf(base32.charAt(i).toUpperCase());
    bits += leftpad(val.toString(2), 5, '0');
  }

  for (let i = 0; i + 4 <= bits.length; i += 4) {
    const chunk = bits.substring(i, i + 4);
    hex = hex + parseInt(chunk, 2).toString(16);
  }
  return hex;
}

function leftpad(str: string, len: number, pad: string) {
  if (len + 1 >= str.length) {
    str = Array(len + 1 - str.length).join(pad) + str;
  }
  return str;
}

export async function generateOtp(mfaKey: string) {
  const key = base32tohex(mfaKey);
  const epoch = Math.round(new Date().getTime() / 1000.0);
  const time = leftpad(dec2hex(Math.floor(epoch / 30)), 16, '0');

  const importedKey = await subtle.importKey(
    'raw',
    hexStringToUint8Array(key),
    {
      name: 'HMAC',
      hash: 'SHA-1',
    },
    false,
    ['sign']
  );

  const hmacArr = await subtle.sign(
    'HMAC',
    importedKey,
    hexStringToUint8Array(time)
  );
  const hmac = arrayBufferToHexString(hmacArr);

  var offset = hex2dec(hmac.substring(hmac.length - 1));

  var otp =
    (hex2dec(hmac.substring(offset * 2, offset * 2 + 8)) &
      hex2dec('7fffffff')) +
    '';
  otp = otp.substring(otp.length - 6, otp.length);

  return otp;
}
