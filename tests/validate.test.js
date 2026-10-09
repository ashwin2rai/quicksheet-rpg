import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCharacter } from '../src/generator.js';
import { validateCharacter } from '../src/validate.js';
import { getCatalog, clone } from './helpers.js';

async function base(input = {}) {
  const catalog = await getCatalog();
  const c = generateCharacter({ seed: 'validator-base', ...input }, catalog);
  assert.ok(validateCharacter(c, catalog).valid);
  return { catalog, c };
}
async function expectError(mutate, pattern, input) {
  const { catalog, c } = await base(input);
  const bad = clone(c);
  mutate(bad, catalog);
  const result = validateCharacter(bad, catalog);
  assert.equal(result.valid, false, 'mutation should be rejected');
  assert.ok(result.errors.some((e) => pattern.test(e)), `expected ${pattern} in:\n${result.errors.join('\n')}`);
}

test('rejects an illegal trait array', () =>
  expectError((c) => { c.traits.agility = 2; c.traits.strength = 2; }, /base traits must be exactly/));

test('rejects a subclass from another class', () =>
  expectError((c) => { c.selections.classId = 'class.guardian'; c.selections.subclassId = 'subclass.troubadour'; c.requested = {}; }, /does not belong to class/));

test('rejects duplicate and off-domain domain cards', async () => {
  await expectError((c) => { c.domainCards[1] = { ...c.domainCards[0] }; }, /distinct/);
  await expectError((c) => { c.domainCards[0].cardId = 'card.get-back-up'; }, /outside Bard's domains/, { classId: 'class.bard' });
  await expectError((c) => { c.domainCards.pop(); }, /exactly 2 domain cards/);
});

test('rejects illegal loadouts', async () => {
  await expectError((c) => { c.equipment = { primaryWeaponId: 'weapon.battleaxe', secondaryWeaponId: 'weapon.round-shield', armorId: c.equipment.armorId }; }, /two-handed/);
  await expectError((c) => { c.equipment = { primaryWeaponId: 'weapon.mace', secondaryWeaponId: null, armorId: c.equipment.armorId }; }, /one-handed primary/);
  await expectError((c) => { c.equipment = { primaryWeaponId: 'weapon.greatstaff', secondaryWeaponId: null, armorId: c.equipment.armorId }; }, /magic weapon/, { classId: 'class.guardian' });
  await expectError((c) => { c.equipment.primaryWeaponId = 'weapon.small-dagger'; c.equipment.secondaryWeaponId = 'weapon.whip'; }, /not a primary weapon/);
});

test('rejects stale or wrong derived statistics', async () => {
  await expectError((c) => { c.derived.evasion += 1; }, /derived evasion/);
  await expectError((c) => { c.derived.thresholds.major += 1; }, /thresholds\.major/);
  await expectError((c) => { c.derived.weapons[0].damage = '2d8'; }, /damage/);
  await expectError((c) => { c.derived.hope.starting = 3; }, /hope\.starting/);
});

test('rejects missing mandatory choices and inventory', async () => {
  await expectError((c) => { c.featureChoices = {}; }, /Purposeful Design requires a chosen Experience/, { ancestryId: 'ancestry.clank' });
  await expectError((c) => { c.featureChoices['feature.clank.purposeful-design'] = { experienceId: 'exp.nope' }; }, /does not have/, { ancestryId: 'ancestry.clank' });
  await expectError((c) => { c.inventory = c.inventory.filter((i) => i.itemId !== 'item.nomadic-pack'); }, /granted item/, { communityId: 'community.wanderborne' });
  await expectError((c) => { c.inventory = c.inventory.filter((i) => i.itemId !== 'item.torch'); }, /missing item\.torch/);
  await expectError((c) => { c.inventory.push({ itemId: 'item.minor-stamina-potion', quantity: 1, source: 'starting-potion' }, { itemId: 'item.minor-health-potion', quantity: 1, source: 'starting-potion' }); }, /exactly one of the two minor potions/);
  await expectError((c) => { c.classItem = 'a magic sword'; }, /class item/);
});

test('rejects bad Experiences, deferred features and unhonoured fixed selections', async () => {
  await expectError((c) => { c.experiences[1] = { ...c.experiences[0] }; }, /distinct/);
  await expectError((c) => { c.experiences[0].modifier = 3; }, /must start at \+2/);
  await expectError((c) => { c.subclassTiers = ['foundation', 'specialization']; }, /Foundation subclass tier|progression support/, { subclassId: 'subclass.stalwart' });
  await expectError((c) => { c.requested.ancestryId = 'ancestry.human'; c.selections.ancestryId = 'ancestry.giant'; }, /not honoured/);
  await expectError((c) => { c.contentProfile = 'core+hope-fear'; }, /contentProfile/);
});

test('V1 rules: Mixed Ancestry, burden, granted cards, choices, companion and Beastforms', async () => {
  await expectError((c) => { c.selections.secondAncestryId = c.selections.ancestryId; }, /two different ancestries/, { options: { mixedAncestry: true } });
  await expectError((c) => { c.options.mixedAncestry = false; }, /Mixed Ancestry option/, { options: { mixedAncestry: true } });
  await expectError((c) => { c.selections.secondAncestryId = 'ancestry.human'; }, /not honoured/, { secondAncestryId: 'ancestry.dwarf', ancestryId: 'ancestry.elf' });
  await expectError((c) => { c.equipment = { primaryWeaponId: 'weapon.battleaxe', secondaryWeaponId: 'weapon.round-shield', armorId: c.equipment.armorId }; }, /two-handed/, { classId: 'class.guardian' });
  await expectError((c) => { c.domainCards.pop(); }, /exactly 3 domain cards/, { subclassId: 'subclass.school-of-knowledge' });
  await expectError((c) => { c.featureChoices['feature.elemental-origin.elementalist'] = { option: 'shadow' }; }, /Element must be one of/, { subclassId: 'subclass.elemental-origin' });
  await expectError((c) => { c.featureChoices['feature.wizard.strange-patterns'] = { number: 13 }; }, /from 1 to 12/, { classId: 'class.wizard' });
  await expectError((c) => { c.featureChoices['feature.orderborne.dedicated'].sayings.pop(); }, /exactly three/, { communityId: 'community.orderborne' });
  await expectError((c) => { delete c.featureChoices['feature.beastbound.companion']; }, /Companion choices are missing/, { subclassId: 'subclass.beastbound' });
  await expectError((c) => { c.derived.companion.evasion = 12; }, /companion evasion/, { subclassId: 'subclass.beastbound' });
  await expectError((c) => { c.derived.beastforms[0].damage = '1d12'; }, /damage/, { classId: 'class.druid' });
  await expectError((c) => { c.derived.beastforms.pop(); }, /beastform count/, { classId: 'class.druid' });
  await expectError((c) => { c.derived.resources.find((r) => r.id === 'prayer-dice').value = '9d4'; }, /Prayer Dice/, { classId: 'class.seraph' });
  await expectError((c) => { c.derived.extraAttacks = []; }, /extra attack count/, { ancestryId: 'ancestry.ribbet' });
  await expectError((c) => { c.featureChoices['feature.wizard.strange-patterns'] = { number: 3 }; }, /needs no choice|does not have/, { classId: 'class.bard' });
});

test('never throws on garbage input', async () => {
  const catalog = await getCatalog();
  for (const junk of [{}, { selections: {} }, { selections: { classId: 42 } }]) {
    const result = validateCharacter(junk, catalog);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  }
});
