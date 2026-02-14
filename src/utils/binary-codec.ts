import pako from 'pako'

const AES_GCM = 'AES-GCM'
const IV_LENGTH = 12

/**
 * Compress and encrypt a JSON-serialisable object into raw binary.
 * Pipeline: JSON.stringify → gzip → AES-GCM encrypt → IV(12) || ciphertext
 */
export async function compressAndEncrypt(
  data: unknown,
  cryptoKey: CryptoKey,
): Promise<Uint8Array> {
  const json = JSON.stringify(data)
  const compressed = pako.gzip(json)

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_GCM, iv },
    cryptoKey,
    compressed,
  )

  // Wire format: IV(12 bytes) || ciphertext
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), IV_LENGTH)
  return result
}

/**
 * Decrypt and decompress raw binary back to a parsed object.
 * Pipeline: split IV/ciphertext → AES-GCM decrypt → gunzip → JSON.parse
 */
export async function decryptAndDecompress(
  binary: Uint8Array,
  cryptoKey: CryptoKey,
): Promise<unknown> {
  if (binary.length <= IV_LENGTH) {
    throw new Error('Binary data too short to contain IV and ciphertext')
  }

  const iv = binary.subarray(0, IV_LENGTH)
  const ciphertext = binary.subarray(IV_LENGTH)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: AES_GCM,
      iv: iv.buffer.slice(
        iv.byteOffset,
        iv.byteOffset + iv.byteLength,
      ) as ArrayBuffer,
    },
    cryptoKey,
    ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength,
    ) as ArrayBuffer,
  )

  const decompressed = pako.ungzip(new Uint8Array(decrypted), { to: 'string' })
  return JSON.parse(decompressed)
}

/**
 * Encrypt a raw attachment blob with a random per-attachment key.
 * Returns the ciphertext (IV || encrypted data) and the key material
 * so the caller can store key+IV in the chat JSON metadata.
 */
export async function encryptAttachment(
  data: Uint8Array,
): Promise<{ encryptedData: Uint8Array; key: Uint8Array; iv: Uint8Array }> {
  const key = await crypto.subtle.generateKey(
    { name: AES_GCM, length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_GCM, iv },
    key,
    data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer,
  )

  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key))

  // Wire format: IV(12 bytes) || ciphertext
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), IV_LENGTH)

  return { encryptedData: result, key: rawKey, iv }
}

/**
 * Decrypt a raw attachment blob using the per-attachment key.
 * The IV is extracted from the first 12 bytes of the encrypted data.
 */
export async function decryptAttachment(
  encryptedData: Uint8Array,
  key: Uint8Array,
): Promise<Uint8Array> {
  if (encryptedData.length <= IV_LENGTH) {
    throw new Error('Encrypted attachment too short')
  }

  const iv = encryptedData.subarray(0, IV_LENGTH)
  const ciphertext = encryptedData.subarray(IV_LENGTH)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer.slice(
      key.byteOffset,
      key.byteOffset + key.byteLength,
    ) as ArrayBuffer,
    { name: AES_GCM },
    false,
    ['decrypt'],
  )

  const decrypted = await crypto.subtle.decrypt(
    {
      name: AES_GCM,
      iv: iv.buffer.slice(
        iv.byteOffset,
        iv.byteOffset + iv.byteLength,
      ) as ArrayBuffer,
    },
    cryptoKey,
    ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength,
    ) as ArrayBuffer,
  )

  return new Uint8Array(decrypted)
}
