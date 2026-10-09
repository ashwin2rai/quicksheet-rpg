import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCharacter, GenerationError } from '../src/generator.js';
import { validateCharacter } from '../src/validate.js';
import { renderCharacterMarkdown } from '../src/markdown.js';
import { getCatalog } from './helpers.js';

const SEEDS_PER_SUBCLASS = 100;

test(`${SEEDS_PER_SUBCLASS} seeded samples per supported subclass all validate`, async () => {
  const catalog = await getCatalog();
  for (const subclass of catalog.subclasses) {
    for (let i = 0; i < SEEDS_PER_SUBCLASS; i++) {
      const character = generateCharacter({ seed: `${subclass.id}-${i}`, subclassId: subclass.id }, catalog);
      const result = validateCharacter(character, catalog);
      assert.ok(result.valid, `${subclass.id} seed ${i}: ${result.errors.join('; ')}`);
      assert.equal(character.selections.subclassId, subclass.id);
      assert.equal(character.selections.classId, subclass.classId);
    }
  }
});

test('all-Random generation validates and covers every supported option', async () => {
  const catalog = await getCatalog();
  const seen = { ancestryId: new Set(), communityId: new Set(), classId: new Set(), subclassId: new Set(), cards: new Set(), primary: new Set(), armor: new Set() };
  for (let i = 0; i < 400; i++) {
    const c = generateCharacter({ seed: `random-${i}` }, catalog);
    assert.ok(validateCharacter(c, catalog).valid);
    for (const key of ['ancestryId', 'communityId', 'classId', 'subclassId']) seen[key].add(c.selections[key]);
    c.domainCards.forEach((x) => seen.cards.add(x.cardId));
    seen.primary.add(c.equipment.primaryWeaponId);
    seen.armor.add(c.equipment.armorId);
  }
  assert.equal(seen.ancestryId.size, catalog.ancestries.length);
  assert.equal(seen.communityId.size, catalog.communities.length);
  assert.equal(seen.classId.size, catalog.classes.length);
  assert.equal(seen.subclassId.size, catalog.subclasses.length);
  assert.equal(seen.cards.size, catalog.domainCards.length, 'every level 1 card should appear');
  assert.equal(seen.armor.size, catalog.armor.length);
  assert.ok(seen.primary.size >= 12, `expected varied weapons, saw ${seen.primary.size}`);
});

test('same inputs and seed reproduce the same character and sheet', async () => {
  const catalog = await getCatalog();
  const input = { seed: 'repeatable', classId: 'class.bard' };
  const a = generateCharacter(input, catalog);
  const b = generateCharacter(input, catalog);
  assert.deepEqual(a, b);
  assert.equal(renderCharacterMarkdown(a, catalog), renderCharacterMarkdown(b, catalog));
  const c = generateCharacter({ ...input, seed: 'different' }, catalog);
  assert.notDeepEqual(a, c);
});

test('fixed selections survive rerolls while everything else varies', async () => {
  const catalog = await getCatalog();
  const fixed = { ancestryId: 'ancestry.giant', communityId: 'community.loreborne', classId: 'class.guardian', subclassId: 'subclass.vengeance' };
  const names = new Set();
  for (let i = 0; i < 50; i++) {
    const c = generateCharacter({ ...fixed, seed: `reroll-${i}` }, catalog);
    assert.deepEqual(c.selections, fixed);
    assert.deepEqual(c.requested, fixed);
    names.add(c.flavor.name);
  }
  assert.ok(names.size > 40, 'unfixed details should be regenerated');

  for (let i = 0; i < 50; i++) {
    const c = generateCharacter({ classId: 'class.bard', seed: `partial-${i}` }, catalog);
    assert.equal(c.selections.classId, 'class.bard');
    assert.ok(['subclass.troubadour', 'subclass.wordsmith'].includes(c.selections.subclassId));
  }
});

test('a fixed subclass implies its class', async () => {
  const catalog = await getCatalog();
  const c = generateCharacter({ subclassId: 'subclass.wordsmith', seed: 'implied' }, catalog);
  assert.equal(c.selections.classId, 'class.bard');
});

test('incompatible or unknown selections fail loudly instead of emitting a sheet', async () => {
  const catalog = await getCatalog();
  const expectCode = (input, code) => assert.throws(() => generateCharacter(input, catalog), (e) => e instanceof GenerationError && e.code === code);
  expectCode({ classId: 'class.guardian', subclassId: 'subclass.troubadour' }, 'subclass-class-mismatch');
  expectCode({ classId: 'class.wizard' }, 'unknown-id');
  expectCode({ ancestryId: 'community.highborne' }, 'unknown-id');
  expectCode({ level: 2 }, 'unsupported-level');
  expectCode({ contentProfile: 'core+hope-fear' }, 'unsupported-profile');
});

test('class-specific rules hold across many seeds', async () => {
  const catalog = await getCatalog();
  for (let i = 0; i < 200; i++) {
    const c = generateCharacter({ seed: `rules-${i}` }, catalog);
    const subclass = catalog.get(c.selections.subclassId);
    const weapons = [c.equipment.primaryWeaponId, c.equipment.secondaryWeaponId].filter(Boolean).map((id) => catalog.get(id));
    if (!subclass.spellcastTrait) assert.ok(weapons.every((w) => !w.magic), `seed ${i}: magic weapon without Spellcast trait`);
    assert.ok(weapons.every((w) => !w.tags.includes('combat-wheelchair')));
    if (c.selections.ancestryId === 'ancestry.clank') {
      const choice = c.featureChoices['feature.clank.purposeful-design'];
      assert.ok(c.experiences.some((e) => e.id === choice.experienceId));
      assert.equal(Math.max(...c.derived.experiences.map((e) => e.modifier)), 3);
    } else {
      assert.deepEqual(c.featureChoices, {});
      assert.ok(c.derived.experiences.every((e) => e.modifier === 2));
    }
    const hasPack = c.inventory.some((x) => x.itemId === 'item.nomadic-pack');
    assert.equal(hasPack, c.selections.communityId === 'community.wanderborne');
  }
});
