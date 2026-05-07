// CORS headers for public widget endpoints — these are called from any origin
// (third-party sites embedding the widget, or file:// during local dev).
export const WIDGET_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, ngrok-skip-browser-warning',
} as const

export function widgetCorsResponse() {
  return new Response(null, { status: 204, headers: WIDGET_CORS_HEADERS })
}
