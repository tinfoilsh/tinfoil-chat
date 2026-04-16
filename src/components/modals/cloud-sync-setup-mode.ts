import { inspectRemoteEncryptedState } from '@/services/cloud/cloud-key-preflight'

export type CloudKeySetupMode = 'recoverExisting' | 'explicitStartFresh'

interface DetermineGeneratedKeySetupModeOptions {
  manualRecoveryNeeded: boolean
}

export async function determineGeneratedKeySetupMode({
  manualRecoveryNeeded,
}: DetermineGeneratedKeySetupModeOptions): Promise<CloudKeySetupMode> {
  if (manualRecoveryNeeded) {
    return 'explicitStartFresh'
  }

  try {
    const remoteState = await inspectRemoteEncryptedState()
    return remoteState === 'exists' ? 'explicitStartFresh' : 'recoverExisting'
  } catch {
    return 'recoverExisting'
  }
}
