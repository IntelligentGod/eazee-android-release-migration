import fs from 'fs';
import path from 'path';

/**
 * The Eazee Pro row once shipped opening a panel that nothing rendered: the
 * settings sheet set activePanel to 'paywall' but the activeContent chain had
 * no branch for it, so tapping the row silently did nothing. Imports and
 * handlers all existed, which is why a grep for "paywall" looked fine.
 *
 * These assert the wiring end to end rather than the presence of a word.
 */
const sheetSource = fs.readFileSync(
  path.join(__dirname, '..', 'HomeSettingsSheet.tsx'),
  'utf8'
);

describe('paywall wiring in HomeSettingsSheet', () => {
  it('accepts paywall as a panel', () => {
    expect(sheetSource).toMatch(/type HomeSettingsPanel =[^;]*'paywall'/);
    expect(sheetSource).toMatch(/value === 'paywall'/);
  });

  it('opens the panel from the Eazee Pro row', () => {
    expect(sheetSource).toMatch(/label="Eazee Pro"[\s\S]{0,200}onPress=\{handleOpenPaywall\}/);
    expect(sheetSource).toMatch(/handleOpenPaywall = useCallback\(\(\) => \{\s*setActivePanel\('paywall'\)/);
  });

  it('renders PaywallPanel when that panel is active', () => {
    expect(sheetSource).toMatch(
      /activeContent = activePanel === 'paywall'\s*\?\s*\(\s*<PaywallPanel/
    );
  });

  it('returns to settings on hardware back instead of closing the sheet', () => {
    expect(sheetSource).toMatch(
      /activePanel === 'paywall'\)\s*\{\s*handleClosePaywall\(\);\s*return true;/
    );
  });
});
