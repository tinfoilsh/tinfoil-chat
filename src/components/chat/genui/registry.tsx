import { AreaChart, validateAreaChartProps } from './components/AreaChart'
import { BarChart, validateBarChartProps } from './components/BarChart'
import { Callout, validateCalloutProps } from './components/Callout'
import {
  ComparisonTable,
  validateComparisonTableProps,
} from './components/ComparisonTable'
import { DataTable, validateDataTableProps } from './components/DataTable'
import { ImageGrid, validateImageGridProps } from './components/ImageGrid'
import { InfoCard, validateInfoCardProps } from './components/InfoCard'
import {
  KeyValueList,
  validateKeyValueListProps,
} from './components/KeyValueList'
import { LineChart, validateLineChartProps } from './components/LineChart'
import { LinkPreview, validateLinkPreviewProps } from './components/LinkPreview'
import { PieChart, validatePieChartProps } from './components/PieChart'
import { ProgressBar, validateProgressBarProps } from './components/ProgressBar'
import { SourceCards, validateSourceCardsProps } from './components/SourceCards'
import { StatCards, validateStatCardsProps } from './components/StatCards'
import { Steps, validateStepsProps } from './components/Steps'
import { Timeline, validateTimelineProps } from './components/Timeline'
import type { GenUIComponentDef, GenUIToolDefinition } from './types'

const GENUI_COMPONENTS: Record<string, GenUIComponentDef> = {
  render_info_card: {
    validate: validateInfoCardProps,
    component: InfoCard,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_info_card',
        description:
          'Display a highlighted card with structured information. Use when presenting a single key fact, definition, or summary.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Card title' },
            description: {
              type: 'string',
              description: 'Short description below the title',
            },
            content: {
              type: 'string',
              description: 'Main body content of the card',
            },
            footer: {
              type: 'string',
              description: 'Footer text at the bottom of the card',
            },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
  },
  render_data_table: {
    validate: validateDataTableProps,
    component: DataTable,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_data_table',
        description:
          'Render structured tabular data. Use when presenting rows and columns of information.',
        parameters: {
          type: 'object',
          properties: {
            columns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Column header names',
            },
            rows: {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of row objects where keys match column names',
            },
            caption: {
              type: 'string',
              description: 'Optional table caption',
            },
          },
          required: ['columns', 'rows'],
          additionalProperties: false,
        },
      },
    },
  },
  render_stat_cards: {
    validate: validateStatCardsProps,
    component: StatCards,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_stat_cards',
        description:
          'Display a grid of metrics or statistics. Use when presenting multiple KPIs or numeric summaries.',
        parameters: {
          type: 'object',
          properties: {
            stats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: { type: ['string', 'number'] },
                  trend: { type: 'string', enum: ['up', 'down'] },
                },
                required: ['label', 'value'],
              },
              description: 'Array of stat objects',
            },
          },
          required: ['stats'],
          additionalProperties: false,
        },
      },
    },
  },
  render_steps: {
    validate: validateStepsProps,
    component: Steps,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_steps',
        description:
          'Show an ordered list of steps or a checklist. Use for processes, instructions, or progress tracking.',
        parameters: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  status: {
                    type: 'string',
                    enum: ['pending', 'active', 'complete'],
                  },
                },
                required: ['title'],
              },
              description: 'Array of step objects',
            },
          },
          required: ['steps'],
          additionalProperties: false,
        },
      },
    },
  },
  render_progress_bar: {
    validate: validateProgressBarProps,
    component: ProgressBar,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_progress_bar',
        description:
          'Show progress toward a goal. Use when displaying completion percentage or progress.',
        parameters: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Progress label' },
            value: { type: 'number', description: 'Current progress value' },
            max: {
              type: 'number',
              description: 'Maximum value (defaults to 100)',
            },
          },
          required: ['label', 'value'],
          additionalProperties: false,
        },
      },
    },
  },
  render_bar_chart: {
    validate: validateBarChartProps,
    component: BarChart,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_bar_chart',
        description:
          'Render a bar chart for categorical comparisons. Use when comparing values across categories.',
        parameters: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of data points with xKey and yKey values',
            },
            xKey: {
              type: 'string',
              description: 'Key for category axis values',
            },
            yKey: {
              type: 'string',
              description: 'Key for numeric axis values',
            },
            title: { type: 'string', description: 'Chart title' },
            color: { type: 'string', description: 'Bar color' },
          },
          required: ['data', 'xKey', 'yKey'],
          additionalProperties: false,
        },
      },
    },
  },
  render_line_chart: {
    validate: validateLineChartProps,
    component: LineChart,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_line_chart',
        description:
          'Render a line chart for trends over time. Use when showing how values change across a sequence.',
        parameters: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of data points with xKey and yKey values',
            },
            xKey: {
              type: 'string',
              description: 'Key for horizontal axis values',
            },
            yKey: {
              type: 'string',
              description: 'Key for vertical axis values',
            },
            title: { type: 'string', description: 'Chart title' },
            color: { type: 'string', description: 'Line color' },
          },
          required: ['data', 'xKey', 'yKey'],
          additionalProperties: false,
        },
      },
    },
  },
  render_pie_chart: {
    validate: validatePieChartProps,
    component: PieChart,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_pie_chart',
        description:
          'Render a pie chart for proportional data. Use when showing how parts make up a whole.',
        parameters: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object' },
              description:
                'Array of data points with nameKey and valueKey values',
            },
            nameKey: {
              type: 'string',
              description: 'Key for category names',
            },
            valueKey: {
              type: 'string',
              description: 'Key for numeric values',
            },
            title: { type: 'string', description: 'Chart title' },
          },
          required: ['data', 'nameKey', 'valueKey'],
          additionalProperties: false,
        },
      },
    },
  },
  render_area_chart: {
    validate: validateAreaChartProps,
    component: AreaChart,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_area_chart',
        description:
          'Render a filled area chart for cumulative trends over time. Use for stacked or continuous value progression.',
        parameters: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of data points with xKey and yKey values',
            },
            xKey: {
              type: 'string',
              description: 'Key for horizontal axis values',
            },
            yKey: {
              type: 'string',
              description: 'Key for vertical axis values',
            },
            title: { type: 'string', description: 'Chart title' },
            color: { type: 'string', description: 'Area fill color' },
          },
          required: ['data', 'xKey', 'yKey'],
          additionalProperties: false,
        },
      },
    },
  },
  render_source_cards: {
    validate: validateSourceCardsProps,
    component: SourceCards,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_source_cards',
        description:
          'Display a grid of curated web sources with titles, snippets, and links. Use after web search to surface the most relevant articles.',
        parameters: {
          type: 'object',
          properties: {
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                  snippet: { type: 'string' },
                  publishedAt: { type: 'string' },
                  author: { type: 'string' },
                },
                required: ['title', 'url'],
              },
              description: 'Array of source articles',
            },
            title: {
              type: 'string',
              description: 'Optional heading above the cards',
            },
          },
          required: ['sources'],
          additionalProperties: false,
        },
      },
    },
  },
  render_comparison_table: {
    validate: validateComparisonTableProps,
    component: ComparisonTable,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_comparison_table',
        description:
          'Render a side-by-side feature comparison table. Use for "X vs Y" questions or product matrices. Booleans render as check/cross icons.',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string' },
              description: 'Column headers — the things being compared',
            },
            features: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  values: {
                    type: 'array',
                    description:
                      'Value for each item in order. Use true/false for yes/no features, strings/numbers otherwise.',
                  },
                },
                required: ['label', 'values'],
              },
              description: 'Feature rows with one value per item',
            },
            title: { type: 'string', description: 'Optional table title' },
          },
          required: ['items', 'features'],
          additionalProperties: false,
        },
      },
    },
  },
  render_timeline: {
    validate: validateTimelineProps,
    component: Timeline,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_timeline',
        description:
          'Display a chronological timeline of events. Use for historical sequences, news recaps, or project milestones.',
        parameters: {
          type: 'object',
          properties: {
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['date', 'title'],
              },
              description: 'Timeline events in chronological order',
            },
            title: { type: 'string', description: 'Optional timeline title' },
          },
          required: ['events'],
          additionalProperties: false,
        },
      },
    },
  },
  render_callout: {
    validate: validateCalloutProps,
    component: Callout,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_callout',
        description:
          'Display a highlighted callout box for key takeaways, warnings, tips, or notes.',
        parameters: {
          type: 'object',
          properties: {
            variant: {
              type: 'string',
              enum: ['info', 'success', 'warning', 'error', 'tip'],
              description: 'Visual style; defaults to info',
            },
            title: { type: 'string', description: 'Optional heading' },
            content: { type: 'string', description: 'Callout body text' },
          },
          required: ['content'],
          additionalProperties: false,
        },
      },
    },
  },
  render_link_preview: {
    validate: validateLinkPreviewProps,
    component: LinkPreview,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_link_preview',
        description:
          'Render a single rich link preview card with optional image and description. Use to highlight one hero source or reference.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Link URL' },
            title: { type: 'string', description: 'Page title' },
            description: {
              type: 'string',
              description: 'Short description or excerpt',
            },
            image: {
              type: 'string',
              description: 'Preview image URL (OG image)',
            },
            siteName: {
              type: 'string',
              description: 'Publisher or site name',
            },
          },
          required: ['url', 'title'],
          additionalProperties: false,
        },
      },
    },
  },
  render_key_value_list: {
    validate: validateKeyValueListProps,
    component: KeyValueList,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_key_value_list',
        description:
          'Display a fact sheet of labeled values. Use for structured attributes like specs, company info, or metadata.',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: { type: ['string', 'number'] },
                },
                required: ['label', 'value'],
              },
              description: 'Key-value rows',
            },
            title: { type: 'string', description: 'Optional list title' },
          },
          required: ['items'],
          additionalProperties: false,
        },
      },
    },
  },
  render_image_grid: {
    validate: validateImageGridProps,
    component: ImageGrid,
    toolDefinition: {
      type: 'function',
      function: {
        name: 'render_image_grid',
        description:
          'Display a gallery of images in a responsive grid. Use for visual search results or photo collections.',
        parameters: {
          type: 'object',
          properties: {
            images: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  alt: { type: 'string' },
                  caption: { type: 'string' },
                  link: { type: 'string' },
                },
                required: ['url'],
              },
              description: 'Images to display',
            },
            title: { type: 'string', description: 'Optional gallery title' },
          },
          required: ['images'],
          additionalProperties: false,
        },
      },
    },
  },
}

export const GENUI_TOOL_DEFINITIONS: GenUIToolDefinition[] = Object.values(
  GENUI_COMPONENTS,
).map((def) => def.toolDefinition)

export function renderGenUIToolCall(
  name: string,
  args: Record<string, unknown>,
): JSX.Element | null {
  const def = GENUI_COMPONENTS[name]
  if (!def) return null
  if (!def.validate(args)) return null

  const Component = def.component
  return <Component {...args} />
}
