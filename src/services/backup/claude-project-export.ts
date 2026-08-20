import { projectStorage } from '@/services/cloud/project-storage'

const PAGE_SIZE = 100

export interface ClaudeProjectExportWarning {
  projectId: string
  documentId?: string
  message: string
}

export interface ClaudeProjectExportResult {
  projects: Array<{
    uuid: string
    name: string
    description?: string
    prompt_template?: string
    created_at: string
    updated_at: string
    docs?: Array<{
      uuid: string
      filename: string
      content: string
      created_at: string
    }>
  }>
  skippedProjects: number
  skippedDocuments: number
  warnings: ClaudeProjectExportWarning[]
}

export async function buildClaudeProjectExport(): Promise<ClaudeProjectExportResult> {
  const listed = []
  let continuationToken: string | undefined
  do {
    const page = await projectStorage.listProjects({
      limit: PAGE_SIZE,
      continuationToken,
    })
    listed.push(...page.projects)
    continuationToken = page.nextContinuationToken
  } while (continuationToken)

  const fullById = await projectStorage.getProjects(
    listed.map((item) => item.id),
  )
  const projects: ClaudeProjectExportResult['projects'] = []
  const warnings: ClaudeProjectExportWarning[] = []
  let skippedProjects = 0
  let skippedDocuments = 0

  for (const item of listed) {
    const project = fullById.get(item.id)
    if (
      !project ||
      project.decryptionFailed ||
      project.syncVersion !== item.syncVersion
    ) {
      skippedProjects++
      warnings.push({
        projectId: item.id,
        message: 'Project could not be read consistently.',
      })
      continue
    }
    const documentList = await projectStorage.listDocuments(item.id)
    const documentsById = await projectStorage.getDocuments(
      item.id,
      documentList.documents.map((document) => document.id),
    )
    const docs: NonNullable<
      ClaudeProjectExportResult['projects'][number]['docs']
    > = []
    for (const documentItem of documentList.documents) {
      const document = documentsById.get(documentItem.id)
      if (!document || document.decryptionFailed) {
        skippedDocuments++
        warnings.push({
          projectId: item.id,
          documentId: documentItem.id,
          message: 'Project document could not be decrypted.',
        })
        continue
      }
      docs.push({
        uuid: document.id,
        filename: document.filename,
        content: document.content ?? '',
        created_at: new Date(documentItem.createdAt).toISOString(),
      })
    }
    projects.push({
      uuid: item.id,
      name: project.name,
      description: project.description || undefined,
      prompt_template: project.systemInstructions || undefined,
      created_at: new Date(item.createdAt).toISOString(),
      updated_at: new Date(item.updatedAt).toISOString(),
      docs: docs.length > 0 ? docs : undefined,
    })
  }

  return { projects, skippedProjects, skippedDocuments, warnings }
}
