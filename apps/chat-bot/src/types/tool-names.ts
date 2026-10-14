export const TOOL_NAMES = {
  webSearch: 'web_search',
  webScraper: 'web_scraper',
  retrieveTextChunks: 'retrieve_text_chunks',
  retrieveEntireFile: 'retrieve_entire_file',
  mundoSearch: 'mundo_search',
  mathCalculate: 'math_calculate',
  createPlot: 'create_plot',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
