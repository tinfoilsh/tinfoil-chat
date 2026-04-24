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
import {
  CalendarWidget,
  validateCalendarWidgetProps,
} from './components/CalendarWidget'
import { Callout, validateCalloutProps } from './components/Callout'
import { ClockWidget, validateClockWidgetProps } from './components/ClockWidget'
import {
  ComparisonTable,
  validateComparisonTableProps,
} from './components/ComparisonTable'
import {
  ConfirmationCard,
  validateConfirmationCardProps,
} from './components/ConfirmationCard'
import { Countdown, validateCountdownProps } from './components/Countdown'
import {
  CurrencyConverter,
  validateCurrencyConverterProps,
} from './components/CurrencyConverter'
import { DataTable, validateDataTableProps } from './components/DataTable'
import {
  FlightStatusCard,
  validateFlightStatusProps,
} from './components/FlightStatus'
import { Gauge, validateGaugeProps } from './components/Gauge'
import { ImageGrid, validateImageGridProps } from './components/ImageGrid'
import { InfoCard, validateInfoCardProps } from './components/InfoCard'
import {
  KeyValueList,
  validateKeyValueListProps,
} from './components/KeyValueList'
import { Leaderboard, validateLeaderboardProps } from './components/Leaderboard'
import { LineChart, validateLineChartProps } from './components/LineChart'
import { LinkPreview, validateLinkPreviewProps } from './components/LinkPreview'
import {
  MapPlaceCard,
  validateMapPlaceCardProps,
} from './components/MapPlaceCard'
import { PieChart, validatePieChartProps } from './components/PieChart'
import { PlacesMap, validatePlacesMapProps } from './components/PlacesMap'
import { ProgressBar, validateProgressBarProps } from './components/ProgressBar'
import { Quote, validateQuoteProps } from './components/Quote'
import { RecipeCard, validateRecipeCardProps } from './components/RecipeCard'
import {
  RenderedImage,
  validateRenderedImageProps,
} from './components/RenderedImage'
import { SourceCards, validateSourceCardsProps } from './components/SourceCards'
import { StatCards, validateStatCardsProps } from './components/StatCards'
import { Steps, validateStepsProps } from './components/Steps'
import { StockTicker, validateStockTickerProps } from './components/StockTicker'
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
  render_clock: {
    validate: validateClockWidgetProps,
    component: ClockWidget,
  },
  render_stock_ticker: {
    validate: validateStockTickerProps,
    component: StockTicker,
  },
  render_calendar: {
    validate: validateCalendarWidgetProps,
    component: CalendarWidget,
  },
  render_places_map: {
    validate: validatePlacesMapProps,
    component: PlacesMap,
  },
  render_flight_status: {
    validate: validateFlightStatusProps,
    component: FlightStatusCard,
  },
  render_countdown: {
    validate: validateCountdownProps,
    component: Countdown,
  },
  render_quote: {
    validate: validateQuoteProps,
    component: Quote,
  },
  render_recipe_card: {
    validate: validateRecipeCardProps,
    component: RecipeCard,
  },
  render_currency_converter: {
    validate: validateCurrencyConverterProps,
    component: CurrencyConverter,
  },
  render_gauge: {
    validate: validateGaugeProps,
    component: Gauge,
  },
  render_leaderboard: {
    validate: validateLeaderboardProps,
    component: Leaderboard,
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
