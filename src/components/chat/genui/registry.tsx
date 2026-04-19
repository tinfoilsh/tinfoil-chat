/**
 * GenUI component registry.
 *
 * Maps each tool name declared in `./tools.ts` to its validator + React
 * component. Tool schemas (descriptions, Zod input shapes) live in `./tools.ts`
 * and are the single source of truth sent to the model; this registry only
 * owns the client-side rendering path.
 */
import { AreaChart, validateAreaChartProps } from './components/AreaChart'
import {
  ArtifactPreview,
  validateArtifactPreviewProps,
} from './components/ArtifactPreview'
import { BarChart, validateBarChartProps } from './components/BarChart'
import { Callout, validateCalloutProps } from './components/Callout'
import {
  ComparisonTable,
  validateComparisonTableProps,
} from './components/ComparisonTable'
import {
  ConfirmationCard,
  validateConfirmationCardProps,
} from './components/ConfirmationCard'
import { DataTable, validateDataTableProps } from './components/DataTable'
import { ImageGrid, validateImageGridProps } from './components/ImageGrid'
import { InfoCard, validateInfoCardProps } from './components/InfoCard'
import {
  KeyValueList,
  validateKeyValueListProps,
} from './components/KeyValueList'
import { LineChart, validateLineChartProps } from './components/LineChart'
import { LinkPreview, validateLinkPreviewProps } from './components/LinkPreview'
import {
  MapPlaceCard,
  validateMapPlaceCardProps,
} from './components/MapPlaceCard'
import { PieChart, validatePieChartProps } from './components/PieChart'
import { ProgressBar, validateProgressBarProps } from './components/ProgressBar'
import {
  RenderedImage,
  validateRenderedImageProps,
} from './components/RenderedImage'
import { SourceCards, validateSourceCardsProps } from './components/SourceCards'
import { StatCards, validateStatCardsProps } from './components/StatCards'
import { Steps, validateStepsProps } from './components/Steps'
import { TaskPlan, validateTaskPlanProps } from './components/TaskPlan'
import { Timeline, validateTimelineProps } from './components/Timeline'
import { WeatherCard, validateWeatherCardProps } from './components/WeatherCard'
import type { GenUIComponentDef } from './types'

const GENUI_COMPONENTS: Record<string, GenUIComponentDef> = {
  render_artifact_preview: {
    validate: validateArtifactPreviewProps,
    component: ArtifactPreview,
  },
  render_info_card: { validate: validateInfoCardProps, component: InfoCard },
  render_data_table: { validate: validateDataTableProps, component: DataTable },
  render_stat_cards: { validate: validateStatCardsProps, component: StatCards },
  render_steps: { validate: validateStepsProps, component: Steps },
  render_task_plan: { validate: validateTaskPlanProps, component: TaskPlan },
  render_progress_bar: {
    validate: validateProgressBarProps,
    component: ProgressBar,
  },
  render_bar_chart: { validate: validateBarChartProps, component: BarChart },
  render_line_chart: { validate: validateLineChartProps, component: LineChart },
  render_pie_chart: { validate: validatePieChartProps, component: PieChart },
  render_area_chart: { validate: validateAreaChartProps, component: AreaChart },
  render_source_cards: {
    validate: validateSourceCardsProps,
    component: SourceCards,
  },
  render_comparison_table: {
    validate: validateComparisonTableProps,
    component: ComparisonTable,
  },
  render_timeline: { validate: validateTimelineProps, component: Timeline },
  render_callout: { validate: validateCalloutProps, component: Callout },
  render_confirmation_card: {
    validate: validateConfirmationCardProps,
    component: ConfirmationCard,
  },
  render_link_preview: {
    validate: validateLinkPreviewProps,
    component: LinkPreview,
  },
  render_key_value_list: {
    validate: validateKeyValueListProps,
    component: KeyValueList,
  },
  render_weather_card: {
    validate: validateWeatherCardProps,
    component: WeatherCard,
  },
  render_map_place_card: {
    validate: validateMapPlaceCardProps,
    component: MapPlaceCard,
  },
  render_image_grid: { validate: validateImageGridProps, component: ImageGrid },
  render_image: {
    validate: validateRenderedImageProps,
    component: RenderedImage,
  },
}

export interface GenUIRenderContext {
  isDarkMode?: boolean
}

export function renderGenUIToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: GenUIRenderContext = {},
): JSX.Element | null {
  const def = GENUI_COMPONENTS[name]
  if (!def) return null
  if (!def.validate(args)) return null

  const Component = def.component
  return <Component {...args} {...ctx} />
}
