/**
 * GenUI tools defined with Zod schemas for the Vercel AI SDK.
 *
 * This map is passed to `streamText({ tools: GENUI_TOOLS })`. It mirrors the
 * JSON-schema registry used by the legacy inference client but gives us
 * strongly-typed tool inputs and first-class support in the AI SDK.
 *
 * The React components themselves continue to live in `./registry.tsx` — this
 * module only owns tool definitions (schema + description + name).
 */
import { tool } from 'ai'
import { z } from 'zod'

const infoCardInput = z.object({
  title: z.string().describe('Card title'),
  description: z
    .string()
    .optional()
    .describe('Short description below the title'),
  content: z.string().optional().describe('Main body content of the card'),
  footer: z.string().optional().describe('Footer text at the bottom'),
})

const dataTableInput = z.object({
  columns: z.array(z.string()).describe('Column header names'),
  rows: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .describe('Row objects keyed by column name'),
  caption: z.string().optional().describe('Optional table caption'),
})

const statCardsInput = z.object({
  stats: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        trend: z.enum(['up', 'down']).optional(),
      }),
    )
    .describe('Array of stat objects'),
})

const stepsInput = z.object({
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        status: z.enum(['pending', 'active', 'complete']).optional(),
      }),
    )
    .describe('Ordered steps'),
})

const progressBarInput = z.object({
  label: z.string().describe('Progress label'),
  value: z.number().describe('Current value'),
  max: z.number().optional().describe('Maximum value (defaults to 100)'),
})

const barChartInput = z.object({
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .describe(
      'Array of data points. Each object must share the same keys — e.g. [{"label": "A", "value": 10}, {"label": "B", "value": 20}].',
    ),
  xKey: z
    .string()
    .optional()
    .describe('Key for category axis (defaults to the first string field).'),
  yKey: z
    .string()
    .optional()
    .describe('Key for numeric axis (defaults to the first numeric field).'),
  title: z.string().optional().describe('Chart title'),
  color: z.string().optional().describe('Bar color'),
})

const lineChartInput = z.object({
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .describe(
      'Array of data points sharing the same keys — e.g. [{"x": "Jan", "y": 4}, ...].',
    ),
  xKey: z.string().optional(),
  yKey: z.string().optional(),
  title: z.string().optional(),
  color: z.string().optional(),
})

const pieChartInput = z.object({
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .describe(
      'Array of slices sharing the same keys — e.g. [{"name": "A", "value": 10}, ...].',
    ),
  nameKey: z
    .string()
    .optional()
    .describe('Key for slice names (defaults to the first string field).'),
  valueKey: z
    .string()
    .optional()
    .describe('Key for slice values (defaults to the first numeric field).'),
  title: z.string().optional(),
})

const areaChartInput = z.object({
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  xKey: z.string().optional(),
  yKey: z.string().optional(),
  title: z.string().optional(),
  color: z.string().optional().describe('Area fill color'),
})

const sourceCardsInput = z.object({
  sources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string().optional(),
        publishedAt: z.string().optional(),
        author: z.string().optional(),
      }),
    )
    .describe('Curated source articles'),
  title: z.string().optional().describe('Optional heading'),
})

const comparisonTableInput = z.object({
  items: z.array(z.string()).describe('Column headers — things being compared'),
  features: z
    .array(
      z.object({
        label: z.string(),
        values: z
          .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .describe(
            'One value per item. Use booleans for yes/no, strings/numbers otherwise.',
          ),
      }),
    )
    .describe('Feature rows'),
  title: z.string().optional(),
})

const timelineInput = z.object({
  events: z
    .array(
      z.object({
        date: z.string(),
        title: z.string(),
        description: z.string().optional(),
      }),
    )
    .describe('Chronological events'),
  title: z.string().optional(),
})

const calloutInput = z.object({
  variant: z
    .enum(['info', 'success', 'warning', 'error', 'tip'])
    .optional()
    .describe('Visual style (defaults to info)'),
  title: z.string().optional(),
  content: z.string().describe('Callout body text'),
})

const linkPreviewInput = z.object({
  url: z.string().describe('Link URL'),
  title: z.string().describe('Page title'),
  description: z.string().optional().describe('Short excerpt'),
  image: z.string().optional().describe('Preview image URL'),
  siteName: z.string().optional().describe('Publisher or site name'),
})

const keyValueListInput = z.object({
  items: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
      }),
    )
    .describe('Key-value rows'),
  title: z.string().optional(),
})

const imageGridInput = z.object({
  images: z
    .array(
      z.object({
        url: z.string(),
        alt: z.string().optional(),
        caption: z.string().optional(),
        link: z.string().optional(),
      }),
    )
    .describe('Images to display'),
  title: z.string().optional(),
})

const renderedImageInput = z.object({
  source: z
    .discriminatedUnion('type', [
      z
        .object({
          type: z.literal('url'),
          url: z.string().describe('Publicly accessible image URL'),
        })
        .describe('Reference an image hosted elsewhere'),
      z
        .object({
          type: z.literal('svg'),
          svg: z.string().describe('Raw SVG markup, e.g. "<svg ...>...</svg>"'),
        })
        .describe(
          'Inline SVG markup — use for generated diagrams, charts, or illustrations',
        ),
      z
        .object({
          type: z.literal('base64'),
          data: z
            .string()
            .describe('Base64-encoded image bytes (no data: prefix)'),
          mimeType: z
            .string()
            .describe('MIME type, e.g. "image/png" or "image/jpeg"'),
        })
        .describe('Inline raster image as base64'),
      z
        .object({
          type: z.literal('mermaid'),
          code: z
            .string()
            .describe(
              'Mermaid diagram source (graph, sequence, flowchart, etc.)',
            ),
        })
        .describe('Render a Mermaid diagram from source code'),
    ])
    .describe(
      'Image source — choose url for hosted images, svg for inline SVG, base64 for raw bytes, mermaid for diagrams.',
    ),
  alt: z.string().optional().describe('Alt text for accessibility'),
  caption: z.string().optional().describe('Caption shown below the image'),
})

const artifactPreviewInput = z.object({
  title: z.string().optional().describe('Artifact title'),
  description: z
    .string()
    .optional()
    .describe('Short description of what the artifact shows'),
  source: z
    .discriminatedUnion('type', [
      z
        .object({
          type: z.literal('url'),
          url: z
            .string()
            .describe('Publicly accessible URL for a hosted preview'),
        })
        .describe('Preview a hosted app or document in an iframe'),
      z
        .object({
          type: z.literal('html'),
          html: z.string().describe('HTML document source for the artifact'),
        })
        .describe('Preview generated HTML or a small self-contained app'),
      z
        .object({
          type: z.literal('markdown'),
          markdown: z.string().describe('Markdown content for the artifact'),
        })
        .describe('Preview a generated markdown document'),
      z
        .object({
          type: z.literal('svg'),
          svg: z.string().describe('Raw SVG markup for the artifact'),
        })
        .describe('Preview a generated SVG artifact'),
      z
        .object({
          type: z.literal('mermaid'),
          code: z.string().describe('Mermaid diagram source for the artifact'),
        })
        .describe('Preview a Mermaid diagram artifact'),
    ])
    .describe(
      'Artifact content to preview — use html for generated apps, markdown for docs, svg/mermaid for diagrams, or url for a hosted preview.',
    ),
  footer: z
    .string()
    .optional()
    .describe('Footer note shown under the artifact'),
})

const taskPlanInput = z.object({
  title: z.string().optional().describe('Plan title'),
  summary: z.string().optional().describe('Short summary of the plan'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'blocked'])
    .optional()
    .describe('Overall plan status'),
  progress: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Overall completion percentage'),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        status: z
          .enum(['pending', 'in_progress', 'completed', 'blocked'])
          .optional(),
      }),
    )
    .describe('Ordered list of plan tasks'),
  nextStep: z.string().optional().describe('Recommended next step'),
})

const confirmationCardInput = z.object({
  title: z.string().describe('Title of the action awaiting approval'),
  summary: z.string().describe('Short summary of what would happen'),
  riskLevel: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Relative risk of the requested action'),
  reason: z
    .string()
    .optional()
    .describe('Why confirmation is needed before proceeding'),
  details: z
    .array(z.string())
    .optional()
    .describe('Specific details about the action to approve'),
  consequences: z
    .array(z.string())
    .optional()
    .describe('Potential impacts or side effects if approved'),
  confirmLabel: z
    .string()
    .optional()
    .describe('Suggested confirmation reply, e.g. "Approve"'),
  cancelLabel: z
    .string()
    .optional()
    .describe('Suggested alternative reply, e.g. "Revise"'),
  requiresConfirmation: z
    .boolean()
    .optional()
    .describe('Whether explicit user confirmation is required'),
})

const weatherCardInput = z.object({
  location: z.string().describe('Location name'),
  condition: z.string().describe('Current weather condition'),
  temperature: z
    .union([z.string(), z.number()])
    .describe('Current temperature'),
  unit: z.enum(['C', 'F']).optional().describe('Temperature unit'),
  feelsLike: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Feels-like temperature'),
  high: z.union([z.string(), z.number()]).optional().describe('Daily high'),
  low: z.union([z.string(), z.number()]).optional().describe('Daily low'),
  precipitationChance: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Chance of precipitation'),
  humidity: z.union([z.string(), z.number()]).optional().describe('Humidity'),
  wind: z.string().optional().describe('Wind speed or direction'),
  forecast: z
    .array(
      z.object({
        label: z.string(),
        condition: z.string().optional(),
        temperature: z.union([z.string(), z.number()]).optional(),
        high: z.union([z.string(), z.number()]).optional(),
        low: z.union([z.string(), z.number()]).optional(),
        precipitationChance: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .optional()
    .describe('Short forecast items, such as hourly or daily outlooks'),
  updatedAt: z.string().optional().describe('Timestamp or recency label'),
})

const mapPlaceCardInput = z.object({
  name: z.string().describe('Place name'),
  address: z.string().describe('Street address or location description'),
  description: z.string().optional().describe('Short place description'),
  image: z.string().optional().describe('Preview image URL'),
  category: z.string().optional().describe('Place category'),
  rating: z.number().optional().describe('Average rating'),
  reviewCount: z.number().optional().describe('Number of reviews'),
  priceLevel: z.string().optional().describe('Price tier, e.g. "$$"'),
  openNow: z.boolean().optional().describe('Whether the place is open now'),
  hours: z.array(z.string()).optional().describe('Opening hours'),
  phone: z.string().optional().describe('Phone number'),
  websiteUrl: z.string().optional().describe('Official website URL'),
  directionsUrl: z.string().optional().describe('Directions or maps URL'),
  sourceUrl: z.string().optional().describe('Supporting source URL'),
  distance: z
    .string()
    .optional()
    .describe('Distance from the user or reference'),
})

/**
 * Tool map passed to `streamText({ tools })`. Tool results are rendered by
 * the component registry; we do not declare `execute` because the tools are
 * display-only — the UI handles the result on the client.
 */
export const GENUI_TOOLS = {
  render_artifact_preview: tool({
    description:
      'Render a previewable artifact panel for generated apps, HTML, markdown documents, or diagrams. Use this instead of dumping raw HTML, SVG, or Mermaid into markdown.',
    inputSchema: artifactPreviewInput,
  }),
  render_info_card: tool({
    description:
      'Display a highlighted card with structured information. Use for a single key fact, definition, or summary.',
    inputSchema: infoCardInput,
  }),
  render_data_table: tool({
    description:
      'Render structured tabular data. Use when presenting rows and columns.',
    inputSchema: dataTableInput,
  }),
  render_stat_cards: tool({
    description:
      'Display a grid of metrics or KPIs. Use when presenting multiple numeric summaries.',
    inputSchema: statCardsInput,
  }),
  render_steps: tool({
    description:
      'Show an ordered list of steps or a checklist. Use for processes, instructions, or progress tracking.',
    inputSchema: stepsInput,
  }),
  render_task_plan: tool({
    description:
      'Display a task or execution plan with statuses and overall progress. Use for multi-step workflows, agent plans, or long-running work.',
    inputSchema: taskPlanInput,
  }),
  render_progress_bar: tool({
    description:
      'Show progress toward a goal. Use when displaying a completion percentage.',
    inputSchema: progressBarInput,
  }),
  render_bar_chart: tool({
    description:
      'Render a bar chart for categorical comparisons. Use when comparing values across categories.',
    inputSchema: barChartInput,
  }),
  render_line_chart: tool({
    description:
      'Render a line chart for trends over time. Use when showing how values change across a sequence.',
    inputSchema: lineChartInput,
  }),
  render_pie_chart: tool({
    description:
      'Render a pie chart for proportional data. Use when showing how parts make up a whole.',
    inputSchema: pieChartInput,
  }),
  render_area_chart: tool({
    description:
      'Render a filled area chart for cumulative trends over time. Use for stacked or continuous value progression.',
    inputSchema: areaChartInput,
  }),
  render_source_cards: tool({
    description:
      'Display a grid of curated web sources with titles, snippets, and links. Use after web search to surface the most relevant articles.',
    inputSchema: sourceCardsInput,
  }),
  render_comparison_table: tool({
    description:
      'Render a side-by-side feature comparison table. Booleans render as check/cross icons.',
    inputSchema: comparisonTableInput,
  }),
  render_timeline: tool({
    description:
      'Display a chronological timeline of events. Use for history, news recaps, or project milestones.',
    inputSchema: timelineInput,
  }),
  render_callout: tool({
    description:
      'Display a highlighted callout box for key takeaways, warnings, tips, or notes.',
    inputSchema: calloutInput,
  }),
  render_confirmation_card: tool({
    description:
      'Display an approval card for a sensitive or high-impact action. Use when the user should confirm before the assistant proceeds.',
    inputSchema: confirmationCardInput,
  }),
  render_link_preview: tool({
    description:
      'Render a single rich link preview card with optional image and description.',
    inputSchema: linkPreviewInput,
  }),
  render_key_value_list: tool({
    description:
      'Display a fact sheet of labeled values. Use for structured attributes like specs or metadata.',
    inputSchema: keyValueListInput,
  }),
  render_weather_card: tool({
    description:
      'Display current weather conditions with supporting details and a short forecast.',
    inputSchema: weatherCardInput,
  }),
  render_map_place_card: tool({
    description:
      'Display a place card with location details, hours, rating, and useful links such as directions or source URLs.',
    inputSchema: mapPlaceCardInput,
  }),
  render_image_grid: tool({
    description:
      'Display a gallery of images in a responsive grid. Use for visual search results or photo collections.',
    inputSchema: imageGridInput,
  }),
  render_image: tool({
    description:
      'Render a single image or diagram. Accepts hosted URLs, inline SVG, base64 image bytes, or Mermaid diagram source. Use this to generate visual diagrams, illustrations, or highlight a single hero image — not for galleries (use render_image_grid) or link cards (use render_link_preview).',
    inputSchema: renderedImageInput,
  }),
} as const

export type GenUIToolName = keyof typeof GENUI_TOOLS
