export const WAVE_EVENT_DESCRIPTION_SENTINEL = 'Event created from wave';

const HTML_TAG_PATTERN =
  /<\/?(?:a|b|blockquote|body|br|center|code|dd|del|div|dl|dt|em|font|h[1-6]|head|hr|html|i|img|ins|li|ol|p|pre|s|small|span|strong|sub|sup|table|tbody|td|tfoot|th|thead|tr|u|ul)(?:\s[^>]*)?>/gi;

export function normalizeCalendarDetailsText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text === WAVE_EVENT_DESCRIPTION_SENTINEL) return '';

  return text
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
