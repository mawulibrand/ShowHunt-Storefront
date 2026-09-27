import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
function luminance(token) {
  const hex = css.match(new RegExp(`--${token}:(#[0-9a-f]{6})[;}]`, 'i'))?.[1];
  assert.ok(hex, `Missing color token: ${token}`);
  const rgb = hex.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
test('normal text token pairs meet WCAG AA contrast', () => {
  for (const [foreground, background] of [['navy', 'orange'], ['white', 'navy'], ['white', 'teal-accessible'], ['text-muted', 'white']]) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${foreground}/${background}`);
  }
});
