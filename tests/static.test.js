import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { htmlToMarkdown, splitNamedFeature, slugify } from '../tools/lib/html-to-markdown.mjs';
import { proficiencyFromHistory, tierForLevel } from '../src/progression.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('static smoke check passes (relative URLs, no remote requests, no Math.random)', () => {
  const out = execFileSync(process.execPath, ['tools/static-smoke.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /passed/);
});

test('importer HTML-to-Markdown conversion', () => {
  assert.equal(htmlToMarkdown("<p>Gain a <a href='#x'>Hope</a> &minus;2 &mdash; ok</p>"), 'Gain a Hope -2 — ok');
  assert.equal(htmlToMarkdown('<p>Intro:</p><ul><li><strong><em>A:</em></strong> one</li><li>two</li></ul><p>End</p>'), 'Intro:\n\n- ***A:*** one\n- two\n\nEnd');
  assert.throws(() => htmlToMarkdown('<table>x</table>'), /Unsupported HTML tag/);
  assert.throws(() => htmlToMarkdown('&bogus;'), /Unknown HTML entity/);
  assert.deepEqual(splitNamedFeature('<p><strong><em>Shell:</em></strong> Gain a bonus.</p>'), { name: 'Shell', text: 'Gain a bonus.' });
  assert.equal(slugify("Tava's Armor"), 'tavas-armor');
});

test('progression scaffolding', () => {
  assert.deepEqual([1, 2, 4, 5, 7, 8, 10].map(tierForLevel), [1, 2, 2, 3, 3, 4, 4]);
  assert.throws(() => tierForLevel(11));
  assert.equal(proficiencyFromHistory([]), 1);
  const achievement = { tierAchievement: { proficiency: 1 }, advancements: [] };
  const profAdv = { tierAchievement: null, advancements: [{ option: 'proficiency', cost: 2 }] };
  assert.equal(proficiencyFromHistory([achievement, profAdv, { tierAchievement: null, advancements: [{ option: 'hp' }] }]), 3);
});
