import { CARD_HEIGHT, CARD_PADDING, countLines, fitCardText, measureCard } from '@/lib/aboutMe/cardLayout';
import { CARD_THEMES } from '@/lib/aboutMe/personalityCard';

const inner = CARD_HEIGHT - CARD_PADDING * 2;

describe('personality card layout', () => {
  it('wraps words into lines', () => {
    expect(countLines('one two', 10, 0.5, 100)).toBe(1);
    expect(countLines('one two three four five', 10, 0.5, 50)).toBeGreaterThan(1);
  });

  it('shrinks the reported card, which did not fit at full size', () => {
    const theme = CARD_THEMES.find((item) => item.id === 'ignition_switch')!;
    const content = { ...theme, caption: theme.captions.gentle[0] };
    const full = fitCardText({ ...content, caption: 'Hi' });
    expect(measureCard(content, full)).toBeGreaterThan(inner);
    const fitted = fitCardText(content);
    expect(fitted.title).toBeLessThan(31);
    expect(measureCard(content, fitted)).toBeLessThanOrEqual(inner);
  });

  it('fits every theme and caption, with text no smaller than 60%', () => {
    for (const theme of CARD_THEMES) {
      for (const caption of [...theme.captions.gentle, ...theme.captions.cheeky]) {
        const content = { ...theme, caption };
        const sizes = fitCardText(content);
        expect(sizes.title).toBeGreaterThan(31 * 0.6);
        expect(measureCard(content, sizes)).toBeLessThanOrEqual(inner);
      }
    }
  });
});
