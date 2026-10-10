// V3: the "Core + Hope & Fear" content profile, transformations and the expansion classes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCharacter, GenerationError, GRANTED_WEAPON_CHANCE } from '../src/generator.js';
import { acquiredFeatures, deriveStats } from '../src/derive.js';
import { arrangeLoadout } from '../src/progression.js';
import { validateCharacter } from '../src/validate.js';
import { renderCharacterMarkdown } from '../src/markdown.js';
import { tierForLevel } from '../src/catalog.js';
import { getCatalog, clone, HOPE_FEAR } from './helpers.js';

const hf = () => getCatalog(HOPE_FEAR);
const gen = (input, catalog) => generateCharacter({ contentProfile: HOPE_FEAR, ...input }, catalog);
const EXPANSION_SUBCLASSES = ['executioners-guild', 'poisoners-guild', 'juggernaut', 'martial-artist', 'pact-of-the-endless', 'pact-of-the-wrathful', 'hedge', 'moon'];

/** Every catalog record a character refers to. */
function referencedIds(c, catalog) {
  return [
    ...Object.values(c.selections).filter(Boolean),
    ...acquiredFeatures(c, catalog).map((f) => f.id),
    ...c.domainCards.map((x) => x.cardId),
    ...Object.values(c.equipment).filter(Boolean),
    ...c.inventory.map((i) => i.itemId),
    ...c.advancementHistory.flatMap((h) => [h.domainCardId, ...h.grantedCardIds, h.stanceId]).filter(Boolean),
  ];
}

test('the Hope & Fear profile adds exactly the expansion player options', async () => {
  const core = await getCatalog();
  const both = await hf();
  const count = (catalog) => ['classes', 'subclasses', 'ancestries', 'communities', 'domains', 'domainCards', 'transformations', 'martialStances'].map((k) => catalog[k].length);
  assert.deepEqual(count(core), [9, 18, 18, 9, 9, 189, 0, 0]);
  assert.deepEqual(count(both), [13, 26, 24, 15, 10, 210, 6, 16]);
  const names = (list) => list.filter((r) => r.source.sourceSet === 'hope-fear').map((r) => r.name).sort();
  assert.deepEqual(names(both.classes), ['Assassin', 'Brawler', 'Warlock', 'Witch']);
  assert.deepEqual(names(both.ancestries), ['Aetheris', 'Earthkin', 'Emberkin', 'Gnome', 'Skykin', 'Tidekin']);
  assert.deepEqual(names(both.communities), ['Duneborne', 'Freeborne', 'Frostborne', 'Hearthborne', 'Reborne', 'Warborne']);
  assert.deepEqual(names(both.transformations), ['Demigod', 'Ghost', 'Reanimated', 'Shapeshifter', 'Vampire', 'Werewolf']);
  assert.deepEqual(both.classes.map((c) => [c.name, c.domainIds.join('+')]).filter(([n]) => ['Assassin', 'Brawler', 'Warlock', 'Witch'].includes(n)),
    [['Assassin', 'domain.blade+domain.midnight'], ['Brawler', 'domain.valor+domain.bone'], ['Warlock', 'domain.dread+domain.grace'], ['Witch', 'domain.sage+domain.dread']]);
  // Core records are identical in both profiles.
  for (const r of core.classes) assert.deepEqual(both.get(r.id), r);
  assert.equal(both.weapons.filter((w) => w.source.sourceSet === 'hope-fear').length, 121);
  assert.equal(both.armor.filter((a) => a.source.sourceSet === 'hope-fear').length, 35);
});

test('Core Only never contains an expansion record', async () => {
  const core = await getCatalog();
  for (const id of ['class.warlock', 'ancestry.gnome', 'community.reborne', 'domain.dread', 'card.voice-of-dread', 'transformation.vampire', 'weapon.katana', 'stance.favored']) {
    assert.equal(core.find(id), null, id);
  }
  for (let i = 0; i < 200; i++) {
    const c = generateCharacter({ seed: `core-only-${i}`, level: 1 + (i % 10), options: { mixedAncestry: i % 4 === 0 } }, core);
    assert.equal(c.selections.transformationId, null);
    for (const id of referencedIds(c, core)) assert.equal(core.get(id).source.sourceSet, 'core', id);
    assert.doesNotMatch(renderCharacterMarkdown(c, core), /\| Dread \||\*Dread \d|Hope & Fear|Transformation/);
  }
  assert.throws(() => generateCharacter({ classId: 'class.witch' }, core), (e) => e instanceof GenerationError && e.code === 'unknown-id');
  assert.throws(() => generateCharacter({ transformationId: 'transformation.ghost' }, core), (e) => e.code === 'unknown-id');
  assert.throws(() => generateCharacter({ options: { transformation: true } }, core), (e) => e.code === 'transformation-unavailable');
});

test('every expansion subclass generates valid characters at every level', async () => {
  const catalog = await hf();
  for (const id of EXPANSION_SUBCLASSES) {
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 6; i++) {
        const c = gen({ subclassId: `subclass.${id}`, level, seed: `hf-matrix-${id}-${level}-${i}`, options: { transformation: i % 3 === 0, mixedAncestry: i === 5 } }, catalog);
        const result = validateCharacter(c, catalog);
        assert.ok(result.valid, `${id} L${level}: ${result.errors.join('; ')}`);
        assert.equal(c.contentProfile, HOPE_FEAR);
        assert.equal(c.level, level);
      }
    }
  }
});

test('all-Random Core + Hope & Fear generation validates and reaches every option', async () => {
  const catalog = await hf();
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const c = gen({ seed: `hf-random-${i}`, level: 1 + (i % 10), options: { transformation: i % 2 === 0 } }, catalog);
    assert.ok(validateCharacter(c, catalog).valid);
    for (const id of Object.values(c.selections)) if (id) seen.add(id);
    for (const x of c.domainCards) seen.add(catalog.get(x.cardId).domainId);
  }
  for (const list of [catalog.classes, catalog.subclasses, catalog.ancestries, catalog.communities, catalog.transformations, catalog.domains]) {
    for (const r of list) assert.ok(seen.has(r.id), `${r.id} never generated`);
  }
});

test('Dread cards go only to Warlocks and Witches', async () => {
  const catalog = await hf();
  for (let i = 0; i < 150; i++) {
    const c = gen({ seed: `dread-${i}`, level: 1 + (i % 10) }, catalog);
    const dread = c.domainCards.some((x) => catalog.get(x.cardId).domainId === 'domain.dread');
    if (dread) assert.ok(['class.warlock', 'class.witch'].includes(c.selections.classId));
  }
  const witch = gen({ classId: 'class.witch', level: 10, seed: 'dread-witch' }, catalog);
  assert.ok(witch.domainCards.every((x) => ['domain.sage', 'domain.dread'].includes(catalog.get(x.cardId).domainId)));
});

test('transformations are explicit opt-in, legal and recorded', async () => {
  const catalog = await hf();
  for (let i = 0; i < 60; i++) {
    const c = gen({ seed: `no-transformation-${i}` }, catalog);
    assert.equal(c.selections.transformationId, null);
    assert.equal(c.options.transformation, false);
    assert.equal(c.flavor.transformationQuestion, undefined);
  }
  const picked = new Set();
  for (let i = 0; i < 60; i++) {
    const c = gen({ seed: `random-transformation-${i}`, options: { transformation: true } }, catalog);
    const t = catalog.get(c.selections.transformationId);
    picked.add(t.id);
    assert.ok(t.questions.includes(c.flavor.transformationQuestion));
    const md = renderCharacterMarkdown(c, catalog);
    assert.ok(md.includes(`**Transformation:** ${t.name}`) && md.includes(`### Transformation: ${t.name}`));
    for (const id of t.featureIds) assert.ok(acquiredFeatures(c, catalog).some((f) => f.id === id));
  }
  assert.equal(picked.size, 6);
  for (const t of catalog.transformations) {
    for (const level of [1, 5, 10]) {
      const c = gen({ transformationId: t.id, level, seed: `fixed-${t.id}-${level}` }, catalog);
      assert.ok(validateCharacter(c, catalog).valid);
      assert.equal(c.requested.transformationId, t.id);
    }
  }
  // A recorded transformation must be in the profile, match the option flag and keep its features.
  const c = gen({ transformationId: 'transformation.ghost', seed: 'tamper' }, catalog);
  const flag = clone(c); flag.options.transformation = false;
  assert.match(validateCharacter(flag, catalog).errors.join(), /Transformation option and selections disagree/);
  const core = await getCatalog();
  const leaked = clone(c); leaked.contentProfile = 'core';
  assert.ok(!validateCharacter(leaked, core).valid);
});

test('Shapeshifter keeps one ancestry feature and excludes Mixed Ancestry', async () => {
  const catalog = await hf();
  for (let i = 0; i < 20; i++) {
    const c = gen({ ancestryId: 'ancestry.giant', transformationId: 'transformation.shapeshifter', seed: `shape-${i}` }, catalog);
    const keep = c.featureChoices['feature.shapeshifter.only-skin-deep'].keep;
    const ancestryFeatures = acquiredFeatures(c, catalog).filter((f) => f.category === 'ancestry').map((f) => f.id);
    assert.deepEqual(ancestryFeatures, [keep === 'top' ? 'feature.giant.endurance' : 'feature.giant.reach']);
    // Giant "Endurance" (+1 HP) applies only when kept.
    assert.equal(c.derived.breakdown.hpSlots.some((e) => e.label === 'Endurance'), keep === 'top');
  }
  assert.throws(() => gen({ transformationId: 'transformation.shapeshifter', options: { mixedAncestry: true } }, catalog), (e) => e.code === 'transformation-mixed-ancestry');
  for (let i = 0; i < 80; i++) {
    const c = gen({ seed: `mixed-random-${i}`, options: { mixedAncestry: true, transformation: true } }, catalog);
    assert.notEqual(c.selections.transformationId, 'transformation.shapeshifter');
  }
  const c = gen({ transformationId: 'transformation.shapeshifter', seed: 'shape-tamper' }, catalog);
  const bad = clone(c); bad.featureChoices['feature.shapeshifter.only-skin-deep'].keep = 'both';
  assert.ok(!validateCharacter(bad, catalog).valid);
});

test("Brawler's Strike: two Proficiency-scaled dice, no other weapons, +1 Evasion", async () => {
  const catalog = await hf();
  let strikes = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const c = gen({ classId: 'class.brawler', level: 1 + (i % 10), seed: `strike-${i}` }, catalog);
    if (c.equipment.primaryWeaponId !== 'weapon.brawlers-strike') continue;
    strikes += 1;
    const d = c.derived;
    const p = d.proficiency;
    assert.equal(c.equipment.secondaryWeaponId, null);
    assert.match(d.weapons[0].damage, new RegExp(`^${p}d8\\+${p}d6(\\+\\d+)?$`));
    assert.equal(d.weapons[0].attackTrait, Object.entries(d.traits).reduce((a, b) => (b[1] > a[1] ? b : a))[0]);
    assert.ok(d.breakdown.evasion.some((e) => e.label === "Brawler's Strike (I Am the Weapon)" && e.value === 1));
  }
  assert.ok(Math.abs(strikes / N - GRANTED_WEAPON_CHANCE) < 0.12, `strike rate ${strikes / N}`);
  // Only a feature that grants it makes the weapon legal, and it is used alone.
  const bard = gen({ classId: 'class.warlock', seed: 'not-a-brawler' }, catalog);
  bard.equipment = { ...bard.equipment, primaryWeaponId: 'weapon.brawlers-strike', secondaryWeaponId: null };
  bard.derived = deriveStats(bard, catalog);
  assert.match(validateCharacter(bard, catalog).errors.join(), /requires a feature that grants it/);
  const brawler = gen({ classId: 'class.brawler', seed: 'strike-1' }, catalog);
  brawler.equipment = { ...brawler.equipment, primaryWeaponId: 'weapon.brawlers-strike', secondaryWeaponId: 'weapon.small-dagger' };
  brawler.derived = deriveStats(brawler, catalog);
  assert.match(validateCharacter(brawler, catalog).errors.join(), /only available while no other weapon is active/);
});

test('Combo Die rises one step at most once per tier, from the current tier', async () => {
  const catalog = await hf();
  for (let i = 0; i < 60; i++) {
    const c = gen({ classId: 'class.brawler', level: 10, seed: `combo-${i}` }, catalog);
    const picks = c.advancementHistory.flatMap((h) => h.advancements.filter((a) => a.option === 'comboDie').map((a) => ({ ...a, tier: h.tier })));
    assert.ok(picks.every((a) => a.slotTier === a.tier));
    assert.equal(new Set(picks.map((a) => a.slotTier)).size, picks.length);
    assert.equal(c.derived.resources.find((r) => r.id === 'combo-die').value, ['d4', 'd6', 'd8', 'd10'][picks.length]);
  }
  const c = gen({ classId: 'class.brawler', level: 4, seed: 'combo-tamper' }, catalog);
  const bad = clone(c);
  bad.advancementHistory[0].advancements = [{ option: 'comboDie', slotTier: 2, cost: 1 }, { option: 'hp', slotTier: 2, cost: 1 }];
  bad.advancementHistory[1].advancements = [{ option: 'comboDie', slotTier: 2, cost: 1 }, { option: 'stress', slotTier: 2, cost: 1 }];
  assert.match(validateCharacter(bad, catalog).errors.join(), /no unmarked comboDie slot left in tier 2/);
  const other = gen({ classId: 'class.assassin', level: 2, seed: 'combo-other' }, catalog);
  other.advancementHistory[0].advancements[0] = { option: 'comboDie', slotTier: 2, cost: 1 };
  assert.match(validateCharacter(other, catalog).errors.join(), /unknown or unsupported advancement "comboDie"/);
});

test('Martial Artists know two Tier 1 stances plus one per level', async () => {
  const catalog = await hf();
  for (let level = 1; level <= 10; level++) {
    const c = gen({ subclassId: 'subclass.martial-artist', level, seed: `stance-${level}` }, catalog);
    const stances = c.derived.martialStances;
    assert.equal(stances.length, 2 + level - 1);
    assert.equal(new Set(stances.map((s) => s.id)).size, stances.length);
    for (const s of stances) assert.ok(s.tier <= tierForLevel(s.acquiredAtLevel), `${s.name} learned too early`);
    assert.ok(stances.slice(0, 2).every((s) => s.tier === 1 && s.acquiredAtLevel === 1));
    assert.equal(c.derived.resources.find((r) => r.id === 'focus').value, '6');
    if (level >= 5) assert.ok(renderCharacterMarkdown(c, catalog).includes('### Martial Stances'));
  }
  const c = gen({ subclassId: 'subclass.martial-artist', level: 3, seed: 'stance-tamper' }, catalog);
  const dup = clone(c); dup.advancementHistory[1].stanceId = dup.advancementHistory[0].stanceId;
  assert.match(validateCharacter(dup, catalog).errors.join(), /already known/);
  const high = clone(c); high.advancementHistory[0].stanceId = 'stance.honed';
  assert.match(validateCharacter(high, catalog).errors.join(), /Tier 4 stance, above tier 2/);
  const other = gen({ subclassId: 'subclass.juggernaut', level: 2, seed: 'stance-other' }, catalog);
  other.advancementHistory[0].stanceId = 'stance.favored';
  assert.match(validateCharacter(other, catalog).errors.join(), /without Stance Fighter/);
});

test('class resources: Marked for Death, Patron Die, Favor, Hex', async () => {
  const catalog = await hf();
  const mfd = (input) => gen(input, catalog).derived.resources.find((r) => r.id === 'marked-for-death').value;
  assert.equal(mfd({ subclassId: 'subclass.poisoners-guild', seed: 'mfd-1' }), '+1d4');
  assert.equal(mfd({ subclassId: 'subclass.executioners-guild', seed: 'mfd-2' }), '+1d6'); // Ambush
  for (let i = 0; i < 20; i++) {
    const c = gen({ subclassId: 'subclass.executioners-guild', level: 10, seed: `mfd-10-${i}` }, catalog);
    const die = c.subclassTiers.includes('mastery') ? 'd8' : 'd6'; // Backstab replaces Ambush
    assert.equal(c.derived.resources.find((r) => r.id === 'marked-for-death').value, `+4${die}`);
  }
  for (const level of [1, 4, 5, 10]) {
    const c = gen({ classId: 'class.warlock', level, seed: `patron-${level}` }, catalog);
    const res = Object.fromEntries(c.derived.resources.map((r) => [r.id, r.value]));
    assert.equal(res['patron-die'], level >= 5 ? 'd8' : 'd6');
    assert.equal(res.favor, '3');
    const patron = c.featureChoices['feature.warlock.patrons-pact'];
    assert.ok(catalog.flavor.patronNames.includes(patron.name));
    assert.ok(catalog.get('feature.warlock.patrons-pact').mechanics.choice.options.includes(patron.sphere));
  }
  for (let i = 0; i < 30; i++) {
    const c = gen({ classId: 'class.witch', seed: `hex-${i}` }, catalog);
    const hex = c.derived.resources.find((r) => r.id === 'hex-targets');
    assert.equal(hex.count, c.derived.traits[c.derived.spellcastTrait]);
    assert.ok(hex.count >= 1, 'a witch who cannot Hex anyone is rerolled');
  }
  assert.equal(catalog.get('subclass.moon').spellcastTrait, 'instinct');
});

test('expansion gear and heritage modifiers are applied once', async () => {
  const catalog = await hf();
  // Earthkin "Stoneskin": +1 Armor Score and +1 thresholds.
  const c = gen({ ancestryId: 'ancestry.earthkin', classId: 'class.witch', seed: 'stoneskin' }, catalog);
  c.equipment = { primaryWeaponId: 'weapon.dualstaff', secondaryWeaponId: null, armorId: 'armor.gambeson-armor' };
  c.derived = deriveStats(c, catalog);
  assert.ok(validateCharacter(c, catalog).valid);
  const gambeson = catalog.get('armor.gambeson-armor');
  assert.equal(c.derived.armorScore, gambeson.baseScore + 1);
  assert.equal(c.derived.thresholds.major, gambeson.baseThresholds.major + 1 + 1);

  // Attuned armor: one fewer loadout slot, +tier to thresholds.
  const t4 = gen({ classId: 'class.witch', level: 10, seed: 'attuned' }, catalog);
  t4.equipment = { ...t4.equipment, armorId: 'armor.rune-forged-exosuit' };
  arrangeLoadout(t4, catalog);
  t4.derived = deriveStats(t4, catalog);
  assert.ok(validateCharacter(t4, catalog).valid, validateCharacter(t4, catalog).errors.join('; '));
  assert.equal(t4.domainCards.filter((x) => x.location === 'loadout').length, 4);
  assert.equal(t4.derived.thresholds.major, 12 + 10 + 4 + (t4.derived.breakdown.thresholds.slice(2).reduce((n, e) => n + e.value, 0) - 4));
  assert.match(renderCharacterMarkdown(t4, catalog), /active loadout holds 4 domain cards/);
  const over = clone(t4);
  over.domainCards.find((x) => x.location === 'vault' && !catalog.get(x.cardId).mechanics.vaultOnAcquire).location = 'loadout';
  assert.match(validateCharacter(over, catalog).errors.join(), /more than 4 cards in the active loadout/);

  // Leather Longcoat is campaign-frame gear and is not imported.
  assert.equal(catalog.find('armor.leather-longcoat'), null);
});

test('Demigod "Gifted" adds +1 to every attack roll and damage roll on the sheet', async () => {
  const catalog = await hf();
  for (let i = 0; i < 20; i++) {
    const c = gen({ transformationId: 'transformation.demigod', level: 1 + (i % 10), seed: `gifted-${i}` }, catalog);
    assert.deepEqual(c.derived.actionRollBonus.map((b) => [b.value, b.sourceName]), [[1, 'Gifted']]);
    assert.ok(c.derived.damageBonuses.some((b) => b.sourceName === 'Gifted' && b.value === 1));
    const tampered = clone(c);
    tampered.derived.weapons[0].attackModifier -= 1;
    assert.match(validateCharacter(tampered, catalog).errors.join(), /attack modifier/);
  }
});

test('Old Gus errors are corrected from the official SRD', async () => {
  const catalog = await hf();
  const f = (id) => catalog.get(id);
  assert.deepEqual(f('subclass.poisoners-guild').specializationFeatureIds, ['feature.poisoners-guild.poison-compendium', 'feature.poisoners-guild.twin-fang']);
  assert.match(f('feature.moon.lunar-phases').text, /- 4: \*\*\*Full\.\*\*\* \+3 to damage thresholds\n- 5–6: \*\*\*Waning\.\*\*\*/);
  assert.equal(f('card.dread-touched').type, 'Ability');
  assert.doesNotMatch(f('card.blighting-strike').text, /deal target takes/);
  assert.doesNotMatch(f('card.avatar-of-terror').text, /creture/);
  assert.equal(f('feature.tidekin.amphibious').name, 'Amphibious');
  assert.match(f('feature.warlock.favor').text, /maximum Favor you can hold at one time is 6/);
  assert.match(f('weapon.soul-chain').feature.text, /^On a successful attack, you can/);
});
