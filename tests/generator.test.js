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
  for (let i = 0; i < 900; i++) {
    const c = generateCharacter({ seed: `random-${i}` }, catalog);
    assert.ok(validateCharacter(c, catalog).valid);
    for (const key of ['ancestryId', 'communityId', 'classId', 'subclassId']) seen[key].add(c.selections[key]);
    c.domainCards.forEach((x) => seen.cards.add(x.cardId)); // Level 1: creation cards only
    seen.primary.add(c.equipment.primaryWeaponId);
    seen.armor.add(c.equipment.armorId);
  }
  assert.equal(seen.ancestryId.size, catalog.ancestries.length);
  assert.equal(seen.communityId.size, catalog.communities.length);
  assert.equal(seen.classId.size, catalog.classes.length);
  assert.equal(seen.subclassId.size, catalog.subclasses.length);
  assert.equal(seen.cards.size, catalog.domainCards.filter((x) => x.level === 1).length, 'every level 1 card should appear');
  assert.equal(seen.armor.size, catalog.armor.filter((a) => a.tier === 1).length);
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
    assert.deepEqual(c.selections, { ...fixed, secondAncestryId: null });
    assert.deepEqual(c.requested, { ...fixed, secondAncestryId: null });
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
  expectCode({ classId: 'class.assassin' }, 'unknown-id'); // Hope & Fear class: not in Core Only
  expectCode({ ancestryId: 'community.highborne' }, 'unknown-id');
  expectCode({ level: 11 }, 'unsupported-level');
  expectCode({ level: 0 }, 'unsupported-level');
  expectCode({ contentProfile: 'core+hope-fear' }, 'unsupported-profile');
});

test('class-specific rules hold across many seeds', async () => {
  const catalog = await getCatalog();
  let warriorTwoHandedWithSecondary = 0;
  for (let i = 0; i < 600; i++) {
    const c = generateCharacter({ seed: `rules-${i}` }, catalog);
    const subclass = catalog.get(c.selections.subclassId);
    const weapons = [c.equipment.primaryWeaponId, c.equipment.secondaryWeaponId].filter(Boolean).map((id) => catalog.get(id));
    if (!subclass.spellcastTrait) assert.ok(weapons.every((w) => !w.magic), `seed ${i}: magic weapon without Spellcast trait`);
    assert.ok(weapons.every((w) => !w.tags.includes('combat-wheelchair')));
    const twoHandedPlusSecondary = weapons[0].burden === 'two-handed' && weapons.length === 2;
    if (twoHandedPlusSecondary) {
      assert.equal(c.selections.classId, 'class.warrior', `seed ${i}: only burden-ignoring characters may do this`);
      warriorTwoHandedWithSecondary++;
    }
    const isClank = c.selections.ancestryId === 'ancestry.clank';
    assert.equal(Math.max(...c.derived.experiences.map((e) => e.modifier)), isClank ? 3 : 2);
    const hasPack = c.inventory.some((x) => x.itemId === 'item.nomadic-pack');
    assert.equal(hasPack, c.selections.communityId === 'community.wanderborne');
    const expectedCards = c.selections.subclassId === 'subclass.school-of-knowledge' ? 3 : 2;
    assert.equal(c.domainCards.length, expectedCards, `seed ${i}`);
    if (c.selections.classId === 'class.seraph') {
      assert.ok(c.derived.resources.find((r) => r.id === 'prayer-dice').count > 0, `seed ${i}: Seraph with no Prayer Dice`);
    }
    assert.equal(Boolean(c.derived.companion), c.selections.subclassId === 'subclass.beastbound');
    assert.equal(c.derived.beastforms.length > 0, c.selections.classId === 'class.druid');
  }
  assert.ok(warriorTwoHandedWithSecondary > 0, 'Combat Training loadouts should appear');
});

test('every mandatory choice is resolved', async () => {
  const catalog = await getCatalog();
  const cases = [
    [{ ancestryId: 'ancestry.clank' }, 'feature.clank.purposeful-design', (x) => typeof x.experienceId === 'string'],
    [{ ancestryId: 'ancestry.drakona' }, 'feature.drakona.elemental-breath', (x) => ['electricity', 'fire', 'ice'].includes(x.option)],
    [{ communityId: 'community.orderborne' }, 'feature.orderborne.dedicated', (x) => x.sayings.length === 3],
    [{ subclassId: 'subclass.elemental-origin' }, 'feature.elemental-origin.elementalist', (x) => ['air', 'earth', 'fire', 'lightning', 'water'].includes(x.option)],
    [{ classId: 'class.wizard' }, 'feature.wizard.strange-patterns', (x) => x.number >= 1 && x.number <= 12],
    [{ subclassId: 'subclass.beastbound' }, 'feature.beastbound.companion', (x) => x.name && x.animal && x.experiences.length === 2],
  ];
  for (const [input, featureId, check] of cases) {
    for (let i = 0; i < 25; i++) {
      const c = generateCharacter({ ...input, seed: `choice-${featureId}-${i}` }, catalog);
      const choice = c.featureChoices[featureId];
      assert.ok(choice && check(choice), `${featureId} seed ${i}: ${JSON.stringify(choice)}`);
    }
  }
});

test('Mixed Ancestry takes the top feature of one ancestry and the bottom of another', async () => {
  const catalog = await getCatalog();
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const c = generateCharacter({ seed: `mixed-${i}`, ancestryId: 'ancestry.galapa', options: { mixedAncestry: true } }, catalog);
    assert.ok(validateCharacter(c, catalog).valid);
    assert.equal(c.selections.ancestryId, 'ancestry.galapa');
    assert.ok(c.selections.secondAncestryId && c.selections.secondAncestryId !== 'ancestry.galapa');
    seen.add(c.selections.secondAncestryId);
    const md = renderCharacterMarkdown(c, catalog);
    assert.match(md, /\*\*Shell\.\*\*/);
    assert.doesNotMatch(md, /\*\*Retract\.\*\*/);
  }
  assert.ok(seen.size > 10);
  for (let i = 0; i < 30; i++) {
    const both = generateCharacter({ seed: `mixed-fixed-${i}`, ancestryId: 'ancestry.elf', secondAncestryId: 'ancestry.orc', options: { mixedAncestry: true } }, catalog);
    assert.equal(both.selections.ancestryId, 'ancestry.elf');
    assert.equal(both.selections.secondAncestryId, 'ancestry.orc');
    const secondOnly = generateCharacter({ seed: `mixed-second-${i}`, secondAncestryId: 'ancestry.orc' }, catalog);
    assert.ok(validateCharacter(secondOnly, catalog).valid);
    assert.equal(secondOnly.selections.secondAncestryId, 'ancestry.orc');
    assert.notEqual(secondOnly.selections.ancestryId, 'ancestry.orc');
    assert.equal(secondOnly.options.mixedAncestry, true, 'choosing a second ancestry implies Mixed Ancestry');
  }
  assert.throws(
    () => generateCharacter({ ancestryId: 'ancestry.elf', secondAncestryId: 'ancestry.elf' }, catalog),
    (e) => e instanceof GenerationError && e.code === 'mixed-ancestry-duplicate',
  );
  const plain = generateCharacter({ seed: 'not-mixed' }, catalog);
  assert.equal(plain.selections.secondAncestryId, null);
});
