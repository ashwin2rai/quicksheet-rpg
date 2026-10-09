import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkData, loadAllData } from '../tools/lib/data-checks.mjs';
import { getCatalog, readJson, clone } from './helpers.js';

test('all data passes integrity checks', async () => {
  const errors = checkData(await loadAllData(readJson));
  assert.deepEqual(errors, []);
});

test('integrity checks catch broken references and missing source tags', async () => {
  const data = await loadAllData(readJson);
  const broken = clone(data);
  broken.gameDataByProfile.core.classes.records[0].domainIds = ['domain.nope', 'domain.blade'];
  delete broken.gameDataByProfile.core.weapons.records[0].source;
  broken.gameDataByProfile.core.features.records[0].mechanics = { kind: 'resolver', resolver: 'missingResolver' };
  const errors = checkData(broken).join('\n');
  assert.match(errors, /domain\.nope/);
  assert.match(errors, /missing source tag/);
  assert.match(errors, /resolver missingResolver is not implemented/);
});

test('M0 subset matches the documented scope', async () => {
  const catalog = await getCatalog();
  assert.deepEqual(catalog.classes.map((c) => c.name).sort(), ['Bard', 'Guardian']);
  assert.deepEqual(catalog.subclasses.map((s) => s.name).sort(), ['Stalwart', 'Troubadour', 'Vengeance', 'Wordsmith']);
  assert.deepEqual(catalog.ancestries.map((a) => a.name).sort(), ['Clank', 'Galapa', 'Giant', 'Human', 'Simiah']);
  assert.deepEqual(catalog.communities.map((c) => c.name).sort(), ['Highborne', 'Loreborne', 'Wanderborne', 'Wildborne']);
  // Spec: Bard = Codex + Grace, Guardian = Blade + Valor
  assert.deepEqual([...catalog.get('class.bard').domainIds].sort(), ['domain.codex', 'domain.grace']);
  assert.deepEqual([...catalog.get('class.guardian').domainIds].sort(), ['domain.blade', 'domain.valor']);
  assert.equal(catalog.domainCardsFor('class.bard', 1).length, 6);
  assert.equal(catalog.domainCardsFor('class.guardian', 1).length, 6);
});

test('SRD facts spot-checked against the rulebook text', async () => {
  const catalog = await getCatalog();
  const bard = catalog.get('class.bard');
  const guardian = catalog.get('class.guardian');
  assert.equal(bard.startingEvasion, 10);
  assert.equal(bard.startingHp, 5);
  assert.equal(guardian.startingEvasion, 9);
  assert.equal(guardian.startingHp, 7);
  assert.equal(catalog.get('subclass.troubadour').spellcastTrait, 'presence');
  assert.equal(catalog.get('subclass.wordsmith').spellcastTrait, 'presence');
  assert.equal(catalog.get('subclass.stalwart').spellcastTrait, null);
  assert.equal(catalog.get('subclass.vengeance').spellcastTrait, null);
  const chainmail = catalog.get('armor.chainmail-armor');
  assert.deepEqual([chainmail.baseThresholds.major, chainmail.baseThresholds.severe, chainmail.baseScore], [7, 15, 4]);
  const longsword = catalog.get('weapon.longsword'); // errata-updated entry
  assert.deepEqual([longsword.trait, longsword.damage, longsword.burden], ['agility', { die: 10, bonus: 3 }, 'two-handed']);
  assert.equal(catalog.get('card.book-of-ava').recallCost, 2);
});

test('core profile contains no Hope & Fear records', async () => {
  const catalog = await getCatalog();
  for (const list of [catalog.classes, catalog.subclasses, catalog.ancestries, catalog.communities, catalog.domainCards, catalog.weapons, catalog.armor, catalog.items, catalog.features]) {
    for (const r of list) {
      assert.equal(r.source.sourceSet, 'core', r.id);
      assert.ok(!r.source.pages.some((p) => p.startsWith('DH HF')), r.id);
    }
  }
  assert.ok(!catalog.has('weapon.brass-knuckles'));
});
