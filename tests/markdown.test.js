import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { generateCharacter } from '../src/generator.js';
import { renderCharacterMarkdown } from '../src/markdown.js';
import { getCatalog, HOPE_FEAR } from './helpers.js';

// Seeded, SRD-backed regression fixtures: one per subclass plus awkward-choice cases.
const FIXTURES = [
  { name: 'troubadour', input: { seed: 'fixture-troubadour', subclassId: 'subclass.troubadour' } },
  { name: 'wordsmith', input: { seed: 'fixture-wordsmith', subclassId: 'subclass.wordsmith' } },
  { name: 'warden-of-the-elements', input: { seed: 'fixture-warden-of-the-elements', subclassId: 'subclass.warden-of-the-elements' } },
  { name: 'warden-of-renewal', input: { seed: 'fixture-warden-of-renewal', subclassId: 'subclass.warden-of-renewal' } },
  { name: 'stalwart', input: { seed: 'fixture-stalwart', subclassId: 'subclass.stalwart' } },
  { name: 'vengeance', input: { seed: 'fixture-vengeance', subclassId: 'subclass.vengeance' } },
  { name: 'beastbound', input: { seed: 'fixture-beastbound', subclassId: 'subclass.beastbound' } },
  { name: 'wayfinder', input: { seed: 'fixture-wayfinder', subclassId: 'subclass.wayfinder' } },
  { name: 'nightwalker', input: { seed: 'fixture-nightwalker', subclassId: 'subclass.nightwalker' } },
  { name: 'syndicate', input: { seed: 'fixture-syndicate', subclassId: 'subclass.syndicate' } },
  { name: 'divine-wielder', input: { seed: 'fixture-divine-wielder', subclassId: 'subclass.divine-wielder' } },
  { name: 'winged-sentinel', input: { seed: 'fixture-winged-sentinel', subclassId: 'subclass.winged-sentinel' } },
  { name: 'elemental-origin', input: { seed: 'fixture-elemental-origin', subclassId: 'subclass.elemental-origin' } },
  { name: 'primal-origin', input: { seed: 'fixture-primal-origin', subclassId: 'subclass.primal-origin' } },
  { name: 'call-of-the-brave', input: { seed: 'fixture-call-of-the-brave', subclassId: 'subclass.call-of-the-brave' } },
  { name: 'call-of-the-slayer', input: { seed: 'fixture-call-of-the-slayer', subclassId: 'subclass.call-of-the-slayer' } },
  { name: 'school-of-knowledge', input: { seed: 'fixture-school-of-knowledge', subclassId: 'subclass.school-of-knowledge' } },
  { name: 'school-of-war', input: { seed: 'fixture-school-of-war', subclassId: 'subclass.school-of-war' } },
  { name: 'clank-purposeful-design', input: { seed: 'fixture-clank', ancestryId: 'ancestry.clank', subclassId: 'subclass.wordsmith' } },
  { name: 'drakona-orderborne', input: { seed: 'fixture-drakona', ancestryId: 'ancestry.drakona', communityId: 'community.orderborne' } },
  { name: 'ribbet-warrior', input: { seed: 'fixture-ribbet', ancestryId: 'ancestry.ribbet', classId: 'class.warrior' } },
  { name: 'galapa-wanderborne-stalwart', input: { seed: 'fixture-galapa', ancestryId: 'ancestry.galapa', communityId: 'community.wanderborne', subclassId: 'subclass.stalwart' } },
  { name: 'mixed-ancestry', input: { seed: 'fixture-mixed', options: { mixedAncestry: true } } },
  // V2: higher levels (tier transitions, vault, companion and Beastform progression, persistent cards)
  { name: 'level-5-troubadour', input: { seed: 'fixture-l5', level: 5, subclassId: 'subclass.troubadour' } },
  { name: 'level-7-slayer', input: { seed: 'fixture-l7', level: 7, subclassId: 'subclass.call-of-the-slayer' } },
  { name: 'level-8-school-of-knowledge', input: { seed: 'fixture-l8', level: 8, subclassId: 'subclass.school-of-knowledge' } },
  { name: 'level-10-beastbound', input: { seed: 'fixture-l10-beastbound', level: 10, subclassId: 'subclass.beastbound' } },
  { name: 'level-10-druid', input: { seed: 'fixture-l10-druid', level: 10, subclassId: 'subclass.warden-of-the-elements' } },
  { name: 'level-10-stalwart', input: { seed: 'fixture-l10-stalwart', level: 10, subclassId: 'subclass.stalwart', ancestryId: 'ancestry.galapa' } },
  { name: 'level-10-nightwalker', input: { seed: 'fixture-l10-nightwalker', level: 10, subclassId: 'subclass.nightwalker' } },
  // V3: Core + Hope & Fear (one per expansion subclass, plus transformations and higher levels)
  ...['executioners-guild', 'poisoners-guild', 'juggernaut', 'martial-artist', 'pact-of-the-endless', 'pact-of-the-wrathful', 'hedge', 'moon']
    .map((id) => ({ name: `hf-${id}`, profile: HOPE_FEAR, input: { seed: `fixture-hf-${id}`, subclassId: `subclass.${id}`, contentProfile: HOPE_FEAR } })),
  { name: 'hf-brawlers-strike', profile: HOPE_FEAR, input: { seed: 'fixture-hf-strike-1', classId: 'class.brawler', contentProfile: HOPE_FEAR } },
  { name: 'hf-level-6-martial-artist', profile: HOPE_FEAR, input: { seed: 'fixture-hf-l6-martial', level: 6, subclassId: 'subclass.martial-artist', contentProfile: HOPE_FEAR } },
  { name: 'hf-level-8-executioner', profile: HOPE_FEAR, input: { seed: 'fixture-hf-l8-exec', level: 8, subclassId: 'subclass.executioners-guild', contentProfile: HOPE_FEAR } },
  { name: 'hf-level-10-witch', profile: HOPE_FEAR, input: { seed: 'fixture-hf-l10-witch', level: 10, subclassId: 'subclass.moon', contentProfile: HOPE_FEAR } },
  { name: 'hf-level-5-warlock-demigod', profile: HOPE_FEAR, input: { seed: 'fixture-hf-demigod', level: 5, classId: 'class.warlock', transformationId: 'transformation.demigod', contentProfile: HOPE_FEAR } },
  { name: 'hf-shapeshifter', profile: HOPE_FEAR, input: { seed: 'fixture-hf-shapeshifter', ancestryId: 'ancestry.earthkin', transformationId: 'transformation.shapeshifter', contentProfile: HOPE_FEAR } },
  { name: 'hf-vampire-core-class', profile: HOPE_FEAR, input: { seed: 'fixture-hf-vampire', level: 3, classId: 'class.rogue', ancestryId: 'ancestry.tidekin', transformationId: 'transformation.vampire', contentProfile: HOPE_FEAR } },
];

const SECTION_ORDER = ['# ', '## At a Glance', '## Combat & Gear', '## Experiences', '## Features', '## Domain Cards - Active Loadout', '## Character Hook', '---'];

for (const fixture of FIXTURES) {
  test(`snapshot: ${fixture.name}`, async () => {
    const catalog = await getCatalog(fixture.profile);
    const md = renderCharacterMarkdown(generateCharacter(fixture.input, catalog), catalog);
    const path = new URL(`./snapshots/${fixture.name}.md`, import.meta.url);
    if (process.env.UPDATE_SNAPSHOTS) await writeFile(path, md);
    const expected = await readFile(path, 'utf8');
    assert.equal(md, expected, `Snapshot changed. If intended, run: UPDATE_SNAPSHOTS=1 npm test`);
  });
}

for (const profile of ['core', HOPE_FEAR]) test(`every sheet has the required sections in order and no placeholder text (${profile})`, async () => {
  const catalog = await getCatalog(profile);
  for (let i = 0; i < 300; i++) {
    const level = 1 + (i % 10);
    const options = { mixedAncestry: i % 5 === 0, transformation: profile === HOPE_FEAR && i % 3 === 0 };
    const c = generateCharacter({ seed: `md-${i}`, level, contentProfile: profile, options }, catalog);
    const md = renderCharacterMarkdown(c, catalog);
    const lines = md.split('\n');
    const positions = SECTION_ORDER.map((marker) => lines.findIndex((line) => (marker === '# ' ? line.startsWith('# ') : line === marker)));
    assert.ok(positions.every((p) => p >= 0), `seed ${i}: missing section ${SECTION_ORDER[positions.indexOf(-1)]}`);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, `seed ${i}: sections out of order`);
    assert.doesNotMatch(md, /undefined|null|NaN|\[object Object\]|\{[a-zA-Z]+\}/, `seed ${i}`);
    assert.doesNotMatch(md, /<[a-z][^>]*>/i, `seed ${i}: exported Markdown must not contain HTML`);
    assert.equal(md.includes('\n## Advancement History\n'), level > 1, 'history appears exactly when level > 1');
    assert.equal(md.includes('\n## Domain Cards - Vault\n'), c.domainCards.some((x) => x.location === 'vault'));
    if (level === 1) assert.doesNotMatch(md, /Gear assumption/);
    else {
      assert.match(md, /Gear assumption/);
      assert.equal((md.match(/^- \*\*Level \d+ \(Tier \d\):\*\*/gm) ?? []).length, level - 1);
    }
    assert.ok(md.includes(`**Level:** ${level} (Tier ${c.derived.tier})`));
    assert.ok(md.endsWith('\n') && !md.endsWith('\n\n'));
    // Rendered values match the validated model
    assert.ok(md.includes(`**Evasion** ${c.derived.evasion} `));
    assert.ok(md.includes(`Major ${c.derived.thresholds.major} / Severe ${c.derived.thresholds.severe}`));
    for (const e of c.derived.experiences) assert.ok(md.includes(`**${e.name}** +${e.modifier}`));
    for (const card of c.domainCards) assert.ok(md.includes(`### ${catalog.get(card.cardId).name}`));
    for (const w of c.derived.weapons) assert.ok(md.includes(`| ${w.damage} ${w.damageType} |`));
    for (const a of c.derived.extraAttacks) assert.ok(md.includes(`| ${a.damage} ${a.damageType} |`));
    for (const r of c.derived.resources) assert.ok(md.includes(r.value), `resource ${r.id}`);
    assert.equal(md.includes('### Companion: '), Boolean(c.derived.companion));
    assert.equal(md.includes('### Beastform Options'), c.derived.beastforms.length > 0);
    assert.equal(md.includes('### Other Attacks'), c.derived.extraAttacks.length > 0);
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
