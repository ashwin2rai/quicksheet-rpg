import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { renderCharacterSheet, sheetNameFromMarkdown } from '../src/sheet-view.js';
import { markdownToHtml } from '../src/preview.js';

const snapshot = (name) => readFileSync(new URL(`snapshots/${name}`, import.meta.url), 'utf8');

test('the visual folio presents the exact Markdown identity, traits, vitals and combat data', () => {
  const markdown = snapshot('nightwalker.md');
  const html = renderCharacterSheet(markdown);
  assert.equal(sheetNameFromMarkdown(markdown), 'Ottilie Tallowmere');
  assert.match(html, /Ottilie Tallowmere/);
  assert.match(html, /Rogue · Nightwalker/);
  assert.match(html, /Fungril \/ Wildborne/);
  assert.equal((html.match(/class="trait"/g) ?? []).length, 6);
  assert.match(html, /class="folio-track folio-track--hope"/);
  assert.match(html, /Major damage/);
  assert.match(html, /Severe damage/);
  assert.match(html, /Returning Blade/);
  assert.match(html, /1d8 mag/);
  assert.match(html, /Deft Deceiver/);
  assert.match(html, /Shadow Stepper/);
  assert.match(html, /What did you get caught doing/);
  assert.match(html, /High Concept:<\/strong> Exiled Charming Scoundrel/);
  assert.match(html, /Trouble:<\/strong> Owes the Wrong People Money/);
  assert.match(html, /Source notes & attribution/);
});

test('high-level sheets include domain vault, special features and advancement chronicle', () => {
  const html = renderCharacterSheet(snapshot('level-10-druid.md'));
  assert.match(html, /LVL 10|<strong>10<\/strong>/);
  assert.match(html, /Form/);
  assert.match(html, /Beastform Options/);
  assert.match(html, /class="vault-fold"/);
  assert.match(html, /class="history-list"/);
  assert.match(html, /Level 10 \(Tier 4\)/);
  assert.equal((html.match(/class="trait"/g) ?? []).length, 6);
  assert.ok((html.match(/class="domain-card /g) ?? []).length >= 10);
});

test('Hope & Fear sheets show the transformation, Dread cards and martial stances', () => {
  const demigod = renderCharacterSheet(snapshot('hf-level-5-warlock-demigod.md'));
  assert.match(demigod, /<span>Transformation<\/span><strong>Demigod<\/strong>/);
  assert.match(demigod, /class="domain-card domain--dread"/);
  assert.match(demigod, /<span>Transformation<\/span><\/div><h4>Demigod<\/h4>/);
  assert.match(demigod, /Gifted/);
  const martial = renderCharacterSheet(snapshot('hf-level-6-martial-artist.md'));
  assert.match(martial, /Martial Stances/);
  assert.doesNotMatch(renderCharacterSheet(snapshot('nightwalker.md')), /<span>Transformation<\/span>/);
});

test('every V2 Markdown fixture is renderable with complete class and domain references', () => {
  const names = readdirSync(new URL('snapshots/', import.meta.url)).filter((name) => name.endsWith('.md'));
  for (const name of names) {
    const md = snapshot(name);
    const html = renderCharacterSheet(md);
    assert.match(html, /class="folio-page"/, name);
    assert.match(html, /class="trait"/, name);
    assert.match(html, /class="domain-card /, name);
    assert.match(html, /Source notes & attribution/, name);
    assert.doesNotMatch(html, /<script|\bundefined\b|\bNaN\b/, name);
  }
});

test('untrusted external Markdown is escaped and other Markdown receives a readable fallback', () => {
  const malicious = '# <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n| orphan pipe\n';
  const html = renderCharacterSheet(malicious);
  assert.match(html, /Document preview/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /orphan pipe/);
  assert.match(markdownToHtml('| not a table'), /not a table/);
});

test('a QuickSheet file with hostile identity content is escaped', () => {
  const md = '# <img onerror=alert(1)>\n\n**Level:** 1 | **Class:** Rogue - Nightwalker\n\n## At a Glance\n\n| Agility | Strength | Finesse | Instinct | Presence | Knowledge |\n| --- | --- | --- | --- | --- | --- |\n| +2 | +1 | +1 | +0 | +0 | -1 |';
  assert.doesNotMatch(renderCharacterSheet(md), /<img/);
  assert.match(renderCharacterSheet(md), /&lt;img onerror=alert\(1\)&gt;/);
});
