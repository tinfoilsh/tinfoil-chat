export const SIDEBAR_PATTERN_EDGE_WIDTH_PX = 6
const TILE_HEIGHT_PX = 14
const BORDER_WIDTH_PX = 0.5
const DARK_PATTERN_COLOR = 'rgba(6, 24, 32, 0.25)'
const LIGHT_PATTERN_COLOR = 'rgba(249, 248, 246, 0.28)'

export function SidebarPatternEdge({ isDarkMode }: { isDarkMode: boolean }) {
  const color = isDarkMode ? LIGHT_PATTERN_COLOR : DARK_PATTERN_COLOR
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDEBAR_PATTERN_EDGE_WIDTH_PX}" height="${TILE_HEIGHT_PX}">
    <path d="M1 0 L5 7 L1 14" fill="none" stroke="${color}" stroke-width="0.75" />
    <path d="M1.5 4.5 L3.125 7 L1.5 9.5 Z" fill="${color}" />
    <path d="M5 -3 L5 3 L3.125 0 Z M5 11 L5 17 L3.125 14 Z" fill="${color}" />
  </svg>`

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 z-20"
      style={{
        width: `${SIDEBAR_PATTERN_EDGE_WIDTH_PX}px`,
        backgroundColor: 'hsl(var(--surface-sidebar))',
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(tile)}")`,
        backgroundRepeat: 'repeat-y',
        borderLeft: `${BORDER_WIDTH_PX}px solid ${color}`,
        borderRight: `${BORDER_WIDTH_PX}px solid ${color}`,
      }}
    />
  )
}
