export function encryptAes256CBC(encKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const ivArr = new Uint8Array(16);
  crypto.getRandomValues(ivArr);
  return Promise.resolve(crypto.subtle.encrypt(
    {
      name: 'AES-CBC',
      length: 256,
      iv: ivArr,
    },
    encKey,
    data
  )).then(encBuf => {
    const outBuf = new ArrayBuffer(ivArr.buffer.byteLength + encBuf.byteLength);
    {
      const arr = new Uint8Array(outBuf, 0, ivArr.length);
      for (let i = 0; i < ivArr.length; ++i) {
        arr[i] = ivArr[i];
      }
    }
    const arr = new Uint8Array(outBuf, 16, encBuf.byteLength);
    const encArr = new Uint8Array(encBuf);
    for (let i = 0; i < arr.length; ++i) {
      arr[i] = encArr[i];
    }
    return outBuf;
  });
}
export function decryptAes256CBC(encKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = data.slice(0, 16);
  const encData = data.slice(16);
  return Promise.resolve(crypto.subtle.decrypt(
    {
      name: 'AES-CBC',
      length: 256,
      iv: iv
    },
    encKey,
    encData
  ));
}
