type FileUploadRoutingOptions = {
  isProjectMode: boolean
  hasActiveProject: boolean
  requestDestination: (file: File) => void
  processFileForChat: (file: File) => Promise<void>
}

export async function routeChatFileUpload(
  file: File,
  {
    isProjectMode,
    hasActiveProject,
    requestDestination,
    processFileForChat,
  }: FileUploadRoutingOptions,
): Promise<void> {
  if (isProjectMode && hasActiveProject) {
    requestDestination(file)
    return
  }

  await processFileForChat(file)
}
