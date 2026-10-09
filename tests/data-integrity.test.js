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

test('V1 core scope is complete', async () => {
  const catalog = await getCatalog();
  assert.equal(catalog.classes.length, 9);
  assert.equal(catalog.subclasses.length, 18);
  assert.equal(catalog.ancestries.length, 18);
  assert.equal(catalog.communities.length, 9);
  assert.equal(catalog.domains.length, 9);
  assert.equal(catalog.domainCards.length, 27);
  assert.ok(catalog.has('ancestry.simiah'), 'updated spelling Simiah');
  // Spec section 5: class domains
  const domains = {
    bard: ['codex', 'grace'], druid: ['arcana', 'sage'], guardian: ['blade', 'valor'], ranger: ['bone', 'sage'], rogue: ['grace', 'midnight'],
    seraph: ['splendor', 'valor'], sorcerer: ['arcana', 'midnight'], warrior: ['blade', 'bone'], wizard: ['codex', 'splendor'],
  };
  for (const [cls, expected] of Object.entries(domains)) {
    assert.deepEqual([...catalog.get(`class.${cls}`).domainIds].sort(), expected.map((d) => `domain.${d}`), cls);
    assert.equal(catalog.domainCardsFor(`class.${cls}`, 1).length, 6, cls);
    assert.equal(catalog.subclassesOf(`class.${cls}`).length, 2, cls);
  }
  for (const f of catalog.features.filter((x) => x.category === 'ancestry' || x.category === 'community' || x.category === 'class' || x.category === 'hope' || x.category === 'subclass-foundation')) {
    assert.notEqual(f.mechanics.kind, 'deferred', `${f.id} is needed at Level 1 and must be classified`);
  }
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
  const stats = { druid: [10, 6], ranger: [12, 6], rogue: [12, 6], seraph: [9, 7], sorcerer: [10, 6], warrior: [11, 6], wizard: [11, 5] };
  for (const [cls, [ev, hp]] of Object.entries(stats)) {
    assert.deepEqual([catalog.get(`class.${cls}`).startingEvasion, catalog.get(`class.${cls}`).startingHp], [ev, hp], cls);
  }
  const spell = {
    'warden-of-the-elements': 'instinct', 'warden-of-renewal': 'instinct', beastbound: 'agility', wayfinder: 'agility', nightwalker: 'finesse', syndicate: 'finesse',
    'divine-wielder': 'strength', 'winged-sentinel': 'strength', 'elemental-origin': 'instinct', 'primal-origin': 'instinct',
    'call-of-the-brave': null, 'call-of-the-slayer': null, 'school-of-knowledge': 'knowledge', 'school-of-war': 'knowledge',
  };
  for (const [sub, trait] of Object.entries(spell)) assert.equal(catalog.get(`subclass.${sub}`).spellcastTrait, trait, sub);
  // Old Gus merged two Nightwalker features per tier into one string; the importer splits them.
  assert.deepEqual(catalog.get('subclass.nightwalker').specializationFeatureIds, ['feature.nightwalker.dark-cloud', 'feature.nightwalker.adrenaline']);
  assert.ok(catalog.has('feature.nightwalker.fleeting-shadow'), 'upstream typo "Fleting" corrected');
  assert.equal(catalog.beastforms.filter((b) => b.tier === 1).length, 6);
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
