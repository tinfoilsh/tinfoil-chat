'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

interface DragContextValue {
  draggingChatId: string | null
  draggingChatFromProjectId: string | null
  dropTargetProjectId: string | null
  dropTargetTab: 'cloud' | 'local' | null
  isDropTargetChatHistory: boolean

  setDraggingChat: (
    chatId: string | null,
    fromProjectId?: string | null,
  ) => void
  setDropTargetProject: (projectId: string | null) => void
  setDropTargetTab: (tab: 'cloud' | 'local' | null) => void
  setDropTargetChatHistory: (isTarget: boolean) => void
  clearDragState: () => void
}

const DragContext = createContext<DragContextValue | null>(null)

export function DragProvider({ children }: { children: ReactNode }) {
  const [draggingChatId, setDraggingChatId] = useState<string | null>(null)
  const [draggingChatFromProjectId, setDraggingChatFromProjectId] = useState<
    string | null
  >(null)
  const [dropTargetProjectId, setDropTargetProjectId] = useState<string | null>(
    null,
  )
  const [dropTargetTab, setDropTargetTab] = useState<'cloud' | 'local' | null>(
    null,
  )
  const [isDropTargetChatHistory, setIsDropTargetChatHistory] = useState(false)

  const setDraggingChat = useCallback(
    (chatId: string | null, fromProjectId?: string | null) => {
      setDraggingChatId(chatId)
      setDraggingChatFromProjectId(fromProjectId ?? null)
    },
    [],
  )

  const clearDragState = useCallback(() => {
    setDraggingChatId(null)
    setDraggingChatFromProjectId(null)
    setDropTargetProjectId(null)
    setDropTargetTab(null)
    setIsDropTargetChatHistory(false)
  }, [])

  return (
    <DragContext.Provider
      value={{
        draggingChatId,
        draggingChatFromProjectId,
        dropTargetProjectId,
        dropTargetTab,
        isDropTargetChatHistory,
        setDraggingChat,
        setDropTargetProject: setDropTargetProjectId,
        setDropTargetTab,
        setDropTargetChatHistory: setIsDropTargetChatHistory,
        clearDragState,
      }}
    >
      {children}
    </DragContext.Provider>
  )
}

export function useDrag(): DragContextValue {
  const context = useContext(DragContext)
  if (!context) {
    throw new Error('useDrag must be used within a DragProvider')
  }
  return context
}
