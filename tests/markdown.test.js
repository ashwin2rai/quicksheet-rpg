import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { generateCharacter } from '../src/generator.js';
import { renderCharacterMarkdown } from '../src/markdown.js';
import { getCatalog } from './helpers.js';

// Seeded, SRD-backed regression fixtures: one per subclass plus awkward-choice cases.
const FIXTURES = [
  { name: 'bard-troubadour', input: { seed: 'fixture-troubadour', subclassId: 'subclass.troubadour' } },
  { name: 'bard-wordsmith-clank', input: { seed: 'fixture-wordsmith', subclassId: 'subclass.wordsmith', ancestryId: 'ancestry.clank' } },
  { name: 'guardian-stalwart-galapa', input: { seed: 'fixture-stalwart', subclassId: 'subclass.stalwart', ancestryId: 'ancestry.galapa' } },
  { name: 'guardian-vengeance-wanderborne', input: { seed: 'fixture-vengeance', subclassId: 'subclass.vengeance', communityId: 'community.wanderborne', ancestryId: 'ancestry.human' } },
];
const SECTION_ORDER = ['# ', '## At a Glance', '## Combat & Gear', '## Experiences', '## Features', '## Domain Cards - Active Loadout', '## Character Hook', '---'];

for (const fixture of FIXTURES) {
  test(`snapshot: ${fixture.name}`, async () => {
    const catalog = await getCatalog();
    const md = renderCharacterMarkdown(generateCharacter(fixture.input, catalog), catalog);
    const path = new URL(`./snapshots/${fixture.name}.md`, import.meta.url);
    if (process.env.UPDATE_SNAPSHOTS) await writeFile(path, md);
    const expected = await readFile(path, 'utf8');
    assert.equal(md, expected, `Snapshot changed. If intended, run: UPDATE_SNAPSHOTS=1 npm test`);
  });
}

test('every sheet has the required sections in order and no placeholder text', async () => {
  const catalog = await getCatalog();
  for (let i = 0; i < 150; i++) {
    const c = generateCharacter({ seed: `md-${i}` }, catalog);
    const md = renderCharacterMarkdown(c, catalog);
    const lines = md.split('\n');
    const positions = SECTION_ORDER.map((marker) => lines.findIndex((line) => (marker === '# ' ? line.startsWith('# ') : line === marker)));
    assert.ok(positions.every((p) => p >= 0), `seed ${i}: missing section ${SECTION_ORDER[positions.indexOf(-1)]}`);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, `seed ${i}: sections out of order`);
    assert.doesNotMatch(md, /undefined|null|NaN|\[object Object\]|\{[a-zA-Z]+\}/, `seed ${i}`);
    assert.doesNotMatch(md, /<[a-z][^>]*>/i, `seed ${i}: exported Markdown must not contain HTML`);
    assert.doesNotMatch(md, /## Domain Cards - Vault|## Advancement History/, 'Level 1 sheets omit vault and history');
    assert.ok(md.endsWith('\n') && !md.endsWith('\n\n'));
    // Rendered values match the validated model
    assert.ok(md.includes(`**Evasion** ${c.derived.evasion} `));
    assert.ok(md.includes(`Major ${c.derived.thresholds.major} / Severe ${c.derived.thresholds.severe}`));
    for (const e of c.derived.experiences) assert.ok(md.includes(`**${e.name}** +${e.modifier}`));
    for (const card of c.domainCards) assert.ok(md.includes(`### ${catalog.get(card.cardId).name}`));
    for (const w of c.derived.weapons) assert.ok(md.includes(`| ${w.damage} ${w.damageType} |`));
  }
});

test('attribution footer is present in every export', async () => {
  const catalog = await getCatalog();
  const md = renderCharacterMarkdown(generateCharacter({ seed: 'footer' }, catalog), catalog);
  const footer = md.slice(md.lastIndexOf('\n---\n'));
  for (const needle of [
    'Daggerheart System Reference Document 2.0, © Critical Role, LLC. All rights reserved.',
    'https://darringtonpress.com/license/',
    'https://www.daggerheart.com/srd/',
    'https://github.com/callmepartario/og-dhsrd',
    'Darrington Press created the SRD material',
    'not sponsored by, affiliated with, endorsed by, or approved by',
    'Daggerheart™ Compatible',
    'seed `footer`',
  ]) assert.ok(footer.includes(needle), `footer missing: ${needle}`);
  assert.doesNotMatch(md, /no previous modifications/i);
});
