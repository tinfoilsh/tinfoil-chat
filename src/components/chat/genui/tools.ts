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
  content: z
    .string()
    .optional()
    .describe(
      'Main body content of the card. Supports GitHub-flavored markdown — use "- item" on separate lines for bullet lists and "**bold**" for emphasis.',
    ),
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

const clockWidgetInput = z.object({
  timezone: z
    .string()
    .optional()
    .describe(
      'IANA timezone id, e.g. "America/Los_Angeles" or "Europe/Paris". Omit to use the user\'s local timezone.',
    ),
  label: z
    .string()
    .optional()
    .describe(
      'Optional heading shown above the clock — typically the city or zone name.',
    ),
  style: z
    .enum(['analog', 'digital', 'both'])
    .optional()
    .describe('Visual style (defaults to "both").'),
  showSeconds: z
    .boolean()
    .optional()
    .describe('Whether to show seconds in the digital readout (default true).'),
  hour12: z
    .boolean()
    .optional()
    .describe('Use 12-hour clock with AM/PM (default true).'),
})

const calendarEventInput = z.object({
  date: z
    .string()
    .describe(
      'Event date in ISO form, e.g. "2026-04-24" or a parseable date string.',
    ),
  title: z.string().describe('Short event title.'),
  time: z
    .string()
    .optional()
    .describe('Optional time or time range, e.g. "9:30 AM" or "10–11 AM".'),
  color: z
    .string()
    .optional()
    .describe('Optional CSS color for the event dot, e.g. "#3b82f6" or "red".'),
  description: z
    .string()
    .optional()
    .describe('Optional short description shown in the event list.'),
})

const calendarWidgetInput = z.object({
  month: z
    .string()
    .optional()
    .describe(
      'Initial month to display, e.g. "2026-04" or an ISO date within that month. Defaults to the current month.',
    ),
  weekStartsOn: z
    .enum(['sunday', 'monday'])
    .optional()
    .describe('First day of the week (defaults to "sunday").'),
  events: z
    .array(calendarEventInput)
    .optional()
    .describe(
      'Events to show as dots on their dates and in the event list below the grid.',
    ),
  highlightedDates: z
    .array(z.string())
    .optional()
    .describe(
      'ISO date strings to emphasize on the grid, separate from events.',
    ),
  showEventList: z
    .boolean()
    .optional()
    .describe('Whether to show the event list below the grid (default true).'),
  title: z
    .string()
    .optional()
    .describe('Optional small heading above the month label.'),
})

const stockHistoryPointInput = z.object({
  time: z
    .string()
    .describe(
      'Label for this data point — typically a time like "09:30" or a date like "2024-06-14".',
    ),
  price: z.number().describe('Price at this point in time.'),
})

const stockTickerInput = z.object({
  symbol: z.string().describe('Ticker symbol, e.g. "AAPL" or "TSLA".'),
  name: z.string().optional().describe('Company or instrument name.'),
  exchange: z
    .string()
    .optional()
    .describe('Exchange code, e.g. "NASDAQ" or "NYSE".'),
  currency: z
    .string()
    .optional()
    .describe('ISO currency code for the price (defaults to "USD").'),
  price: z.union([z.string(), z.number()]).describe('Current or latest price.'),
  previousClose: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'Previous session close. Used to derive change/percent when not provided.',
    ),
  change: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Absolute price change vs. previous close.'),
  changePercent: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Percent change vs. previous close (e.g. -1.23).'),
  dayHigh: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Today's high price."),
  dayLow: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Today's low price."),
  openPrice: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Today's open price."),
  volume: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Trading volume for the session.'),
  marketCap: z
    .string()
    .optional()
    .describe('Pre-formatted market cap string, e.g. "2.8T" or "$412B".'),
  rangeLabel: z
    .string()
    .optional()
    .describe(
      'Short label for a single-range history window, e.g. "1D", "5D", "1M", "1Y". Ignored when `ranges` is provided.',
    ),
  history: z
    .array(stockHistoryPointInput)
    .optional()
    .describe(
      'Ordered price history points to render as a sparkline-style chart. Use `ranges` instead when supplying multiple selectable ranges.',
    ),
  ranges: z
    .array(
      z.object({
        label: z
          .string()
          .describe(
            'Short range label, e.g. "1D", "5D", "1M", "6M", "1Y", "5Y".',
          ),
        points: z
          .array(stockHistoryPointInput)
          .describe('Ordered price points for this range.'),
      }),
    )
    .optional()
    .describe(
      'Multiple labeled history series — renders tabs so the user can switch between ranges. Prefer this over `history` when more than one range is available.',
    ),
  marketStatus: z
    .enum(['open', 'closed', 'pre', 'post', 'unknown'])
    .optional()
    .describe('Current market status indicator.'),
  asOf: z
    .string()
    .optional()
    .describe('Timestamp or recency label for the quoted price.'),
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

const placesMapPlaceInput = z.object({
  name: z.string().describe('Place name or label.'),
  address: z.string().optional().describe('Street address or location string.'),
  lat: z
    .number()
    .optional()
    .describe(
      'Latitude in decimal degrees. Include with `lng` for accurate pins.',
    ),
  lng: z
    .number()
    .optional()
    .describe(
      'Longitude in decimal degrees. Include with `lat` for accurate pins.',
    ),
  description: z
    .string()
    .optional()
    .describe('Short description shown under the place entry.'),
})

const placesMapInput = z.object({
  places: z
    .array(placesMapPlaceInput)
    .optional()
    .describe(
      'Places to pin on the map. Use for single-place or multi-place views (e.g. search results).',
    ),
  mode: z
    .enum(['search', 'directions'])
    .optional()
    .describe(
      'Use "directions" with `origin`+`destination` to render a route card; otherwise "search".',
    ),
  origin: placesMapPlaceInput
    .optional()
    .describe('Origin place for directions mode.'),
  destination: placesMapPlaceInput
    .optional()
    .describe('Destination place for directions mode.'),
  title: z.string().optional().describe('Optional header above the map.'),
  footer: z
    .string()
    .optional()
    .describe('Optional small note shown under the action buttons.'),
})

const flightEndpointInput = z.object({
  code: z.string().describe('IATA airport code, e.g. "JFK" or "LAX".'),
  name: z.string().optional().describe('Airport name.'),
  city: z.string().optional().describe('Airport city.'),
  terminal: z.string().optional().describe('Terminal identifier.'),
  gate: z.string().optional().describe('Gate identifier.'),
  scheduledTime: z
    .string()
    .optional()
    .describe('Scheduled local time, e.g. "10:45 AM".'),
  actualTime: z
    .string()
    .optional()
    .describe(
      'Actual or revised local time if different from scheduledTime — shown with scheduled struck through.',
    ),
})

const flightStatusInput = z.object({
  airline: z.string().describe('Airline name, e.g. "Delta Air Lines".'),
  flightNumber: z.string().describe('Flight number, e.g. "123" or "DL 123".'),
  airlineIataCode: z
    .string()
    .optional()
    .describe('Two-letter airline IATA code, e.g. "DL".'),
  origin: flightEndpointInput,
  destination: flightEndpointInput,
  status: z
    .enum([
      'scheduled',
      'boarding',
      'departed',
      'in_air',
      'landed',
      'arrived',
      'delayed',
      'cancelled',
      'diverted',
    ])
    .optional()
    .describe('Current flight status.'),
  statusLabel: z
    .string()
    .optional()
    .describe(
      'Optional custom status label overriding the default for `status`.',
    ),
  duration: z
    .string()
    .optional()
    .describe('Total flight duration, e.g. "5h 20m".'),
  seat: z.string().optional().describe('Seat assignment.'),
  confirmationCode: z
    .string()
    .optional()
    .describe('Booking confirmation / PNR code.'),
  aircraft: z
    .string()
    .optional()
    .describe('Aircraft type, e.g. "Boeing 737-800".'),
  note: z.string().optional().describe('Optional note shown in the footer.'),
})

const countdownInput = z.object({
  target: z
    .string()
    .describe(
      'Target date/time as ISO 8601, e.g. "2026-12-31T23:59:59-08:00". The UI ticks down to this moment.',
    ),
  title: z.string().optional().describe('Optional title above the countdown.'),
  label: z
    .string()
    .optional()
    .describe(
      'Custom label for the target — defaults to a formatted version of `target`.',
    ),
  description: z
    .string()
    .optional()
    .describe('Short description shown under the digits.'),
  showSeconds: z
    .boolean()
    .optional()
    .describe('Whether to show the seconds cell (default true).'),
  completedMessage: z
    .string()
    .optional()
    .describe('Message to display after the target time has passed.'),
})

const quoteInput = z.object({
  text: z.string().describe('Quotation text. Preserves line breaks.'),
  author: z.string().optional().describe('Author or speaker name.'),
  role: z
    .string()
    .optional()
    .describe('Author title, role, or affiliation, e.g. "CEO, Acme".'),
  source: z
    .string()
    .optional()
    .describe('Source name — book, publication, interview, etc.'),
  sourceUrl: z
    .string()
    .optional()
    .describe('URL linking to the full source or article.'),
  publishedAt: z
    .string()
    .optional()
    .describe('Publication date or recency label, e.g. "March 2024".'),
  avatarUrl: z
    .string()
    .optional()
    .describe('Optional author avatar image URL.'),
})

const recipeIngredientInput = z.object({
  item: z.string().describe('Ingredient name, e.g. "flour" or "olive oil".'),
  quantity: z
    .string()
    .optional()
    .describe('Quantity with unit, e.g. "2 cups" or "1 tbsp".'),
  note: z
    .string()
    .optional()
    .describe('Optional note, e.g. "sifted" or "room temperature".'),
})

const recipeStepInput = z.object({
  title: z.string().optional().describe('Short title for the step.'),
  content: z.string().describe('Full step instructions.'),
})

const recipeCardInput = z.object({
  title: z.string().describe('Recipe title.'),
  description: z.string().optional().describe('Short description of the dish.'),
  image: z.string().optional().describe('Hero image URL.'),
  cuisine: z.string().optional().describe('Cuisine style, e.g. "Italian".'),
  difficulty: z
    .enum(['easy', 'medium', 'hard'])
    .optional()
    .describe('Relative difficulty.'),
  servings: z
    .union([z.string(), z.number()])
    .optional()
    .describe('How many servings the recipe yields.'),
  prepTime: z.string().optional().describe('Prep time, e.g. "15 min".'),
  cookTime: z.string().optional().describe('Cook time, e.g. "30 min".'),
  totalTime: z
    .string()
    .optional()
    .describe("Total time, used when prep/cook aren't broken out."),
  ingredients: z
    .array(recipeIngredientInput)
    .optional()
    .describe('List of ingredients with optional quantities and notes.'),
  steps: z
    .array(recipeStepInput)
    .optional()
    .describe('Ordered preparation steps.'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Free-form tags, e.g. "vegan", "gluten-free".'),
  source: z.string().optional().describe('Source name or publication.'),
  sourceUrl: z.string().optional().describe('Link to the original recipe.'),
})

const currencyHistoryPointInput = z.object({
  time: z.string().describe('Label for this point — typically an ISO date.'),
  rate: z.number().describe('Exchange rate at this point.'),
})

const currencyConverterInput = z.object({
  amount: z
    .union([z.string(), z.number()])
    .describe('Amount denominated in `fromCurrency`.'),
  fromCurrency: z.string().describe('Source currency code, e.g. "USD".'),
  toCurrency: z.string().describe('Target currency code, e.g. "EUR".'),
  rate: z
    .union([z.string(), z.number()])
    .describe('Exchange rate so that `amount * rate` = converted amount.'),
  convertedAmount: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'Pre-computed converted amount. If omitted, derived from amount * rate.',
    ),
  asOf: z
    .string()
    .optional()
    .describe('Timestamp or recency label for the quoted rate.'),
  source: z
    .string()
    .optional()
    .describe('Data source, e.g. "ECB" or "xe.com".'),
  rangeLabel: z
    .string()
    .optional()
    .describe('Short label for the history window, e.g. "30D".'),
  history: z
    .array(currencyHistoryPointInput)
    .optional()
    .describe('Ordered rate history points for the sparkline.'),
})

const gaugeZoneInput = z.object({
  from: z.number().describe('Zone start value.'),
  to: z.number().describe('Zone end value.'),
  color: z
    .string()
    .describe('CSS color for the zone, e.g. "#16a34a" or "red".'),
  label: z.string().optional().describe('Optional zone label.'),
})

const gaugeInput = z.object({
  label: z.string().describe('Short label describing what the gauge measures.'),
  value: z.union([z.string(), z.number()]).describe('Current value.'),
  min: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Minimum value (default 0).'),
  max: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Maximum value (default 100).'),
  unit: z
    .string()
    .optional()
    .describe('Short unit shown under the value, e.g. "mph" or "%".'),
  valueLabel: z
    .string()
    .optional()
    .describe('Overrides the unit text under the number, e.g. "AQI".'),
  description: z
    .string()
    .optional()
    .describe('Short description below the gauge.'),
  color: z
    .string()
    .optional()
    .describe(
      'Accent color for the filled arc. Use a CSS color, e.g. "#3b82f6".',
    ),
  zones: z
    .array(gaugeZoneInput)
    .optional()
    .describe(
      'Optional colored zones drawn along the arc to signal thresholds (e.g. "good", "moderate", "unhealthy").',
    ),
  size: z
    .enum(['small', 'default'])
    .optional()
    .describe('Overall gauge size (default "default").'),
})

const leaderboardEntryInput = z.object({
  name: z.string().describe('Entry name or title.'),
  score: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Primary score or metric for this entry.'),
  rank: z
    .number()
    .optional()
    .describe('Explicit rank. If omitted, the entry order is used.'),
  subtitle: z
    .string()
    .optional()
    .describe('Secondary line under the name, e.g. team, country, or role.'),
  change: z
    .number()
    .optional()
    .describe(
      'Positive for rising ranks, negative for falling, zero for unchanged. Rendered as an arrow + delta.',
    ),
  avatarUrl: z.string().optional().describe('Optional avatar image URL.'),
  badge: z
    .string()
    .optional()
    .describe('Small badge shown next to the name, e.g. "MVP".'),
})

const leaderboardInput = z.object({
  title: z.string().optional().describe('Overall leaderboard title.'),
  subtitle: z
    .string()
    .optional()
    .describe('Short subtitle, e.g. the scoring window.'),
  entries: z
    .array(leaderboardEntryInput)
    .describe('Ranked entries, ordered from top to bottom.'),
  scoreLabel: z
    .string()
    .optional()
    .describe('Header for the score column (default "Score").'),
  scoreSuffix: z
    .string()
    .optional()
    .describe('Optional unit appended to every score, e.g. "pts" or "wins".'),
  highlight: z
    .string()
    .optional()
    .describe(
      'Name of an entry to visually emphasize (case-insensitive match), e.g. the current user.',
    ),
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
  render_clock: tool({
    description:
      'Display a live-ticking clock (analog, digital, or both) for the current time in a given timezone. Use when the user asks for the time, wants a clock for a city, or requests a world clock. The clock updates every second on the client.',
    inputSchema: clockWidgetInput,
  }),
  render_stock_ticker: tool({
    description:
      'Display a stock ticker card with current price, change vs. previous close, and an optional price-history sparkline. Use when presenting a quote for a stock, ETF, index, or similar instrument.',
    inputSchema: stockTickerInput,
  }),
  render_calendar: tool({
    description:
      'Display an interactive month calendar with optional events and highlighted dates. Today is marked with a red circle, and the user can navigate between months, jump back to today, and tap a day to see the events scheduled on it. Use when presenting schedules, deadlines, date ranges, or answering "what is the date of…" style questions.',
    inputSchema: calendarWidgetInput,
  }),
  render_places_map: tool({
    description:
      'Display a map-style card for one or more places, or directions between an origin and destination. Renders an SVG mini-map from lat/lng plus deep-link buttons to Apple Maps, Google Maps, and Waze. Prefer this over writing raw map URLs in markdown.',
    inputSchema: placesMapInput,
  }),
  render_flight_status: tool({
    description:
      'Display a boarding-pass-style flight card with airline, flight number, origin/destination codes, scheduled/actual times, gate, terminal, and status. Use for itinerary questions, delay updates, or travel plans.',
    inputSchema: flightStatusInput,
  }),
  render_countdown: tool({
    description:
      'Display a live-ticking countdown to a target date/time, updating every second on the client. Use for "how long until X" questions, launch dates, or event countdowns.',
    inputSchema: countdownInput,
  }),
  render_quote: tool({
    description:
      'Display a pull-quote card with attribution (author, role, source, date). Use when surfacing a notable quotation in the middle of longer prose.',
    inputSchema: quoteInput,
  }),
  render_recipe_card: tool({
    description:
      'Display an interactive recipe card with hero image, timing, servings, a tickable ingredient checklist, and numbered steps the user can mark complete. Use for any cooking-related answer that lists ingredients and steps.',
    inputSchema: recipeCardInput,
  }),
  render_currency_converter: tool({
    description:
      'Display a currency converter card with the current FX rate, converted amount, optional history sparkline, and a client-side editable amount field. Use when answering "how much is X in Y" style questions.',
    inputSchema: currencyConverterInput,
  }),
  render_gauge: tool({
    description:
      'Display a radial gauge for a single value with optional colored threshold zones. Use for speedometer-style metrics, credit scores, air quality, battery/health, or similar single-value indicators where a progress bar feels too flat.',
    inputSchema: gaugeInput,
  }),
  render_leaderboard: tool({
    description:
      'Display a ranked list with positions, avatars, scores, optional rank-change arrows, and an optional highlighted entry. Use for sports standings, top-N lists, or any ranking.',
    inputSchema: leaderboardInput,
  }),
} as const

export type GenUIToolName = keyof typeof GENUI_TOOLS
