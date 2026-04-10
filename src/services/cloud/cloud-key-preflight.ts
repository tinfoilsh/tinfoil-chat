import { CLOUD_SYNC } from '@/config'
import { base64ToUint8Array } from '@/utils/binary-codec'
import { encryptionService } from '../encryption/encryption-service'
import { cloudStorage } from './cloud-storage'
import { profileSync } from './profile-sync'
import { projectStorage } from './project-storage'

export type CloudRemoteState = 'empty' | 'exists' | 'unknown'
export type CloudKeyValidationProbe = 'none' | 'profile' | 'project' | 'chat'

export interface CloudKeyValidationResult {
  remoteState: CloudRemoteState
  canWrite: boolean
  probe: CloudKeyValidationProbe
  message?: string
}

export async function inspectRemoteEncryptedState(): Promise<CloudRemoteState> {
  const profileStatus = await profileSync.getSyncStatus()
  if (!profileStatus) return 'unknown'
  if (profileStatus.exists) return 'exists'

  try {
    const projectStatus = await projectStorage.getProjectSyncStatus()
    if (projectStatus.count > 0) return 'exists'
  } catch {
    return 'unknown'
  }

  try {
    const chatStatus = await cloudStorage.getChatSyncStatus()
    return chatStatus.count > 0 ? 'exists' : 'empty'
  } catch {
    return 'unknown'
  }
}

export async function validateCurrentPrimaryKey(): Promise<CloudKeyValidationResult> {
  if (!encryptionService.getKey()) {
    return {
      remoteState: 'unknown',
      canWrite: false,
      probe: 'none',
      message: 'No encryption key is currently loaded.',
    }
  }

  const profileStatus = await profileSync.getSyncStatus()
  if (!profileStatus) {
    return {
      remoteState: 'unknown',
      canWrite: false,
      probe: 'none',
      message:
        "We couldn't verify whether encrypted cloud data already exists.",
    }
  }

  if (profileStatus.exists) {
    return validateProfileProbe()
  }

  try {
    const projectStatus = await projectStorage.getProjectSyncStatus()
    if (projectStatus.count > 0) {
      return validateProjectProbe()
    }
  } catch {
    return {
      remoteState: 'unknown',
      canWrite: false,
      probe: 'none',
      message:
        "We couldn't verify whether encrypted cloud data already exists.",
    }
  }

  try {
    const chatStatus = await cloudStorage.getChatSyncStatus()
    if (chatStatus.count > 0) {
      return validateChatProbe()
    }
  } catch {
    return {
      remoteState: 'unknown',
      canWrite: false,
      probe: 'none',
      message:
        "We couldn't verify whether encrypted cloud data already exists.",
    }
  }

  return {
    remoteState: 'empty',
    canWrite: true,
    probe: 'none',
  }
}

async function validateProfileProbe(): Promise<CloudKeyValidationResult> {
  let payload: string | null
  try {
    payload = await profileSync.fetchEncryptedProfilePayload()
    if (!payload) {
      return {
        remoteState: 'unknown',
        canWrite: false,
        probe: 'profile',
        message: "We couldn't verify your existing cloud profile.",
      }
    }
  } catch {
    return {
      remoteState: 'unknown',
      canWrite: false,
      probe: 'profile',
      message: "We couldn't verify your existing cloud profile.",
    }
  }

  try {
    const encrypted = JSON.parse(payload)
    const result = await encryptionService.decryptWithFallbackInfo(encrypted)

    return result.usedFallbackKey
      ? blockedResult('profile')
      : {
          remoteState: 'exists',
          canWrite: true,
          probe: 'profile',
        }
  } catch {
    return blockedResult('profile')
  }
}

async function validateProjectProbe(): Promise<CloudKeyValidationResult> {
  try {
    const response = await projectStorage.listProjects({
      limit: CLOUD_SYNC.KEY_VALIDATION_PROBE_LIMIT,
      includeContent: true,
    })

    if (!response.projects.length) {
      return {
        remoteState: 'unknown',
        canWrite: false,
        probe: 'project',
        message: "We couldn't verify your existing cloud projects.",
      }
    }

    let sawMismatch = false

    for (const project of response.projects.slice(
      0,
      CLOUD_SYNC.KEY_VALIDATION_PROBE_LIMIT,
    )) {
      if (!project.content) continue

      try {
        const encrypted = JSON.parse(project.content)
        const result =
          await encryptionService.decryptWithFallbackInfo(encrypted)
        if (!result.usedFallbackKey) {
          return {
            remoteState: 'exists',
            canWrite: true,
            probe: 'project',
          }
        }
        sawMismatch = true
      } catch {
        sawMismatch = true
      }
    }

    return sawMismatch
      ? blockedResult('project')
      : {
          remoteState: 'unknown',
          canWrite: false,
          probe: 'project',
          message: "We couldn't verify your existing cloud projects.",
        }
  } catch {
    return {
      remoteState: 'unknown',
      canWrite: false,
      probe: 'project',
      message: "We couldn't verify your existing cloud projects.",
    }
  }
}

async function validateChatProbe(): Promise<CloudKeyValidationResult> {
  try {
    const response = await cloudStorage.listChats({
      limit: CLOUD_SYNC.KEY_VALIDATION_PROBE_LIMIT,
      includeContent: true,
    })

    if (!response.conversations.length) {
      return {
        remoteState: 'unknown',
        canWrite: false,
        probe: 'chat',
        message: "We couldn't verify your existing cloud chats.",
      }
    }

    let sawMismatch = false

    for (const chat of response.conversations.slice(
      0,
      CLOUD_SYNC.KEY_VALIDATION_PROBE_LIMIT,
    )) {
      if (!chat.content) continue

      try {
        if (chat.formatVersion === 1) {
          const result = await encryptionService.decryptV1WithFallbackInfo(
            base64ToUint8Array(chat.content),
          )
          if (!result.usedFallbackKey) {
            return {
              remoteState: 'exists',
              canWrite: true,
              probe: 'chat',
            }
          }
        } else {
          const encrypted = JSON.parse(chat.content)
          const result =
            await encryptionService.decryptWithFallbackInfo(encrypted)
          if (!result.usedFallbackKey) {
            return {
              remoteState: 'exists',
              canWrite: true,
              probe: 'chat',
            }
          }
        }

        sawMismatch = true
      } catch {
        sawMismatch = true
      }
    }

    return sawMismatch
      ? blockedResult('chat')
      : {
          remoteState: 'unknown',
          canWrite: false,
          probe: 'chat',
          message: "We couldn't verify your existing cloud chats.",
        }
  } catch {
    return {
      remoteState: 'unknown',
      canWrite: false,
      probe: 'chat',
      message: "We couldn't verify your existing cloud chats.",
    }
  }
}

function blockedResult(
  probe: Exclude<CloudKeyValidationProbe, 'none'>,
): CloudKeyValidationResult {
  return {
    remoteState: 'exists',
    canWrite: false,
    probe,
    message: "This key doesn't match your existing cloud data.",
  }
}
