export {
  PasskeyCredentialConflictError,
  decryptKeyBundle,
  encryptKeyBundle,
  getPasskeyCredentialState,
  hasPasskeyCredentials,
  loadPasskeyCredentials,
  retrieveEncryptedKeys,
  savePasskeyCredentials,
  storeEncryptedKeys,
} from './passkey-key-storage'
export type {
  KeyBundle,
  PasskeyCredentialEntry,
  PasskeyCredentialState,
  StoreEncryptedKeysOptions,
} from './passkey-key-storage'
export {
  PrfNotSupportedError,
  authenticatePrfPasskey,
  clearCachedPrfResult,
  createPrfPasskey,
  deriveKeyEncryptionKey,
  getCachedPrfResult,
} from './passkey-service'
export type { PrfPasskeyResult } from './passkey-service'
export { isPrfSupported, resetPrfSupportCache } from './prf-support'
