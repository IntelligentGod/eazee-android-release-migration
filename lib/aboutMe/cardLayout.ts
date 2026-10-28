/**
 * Text sizes for the personality card (a fixed 4:5 card, 360 x 450 design units). Long themes
 * get smaller text so the title, joke, three lines and the footer always fit; text never shrinks
 * on its own reliably (iOS ignores it with a set line height), so the sizes are worked out here.
 */
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 450;
export const CARD_PADDING = 28;
const INNER_WIDTH = CARD_WIDTH - CARD_PADDING * 2;
const INNER_HEIGHT = CARD_HEIGHT - CARD_PADDING * 2;

/** Average glyph width as a share of the font size, per text style (slightly generous for iOS fonts). */
const WIDTH_RATIO = { title: 0.7, caption: 0.53, value: 0.56 } as const;

export type CardTextSizes = {
  title: number;
  titleLine: number;
  caption: number;
  captionLine: number;
  value: number;
  valueLine: number;
  label: number;
  /** Gap between sections. */
  gap: number;
};

/** Lines a text takes when wrapped word by word at this size. */
export function countLines(text: string, fontSize: number, ratio: number, width = INNER_WIDTH) {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * ratio)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const length = word.length;
    if (used === 0) {
      used = length;
    } else if (used + 1 + length <= charsPerLine) {
      used += 1 + length;
    } else {
      lines += 1;
      used = length;
    }
    while (used > charsPerLine) {
      lines += 1;
      used -= charsPerLine;
    }
  }
  return lines;
}

const sizesAt = (scale: number): CardTextSizes => ({
  title: 31 * scale,
  titleLine: 35 * scale,
  caption: 16 * scale,
  captionLine: 22 * scale,
  value: 17 * scale,
  valueLine: 21 * scale,
  label: 11,
  gap: 14 * Math.max(0.7, scale),
});

/** Height the card's content needs at these sizes (design units). */
export function measureCard(
  content: { title: string; caption: string; superpower: string; plotTwist: string; move: string },
  sizes: CardTextSizes
) {
  const header = 30;
  const title = countLines(content.title.toUpperCase(), sizes.title, WIDTH_RATIO.title) * sizes.titleLine;
  const caption = countLines(`“${content.caption}”`, sizes.caption, WIDTH_RATIO.caption) * sizes.captionLine;
  const values = [content.superpower, content.plotTwist, content.move]
    .map((value) => 14 + 2 + countLines(value, sizes.value, WIDTH_RATIO.value) * sizes.valueLine)
    .reduce((sum, height) => sum + height, 0);
  const footer = 14 + 4 + 14;
  // header, title, caption | three lines (2 gaps) | footer, with a section gap between each part.
  return header + title + caption + values + footer + sizes.gap * 2 + sizes.gap * 2 + 12 * 2 + sizes.gap;
}

/** The largest text sizes (down to 60%) at which this card's content fits. */
export function fitCardText(content: Parameters<typeof measureCard>[0]): CardTextSizes {
  for (let scale = 1; scale > 0.6; scale -= 0.025) {
    const sizes = sizesAt(scale);
    if (measureCard(content, sizes) <= INNER_HEIGHT) return sizes;
  }
  return sizesAt(0.6);
}
