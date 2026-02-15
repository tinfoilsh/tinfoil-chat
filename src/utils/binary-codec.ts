import pako from 'pako'

const AES_GCM = 'AES-GCM'
const IV_LENGTH = 12

/** Get a safe ArrayBuffer copy from a Uint8Array subview. */
function toBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer
}

/** Concatenate IV(12) || ciphertext into a single Uint8Array. */
function packIvCiphertext(iv: Uint8Array, ciphertext: ArrayBuffer): Uint8Array {
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), IV_LENGTH)
  return result
}

/** Split IV(12) || ciphertext, validating minimum length. */
function unpackIvCiphertext(
  data: Uint8Array,
  errorMsg: string,
): { iv: Uint8Array; ciphertext: Uint8Array } {
  if (data.length <= IV_LENGTH) {
    throw new Error(errorMsg)
  }
  return {
    iv: data.subarray(0, IV_LENGTH),
    ciphertext: data.subarray(IV_LENGTH),
  }
}

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

  return packIvCiphertext(iv, ciphertext)
}

/**
 * Decrypt and decompress raw binary back to a parsed object.
 * Pipeline: split IV/ciphertext → AES-GCM decrypt → gunzip → JSON.parse
 */
export async function decryptAndDecompress(
  binary: Uint8Array,
  cryptoKey: CryptoKey,
): Promise<unknown> {
  const { iv, ciphertext } = unpackIvCiphertext(
    binary,
    'Binary data too short to contain IV and ciphertext',
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: AES_GCM, iv: toBuffer(iv) },
    cryptoKey,
    toBuffer(ciphertext),
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
    toBuffer(data),
  )

  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key))

  return { encryptedData: packIvCiphertext(iv, ciphertext), key: rawKey, iv }
}

/**
 * Decrypt a raw attachment blob using the per-attachment key.
 * The IV is extracted from the first 12 bytes of the encrypted data.
 */
export async function decryptAttachment(
  encryptedData: Uint8Array,
  key: Uint8Array,
): Promise<Uint8Array> {
  const { iv, ciphertext } = unpackIvCiphertext(
    encryptedData,
    'Encrypted attachment too short',
  )

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(key),
    { name: AES_GCM },
    false,
    ['decrypt'],
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: AES_GCM, iv: toBuffer(iv) },
    cryptoKey,
    toBuffer(ciphertext),
  )

  return new Uint8Array(decrypted)
}
