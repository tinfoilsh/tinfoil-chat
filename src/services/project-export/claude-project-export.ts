import type { ProjectStorageService } from '@/services/cloud/project-storage'
import type {
  ProjectDocumentListItem,
  ProjectListResponse,
} from '@/types/project'
import type { ClaudeProject } from '@/utils/chat-import-parsers'

export const CLAUDE_PROJECT_EXPORT_MAX_BYTES = 64 * 1024 * 1024

const PROJECT_PAGE_LIMIT = 100
const DOCUMENT_READ_CONCURRENCY = 4

type ProjectListItem = ProjectListResponse['projects'][number]

export interface ClaudeProjectExportCounts {
  exportedProjects: number
  skippedProjects: number
  exportedDocuments: number
  skippedDocuments: number
}

export interface ClaudeProjectExportResult {
  json: string
  encodedBytes: number
  counts: ClaudeProjectExportCounts
  warnings: string[]
}

export class ClaudeProjectExportSizeError extends Error {
  constructor() {
    super('The Claude-compatible project export exceeds the 64 MiB limit.')
    this.name = 'ClaudeProjectExportSizeError'
  }
}

interface ExportOptions {
  maxEncodedBytes?: number
}

async function listAllProjects(
  storage: Pick<ProjectStorageService, 'listProjects'>,
): Promise<ProjectListItem[]> {
  const projects: ProjectListItem[] = []
  let continuationToken: string | undefined

  do {
    const page = await storage.listProjects({
      limit: PROJECT_PAGE_LIMIT,
      continuationToken,
    })
    projects.push(...page.projects)
    continuationToken = page.nextContinuationToken
  } while (continuationToken)

  return projects
}

async function readDocuments(
  storage: Pick<ProjectStorageService, 'getDocument'>,
  projectId: string,
  documents: ProjectDocumentListItem[],
  counts: ClaudeProjectExportCounts,
  warnings: string[],
): Promise<NonNullable<ClaudeProject['docs']>> {
  const exported: Array<NonNullable<ClaudeProject['docs']>[number] | null> =
    new Array(documents.length).fill(null)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < documents.length) {
      const index = nextIndex++
      const listedDocument = documents[index]
      try {
        const document = await storage.getDocument(projectId, listedDocument.id)
        if (
          !document ||
          document.decryptionFailed ||
          document.content == null
        ) {
          counts.skippedDocuments++
          warnings.push(
            `Skipped document ${listedDocument.id} in project ${projectId}.`,
          )
          continue
        }
        exported[index] = {
          uuid: listedDocument.id,
          filename: document.filename,
          content: document.content,
          created_at: listedDocument.createdAt,
        }
        counts.exportedDocuments++
      } catch {
        counts.skippedDocuments++
        warnings.push(
          `Skipped document ${listedDocument.id} in project ${projectId}.`,
        )
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(DOCUMENT_READ_CONCURRENCY, documents.length) },
      worker,
    ),
  )
  return exported.filter(
    (document): document is NonNullable<typeof document> => document !== null,
  )
}

export async function buildClaudeProjectExport(
  storage: Pick<
    ProjectStorageService,
    'listProjects' | 'getProject' | 'listDocuments' | 'getDocument'
  >,
  options: ExportOptions = {},
): Promise<ClaudeProjectExportResult> {
  // Finish the authoritative project listing before reading any content. A
  // listing failure must abort rather than produce an incomplete project set.
  const listedProjects = await listAllProjects(storage)
  const projects: ClaudeProject[] = []
  const counts: ClaudeProjectExportCounts = {
    exportedProjects: 0,
    skippedProjects: 0,
    exportedDocuments: 0,
    skippedDocuments: 0,
  }
  const warnings: string[] = []

  for (const listedProject of listedProjects) {
    let project
    try {
      project = await storage.getProject(listedProject.id)
    } catch {
      project = null
    }
    if (!project || project.decryptionFailed) {
      counts.skippedProjects++
      warnings.push(`Skipped project ${listedProject.id}.`)
      continue
    }

    let listedDocuments: ProjectDocumentListItem[] = []
    try {
      listedDocuments = (await storage.listDocuments(project.id)).documents
    } catch {
      warnings.push(
        `Documents for project ${project.id} could not be listed, so their skipped count is unknown.`,
      )
    }
    const docs = await readDocuments(
      storage,
      project.id,
      listedDocuments,
      counts,
      warnings,
    )

    projects.push({
      uuid: project.id,
      name: project.name,
      ...(project.description ? { description: project.description } : {}),
      ...(project.systemInstructions
        ? { prompt_template: project.systemInstructions }
        : {}),
      created_at: listedProject.createdAt,
      updated_at: listedProject.updatedAt,
      ...(docs.length > 0 ? { docs } : {}),
    })
    counts.exportedProjects++
  }

  const json = JSON.stringify(projects, null, 2)
  const encodedBytes = new TextEncoder().encode(json).length
  if (
    encodedBytes > (options.maxEncodedBytes ?? CLAUDE_PROJECT_EXPORT_MAX_BYTES)
  ) {
    throw new ClaudeProjectExportSizeError()
  }

  return { json, encodedBytes, counts, warnings }
}
