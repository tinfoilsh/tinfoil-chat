import { BarChart, validateBarChartProps } from './components/BarChart'
import { DataTable, validateDataTableProps } from './components/DataTable'
import { InfoCard, validateInfoCardProps } from './components/InfoCard'
import { LineChart, validateLineChartProps } from './components/LineChart'
import { PieChart, validatePieChartProps } from './components/PieChart'
import { ProgressBar, validateProgressBarProps } from './components/ProgressBar'
import { StatCards, validateStatCardsProps } from './components/StatCards'
import { Steps, validateStepsProps } from './components/Steps'
import type { GenUIBlock, GenUIComponentDef } from './types'

const GENUI_COMPONENTS: Record<string, GenUIComponentDef> = {
  'info-card': { validate: validateInfoCardProps, component: InfoCard },
  'data-table': { validate: validateDataTableProps, component: DataTable },
  'stat-cards': { validate: validateStatCardsProps, component: StatCards },
  steps: { validate: validateStepsProps, component: Steps },
  'progress-bar': {
    validate: validateProgressBarProps,
    component: ProgressBar,
  },
  'bar-chart': { validate: validateBarChartProps, component: BarChart },
  'line-chart': { validate: validateLineChartProps, component: LineChart },
  'pie-chart': { validate: validatePieChartProps, component: PieChart },
}

export function registerGenUIComponent(
  type: string,
  def: GenUIComponentDef,
): void {
  GENUI_COMPONENTS[type] = def
}

export function renderGenUIBlock(json: unknown): JSX.Element | null {
  if (!json || typeof json !== 'object') return null

  const block = json as GenUIBlock
  if (
    typeof block.type !== 'string' ||
    !block.props ||
    typeof block.props !== 'object'
  ) {
    return null
  }

  const def = GENUI_COMPONENTS[block.type]
  if (!def) return null

  if (!def.validate(block.props)) return null

  const Component = def.component
  return <Component {...block.props} />
}
