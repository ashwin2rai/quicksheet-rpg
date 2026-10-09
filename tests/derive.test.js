// Hand-computed expectations from the SRD rules text, independent of derive.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCharacter } from '../src/generator.js';
import { deriveStats } from '../src/derive.js';
import { validateCharacter } from '../src/validate.js';
import { getCatalog } from './helpers.js';

async function build(fixed, equipment, traits) {
  const catalog = await getCatalog();
  const c = generateCharacter({ ...fixed, seed: 'derive-fixture' }, catalog);
  c.equipment = equipment;
  if (traits) c.traits = traits;
  c.derived = deriveStats(c, catalog);
  const result = validateCharacter(c, catalog);
  assert.ok(result.valid, result.errors.join('; '));
  return c;
}
const TRAITS = { agility: 1, strength: 2, finesse: 0, instinct: -1, presence: 1, knowledge: 0 };

test('Galapa Stalwart Guardian in Chainmail with a Battleaxe', async () => {
  const c = await build(
    { ancestryId: 'ancestry.galapa', subclassId: 'subclass.stalwart', communityId: 'community.highborne' },
    { primaryWeaponId: 'weapon.battleaxe', secondaryWeaponId: null, armorId: 'armor.chainmail-armor' },
    TRAITS,
  );
  const d = c.derived;
  assert.equal(d.evasion, 8); // 9 Guardian - 1 Heavy
  assert.equal(d.hpSlots, 7);
  assert.equal(d.stressSlots, 6);
  assert.equal(d.armorScore, 4);
  // 7/15 base + level 1 + Unwavering 1 + Shell (Proficiency 1)
  assert.deepEqual(d.thresholds, { major: 10, severe: 18 });
  assert.equal(d.proficiency, 1);
  assert.deepEqual(d.hope, { starting: 2, max: 6 });
  assert.deepEqual(d.resources.map((r) => [r.label, r.die]), [['Unstoppable Die', 'd4']]);
  assert.equal(d.weapons[0].damage, '1d10+3');
  assert.equal(d.weapons[0].attackModifier, 2); // Strength +2
});

test('Simiah Wordsmith Bard in Gambeson with Rapier and Small Dagger', async () => {
  const c = await build(
    { ancestryId: 'ancestry.simiah', subclassId: 'subclass.wordsmith', communityId: 'community.wildborne' },
    { primaryWeaponId: 'weapon.rapier', secondaryWeaponId: 'weapon.small-dagger', armorId: 'armor.gambeson-armor' },
    { agility: 0, strength: -1, finesse: 1, instinct: 0, presence: 2, knowledge: 1 },
  );
  const d = c.derived;
  assert.equal(d.evasion, 12); // 10 Bard + 1 Nimble + 1 Flexible
  assert.equal(d.hpSlots, 5);
  assert.equal(d.armorScore, 3);
  assert.deepEqual(d.thresholds, { major: 6, severe: 12 });
  assert.equal(d.spellcastTrait, 'presence');
  const [rapier, dagger] = d.weapons;
  assert.equal(rapier.attackModifier, 2);
  assert.equal(rapier.damage, '1d8');
  assert.deepEqual(rapier.conditional.map((x) => x.damage), ['1d8+2']); // Paired
  assert.equal(dagger.attackModifier, 1);
  assert.equal(dagger.damage, '1d8');
  assert.deepEqual(d.resources.map((r) => [r.label, r.die]), [['Rally Die', 'd6']]);
});

test('Human Vengeance Guardian in Full Plate with a Halberd', async () => {
  const c = await build(
    { ancestryId: 'ancestry.human', subclassId: 'subclass.vengeance', communityId: 'community.loreborne' },
    { primaryWeaponId: 'weapon.halberd', secondaryWeaponId: null, armorId: 'armor.full-plate-armor' },
    TRAITS,
  );
  const d = c.derived;
  assert.equal(d.evasion, 7); // 9 - 2 Very Heavy
  assert.equal(d.stressSlots, 8); // 6 + High Stamina + At Ease
  assert.equal(d.traits.agility, 0); // base 1, Very Heavy -1
  assert.equal(d.traits.finesse, -1); // base 0, Cumbersome -1
  assert.deepEqual(d.thresholds, { major: 9, severe: 18 });
  assert.equal(d.traitAdjustments.length, 2);
});

test('Giant with Tower Shield and Round Shield armor effects', async () => {
  const tower = await build(
    { ancestryId: 'ancestry.giant', subclassId: 'subclass.stalwart', communityId: 'community.highborne' },
    { primaryWeaponId: 'weapon.mace', secondaryWeaponId: 'weapon.tower-shield', armorId: 'armor.leather-armor' },
    TRAITS,
  );
  assert.equal(tower.derived.hpSlots, 8); // 7 + Endurance
  assert.equal(tower.derived.armorScore, 5); // 3 + Barrier 2
  assert.equal(tower.derived.evasion, 8); // 9 - Barrier 1
  const round = await build(
    { ancestryId: 'ancestry.giant', subclassId: 'subclass.stalwart', communityId: 'community.highborne' },
    { primaryWeaponId: 'weapon.broadsword', secondaryWeaponId: 'weapon.round-shield', armorId: 'armor.leather-armor' },
    TRAITS,
  );
  assert.equal(round.derived.armorScore, 4);
  assert.equal(round.derived.weapons[0].attackModifier, 2); // Agility +1, Reliable +1
});

test('Clank Purposeful Design adds +1 to exactly one Experience', async () => {
  const c = await build(
    { ancestryId: 'ancestry.clank', subclassId: 'subclass.troubadour', communityId: 'community.highborne' },
    { primaryWeaponId: 'weapon.longsword', secondaryWeaponId: null, armorId: 'armor.leather-armor' },
  );
  const mods = c.derived.experiences.map((e) => e.modifier).sort();
  assert.deepEqual(mods, [2, 3]);
});
