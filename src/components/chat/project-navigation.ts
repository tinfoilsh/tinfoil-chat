interface OpenProjectChatOptions {
  projectId: string
  projectName?: string
  createNewChat: (isLocalOnly?: boolean, fromUserAction?: boolean) => void
  enterProjectMode: (
    projectId: string,
    projectName?: string,
  ) => Promise<boolean>
}

export async function openProjectChat({
  projectId,
  projectName,
  createNewChat,
  enterProjectMode,
}: OpenProjectChatOptions): Promise<boolean> {
  createNewChat(false, true)
  return enterProjectMode(projectId, projectName)
}
