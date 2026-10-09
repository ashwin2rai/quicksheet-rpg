// Hand-computed expectations from the SRD rules text, independent of derive.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCharacter } from '../src/generator.js';
import { deriveStats } from '../src/derive.js';
import { validateCharacter } from '../src/validate.js';
import { getCatalog } from './helpers.js';

async function build(fixed, equipment, traits, { cards, options } = {}) {
  const catalog = await getCatalog();
  const c = generateCharacter({ ...fixed, seed: 'derive-fixture', options }, catalog);
  c.equipment = equipment;
  if (traits) c.traits = traits;
  if (cards) c.domainCards = cards.map((cardId) => ({ cardId, acquiredAtLevel: 1, location: 'loadout' }));
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
  assert.deepEqual(d.resources.map((r) => [r.label, r.value]), [['Unstoppable Die', 'd4']]);
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
  assert.deepEqual(d.resources.map((r) => [r.label, r.value]), [['Rally Die', 'd6']]);
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

const LEATHER = 'armor.leather-armor';

test('Warrior Combat Training: +level physical damage and ignores burden', async () => {
  const c = await build(
    { subclassId: 'subclass.call-of-the-slayer', ancestryId: 'ancestry.human', communityId: 'community.loreborne' },
    { primaryWeaponId: 'weapon.greatsword', secondaryWeaponId: 'weapon.round-shield', armorId: LEATHER },
    TRAITS,
    { cards: ['card.get-back-up', 'card.not-good-enough'] },
  );
  const d = c.derived;
  assert.equal(d.weapons[0].damage, '1d10+4'); // d10+3, +1 Combat Training (level 1)
  assert.equal(d.weapons[1].damage, '1d4+1'); // Round Shield d4, +1
  assert.equal(d.evasion, 11 - 1); // Warrior 11, Greatsword Massive -1
  assert.equal(d.armorScore, 4); // Leather 3 + Protective 1
  assert.deepEqual(d.resources.map((r) => [r.id, r.value]), [['slayer-dice', '1d6']]); // equal to Proficiency
});

test('Untouchable adds half Agility (rounded up) to Evasion only while in the loadout', async () => {
  const withCard = await build(
    { subclassId: 'subclass.wayfinder', ancestryId: 'ancestry.elf', communityId: 'community.loreborne' },
    { primaryWeaponId: 'weapon.shortbow', secondaryWeaponId: null, armorId: LEATHER },
    { agility: 1, strength: 0, finesse: 2, instinct: 1, presence: 0, knowledge: -1 },
    { cards: ['card.untouchable', 'card.gifted-tracker'] },
  );
  assert.equal(withCard.derived.evasion, 13); // Ranger 12 + ceil(1/2)
  const negative = await build(
    { subclassId: 'subclass.wayfinder', ancestryId: 'ancestry.elf', communityId: 'community.loreborne' },
    { primaryWeaponId: 'weapon.shortbow', secondaryWeaponId: null, armorId: LEATHER },
    { agility: -1, strength: 0, finesse: 2, instinct: 1, presence: 1, knowledge: 0 },
    { cards: ['card.untouchable', 'card.gifted-tracker'] },
  );
  assert.equal(negative.derived.evasion, 12); // half of -1 rounds to 0, never a penalty
});

test('Seraph Prayer Dice equal the Spellcast trait; Rogue Sneak Attack equals tier', async () => {
  const seraph = await build(
    { subclassId: 'subclass.divine-wielder', ancestryId: 'ancestry.dwarf', communityId: 'community.highborne' },
    { primaryWeaponId: 'weapon.hallowed-axe', secondaryWeaponId: 'weapon.round-shield', armorId: 'armor.chainmail-armor' },
    TRAITS, // Strength +2
    { cards: ['card.bolt-beacon', 'card.forceful-push'] },
  );
  assert.deepEqual(seraph.derived.resources.map((r) => [r.id, r.value]), [['prayer-dice', '2d4']]);
  const rogue = await build(
    { subclassId: 'subclass.syndicate', ancestryId: 'ancestry.goblin', communityId: 'community.slyborne' },
    { primaryWeaponId: 'weapon.dagger', secondaryWeaponId: 'weapon.small-dagger', armorId: LEATHER },
    { agility: 1, strength: -1, finesse: 2, instinct: 0, presence: 1, knowledge: 0 },
    { cards: ['card.pick-and-pull', 'card.inspirational-words'] },
  );
  assert.deepEqual(rogue.derived.resources.map((r) => [r.id, r.value]), [['sneak-attack', '+1d6'], ['inspirational-words', '1']]);
});

test('Druid Beastform rows add form bonuses to current stats', async () => {
  const c = await build(
    { subclassId: 'subclass.warden-of-renewal', ancestryId: 'ancestry.firbolg', communityId: 'community.wildborne' },
    { primaryWeaponId: 'weapon.shortstaff', secondaryWeaponId: 'weapon.round-shield', armorId: LEATHER },
    { agility: 1, strength: 0, finesse: -1, instinct: 2, presence: 1, knowledge: 0 },
    { cards: ['card.rune-ward', 'card.vicious-entangle'] },
  );
  const forms = Object.fromEntries(c.derived.beastforms.map((b) => [b.name, b]));
  assert.equal(c.derived.beastforms.length, 6);
  assert.equal(forms['Pack Predator'].evasion, 11); // Druid 10 + 1
  assert.equal(forms['Pack Predator'].attackModifier, 2); // Strength 0 + 2
  assert.equal(forms['Pack Predator'].damage, '1d8+2');
  assert.equal(forms['Household Friend'].attackModifier, 3); // Instinct 2 + 1
  assert.equal(forms['Nimble Grazer'].evasion, 13);
});

test('Beastbound companion uses SRD base statistics', async () => {
  const c = await build(
    { subclassId: 'subclass.beastbound', ancestryId: 'ancestry.faun', communityId: 'community.ridgeborne' },
    { primaryWeaponId: 'weapon.shortbow', secondaryWeaponId: null, armorId: LEATHER },
    { agility: 2, strength: 0, finesse: 1, instinct: 1, presence: 0, knowledge: -1 },
    { cards: ['card.deft-maneuvers', 'card.natures-tongue'] },
  );
  const comp = c.derived.companion;
  assert.equal(comp.evasion, 10);
  assert.equal(comp.stressSlots, 3);
  assert.equal(comp.damage, '1d6');
  assert.equal(comp.commandModifier, 2); // Spellcast Roll uses Agility for Beastbound
  assert.equal(comp.experiences.length, 2);
  assert.ok(comp.experiences.every((e) => e.modifier === 2));
});

test('Ancestry attacks, School of War HP and Seaborne tokens', async () => {
  const drakona = await build(
    { subclassId: 'subclass.school-of-war', ancestryId: 'ancestry.drakona', communityId: 'community.seaborne' },
    { primaryWeaponId: 'weapon.greatstaff', secondaryWeaponId: null, armorId: LEATHER },
    { agility: 0, strength: -1, finesse: 1, instinct: 1, presence: 0, knowledge: 2 },
    { cards: ['card.book-of-ava', 'card.bolt-beacon'] },
  );
  assert.equal(drakona.derived.hpSlots, 6); // Wizard 5 + Battlemage
  const breath = drakona.derived.extraAttacks[0];
  assert.match(breath.name, /^Elemental Breath \((electricity|fire|ice)\)$/);
  assert.deepEqual([breath.attackModifier, breath.range, breath.damage, breath.damageType], [1, 'Very Close', '1d8', 'mag']);
  assert.deepEqual(drakona.derived.resources.map((r) => [r.id, r.value]), [['know-the-tide', '1']]);
  const ribbet = await build(
    { subclassId: 'subclass.call-of-the-brave', ancestryId: 'ancestry.ribbet', communityId: 'community.underborne' },
    { primaryWeaponId: 'weapon.battleaxe', secondaryWeaponId: null, armorId: LEATHER },
    { agility: 0, strength: 2, finesse: 1, instinct: 1, presence: 0, knowledge: -1 },
    { cards: ['card.whirlwind', 'card.deft-maneuvers'] },
  );
  assert.deepEqual(ribbet.derived.extraAttacks.map((a) => [a.name, a.attackModifier, a.damage, a.cost]), [['Long Tongue', 1, '1d12+1', 'Mark a Stress']]); // phy: +1 Combat Training
});
