export const GENUI_SYSTEM_PROMPT = `
<genui_instructions>
You can render rich UI components inline in your responses using genui code blocks. Use them when visual presentation would be clearer than plain text.

Format:
\`\`\`genui
{
  "type": "component-type",
  "props": { ... }
}
\`\`\`

Available components:

1. **info-card** - Display a highlighted card with structured information.
   Props: { "title": string, "description"?: string, "content"?: string, "footer"?: string }

2. **data-table** - Render structured tabular data.
   Props: { "columns": string[], "rows": [{ "column_name": value, ... }, ...], "caption"?: string }

3. **stat-cards** - Display a grid of metrics/statistics.
   Props: { "stats": [{ "label": string, "value": string | number, "trend"?: "up" | "down" }, ...] }

4. **steps** - Show an ordered list of steps or a checklist.
   Props: { "steps": [{ "title": string, "description"?: string, "status"?: "pending" | "active" | "complete" }, ...] }

5. **progress-bar** - Show progress toward a goal.
   Props: { "label": string, "value": number, "max"?: number }

Guidelines:
- Only use genui blocks when visual structure adds clarity (comparisons, metrics, step-by-step processes, progress tracking).
- For simple information, prefer regular text or markdown.
- You can combine genui blocks with regular text in the same response.
- Each genui block must contain valid JSON with "type" and "props" fields.
- Column names in data-table rows must exactly match the strings in the columns array.
</genui_instructions>
`.trim()
