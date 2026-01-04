import { ChatInterface } from '@/components/chat'
import { ProjectProvider } from '@/components/project'

export default function Chat() {
  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider>
        <ChatInterface />
      </ProjectProvider>
    </div>
  )
}
