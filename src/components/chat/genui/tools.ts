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
    .describe('Array of data points with xKey and yKey values'),
  xKey: z.string().describe('Key for category axis values'),
  yKey: z.string().describe('Key for numeric axis values'),
  title: z.string().optional().describe('Chart title'),
  color: z.string().optional().describe('Bar color'),
})

const lineChartInput = z.object({
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  xKey: z.string(),
  yKey: z.string(),
  title: z.string().optional(),
  color: z.string().optional(),
})

const pieChartInput = z.object({
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  nameKey: z.string().describe('Key for category names'),
  valueKey: z.string().describe('Key for numeric values'),
  title: z.string().optional(),
})

const areaChartInput = z.object({
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  xKey: z.string(),
  yKey: z.string(),
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

/**
 * Tool map passed to `streamText({ tools })`. Tool results are rendered by
 * the component registry; we do not declare `execute` because the tools are
 * display-only — the UI handles the result on the client.
 */
export const GENUI_TOOLS = {
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
  render_image_grid: tool({
    description:
      'Display a gallery of images in a responsive grid. Use for visual search results or photo collections.',
    inputSchema: imageGridInput,
  }),
} as const

export type GenUIToolName = keyof typeof GENUI_TOOLS
