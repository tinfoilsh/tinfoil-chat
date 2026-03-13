import { BarChart, validateBarChartProps } from './components/BarChart'
import { DataTable, validateDataTableProps } from './components/DataTable'
import { InfoCard, validateInfoCardProps } from './components/InfoCard'
import { LineChart, validateLineChartProps } from './components/LineChart'
import { PieChart, validatePieChartProps } from './components/PieChart'
import { ProgressBar, validateProgressBarProps } from './components/ProgressBar'
import { StatCards, validateStatCardsProps } from './components/StatCards'
import { Steps, validateStepsProps } from './components/Steps'
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
                  value: {},
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
