export {
  decryptKeyBundle,
  encryptKeyBundle,
  hasPasskeyCredentials,
  loadPasskeyCredentials,
  retrieveEncryptedKeys,
  savePasskeyCredentials,
  storeEncryptedKeys,
} from './passkey-key-storage'
export type { KeyBundle, PasskeyCredentialEntry } from './passkey-key-storage'
export {
  authenticatePrfPasskey,
  clearCachedPrfResult,
  createPrfPasskey,
  deriveKeyEncryptionKey,
  getCachedPrfResult,
} from './passkey-service'
export type { PrfPasskeyResult } from './passkey-service'
export { isPrfSupported, resetPrfSupportCache } from './prf-support'
