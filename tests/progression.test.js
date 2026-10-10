// V2: levels 1-10. Every generated character is validated by the independent
// validator, which replays the advancement history; these tests add explicit
// regression checks for tier transitions and double counting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCharacter } from '../src/generator.js';
import { advanceOneLevel, markedTraits } from '../src/progression.js';
import { deriveStats } from '../src/derive.js';
import { validateCharacter } from '../src/validate.js';
import { createRng } from '../src/rng.js';
import { tierForLevel } from '../src/catalog.js';
import { getCatalog, clone } from './helpers.js';

const SEEDS_PER_CELL = 12;

test(`level x subclass matrix: ${SEEDS_PER_CELL} seeds for every level 1-10 and every subclass`, async () => {
  const catalog = await getCatalog();
  let count = 0;
  for (const subclass of catalog.subclasses) {
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < SEEDS_PER_CELL; i++) {
        const c = generateCharacter({ seed: `matrix-${subclass.id}-${level}-${i}`, level, subclassId: subclass.id, options: { mixedAncestry: i % 5 === 0 } }, catalog);
        const result = validateCharacter(c, catalog);
        assert.ok(result.valid, `${subclass.id} L${level} #${i}: ${result.errors.join('; ')}`);
        assert.equal(c.level, level);
        assert.equal(c.derived.tier, tierForLevel(level));
        assert.equal(c.advancementHistory.length, level - 1);
        count++;
      }
    }
  }
  assert.equal(count, 18 * 10 * SEEDS_PER_CELL);
});

test('tier achievements: Experiences and Proficiency at levels 2, 5 and 8', async () => {
  const catalog = await getCatalog();
  const expectedExperiences = { 1: 2, 2: 3, 3: 3, 4: 3, 5: 4, 6: 4, 7: 4, 8: 5, 9: 5, 10: 5 };
  const proficiencyRange = { 1: [1, 1], 2: [2, 2], 3: [2, 2], 4: [2, 2], 5: [3, 4], 6: [3, 4], 7: [3, 4], 8: [4, 6], 9: [4, 6], 10: [4, 6] };
  for (let level = 1; level <= 10; level++) {
    for (let i = 0; i < 20; i++) {
      const c = generateCharacter({ seed: `tiers-${level}-${i}`, level }, catalog);
      assert.equal(c.experiences.length, expectedExperiences[level], `L${level}`);
      const [lo, hi] = proficiencyRange[level];
      assert.ok(c.derived.proficiency >= lo && c.derived.proficiency <= hi, `L${level} proficiency ${c.derived.proficiency}`);
      const achievements = c.advancementHistory.filter((h) => h.tierAchievement).map((h) => h.level);
      assert.deepEqual(achievements, [2, 5, 8].filter((l) => l <= level));
      for (const w of c.derived.weapons) assert.match(w.damage, new RegExp(`^${c.derived.proficiency}d`), 'damage dice equal Proficiency');
    }
  }
});

test('damage thresholds rise by exactly 1 per level (no double counting)', async () => {
  const catalog = await getCatalog();
  for (let i = 0; i < 40; i++) {
    // Human Troubadour: no threshold-changing features or cards in Codex/Grace.
    let c = generateCharacter({ seed: `thresholds-${i}`, level: 1, ancestryId: 'ancestry.human', subclassId: 'subclass.troubadour' }, catalog);
    const rng = createRng(`thresholds-advance-${i}`);
    const equipment = c.equipment;
    for (let level = 2; level <= 10; level++) {
      const before = c.derived;
      c = advanceOneLevel(c, catalog, rng);
      c.equipment = equipment;
      c.derived = deriveStats(c, catalog);
      assert.equal(c.derived.thresholds.major, before.thresholds.major + 1, `L${level} major`);
      assert.equal(c.derived.thresholds.severe, before.thresholds.severe + 1, `L${level} severe`);
    }
  }
});

test('marked traits are never raised again before they are cleared at levels 5 and 8', async () => {
  const catalog = await getCatalog();
  for (let i = 0; i < 60; i++) {
    const c = generateCharacter({ seed: `marks-${i}`, level: 10 }, catalog);
    let marked = new Set();
    for (const h of c.advancementHistory) {
      if ([5, 8].includes(h.level)) marked = new Set();
      for (const a of h.advancements.filter((x) => x.option === 'traits')) {
        for (const t of a.traits) {
          assert.ok(!marked.has(t), `seed ${i}: ${t} raised twice in the same tier window (level ${h.level})`);
          marked.add(t);
        }
      }
    }
    assert.deepEqual([...markedTraits(c.advancementHistory)].sort(), [...marked].sort());
  }
});

test('subclass upgrades, slots, costs and cards follow the tier rules', async () => {
  const catalog = await getCatalog();
  for (let i = 0; i < 120; i++) {
    const level = 1 + (i % 10);
    const c = generateCharacter({ seed: `rules-v2-${i}`, level }, catalog);
    const subclassLevels = c.advancementHistory.flatMap((h) => h.advancements.filter((a) => a.option === 'subclass').map((a) => [a.subclassTier, h.level]));
    for (const [tierName, at] of subclassLevels) {
      if (tierName === 'specialization') assert.ok(at >= 5, 'Specialization needs a Tier 3 slot');
      if (tierName === 'mastery') assert.ok(at >= 8, 'Mastery needs a second upgrade, from a Tier 4 slot');
    }
    for (const h of c.advancementHistory) {
      assert.equal(h.advancements.reduce((s, a) => s + a.cost, 0), 2, `level ${h.level} spends exactly two advancements`);
      for (const a of h.advancements) {
        assert.ok(a.slotTier <= h.tier, 'slots come from the current tier or below');
        if (a.option === 'proficiency' || a.option === 'subclass') assert.ok(a.slotTier >= 3, `${a.option} is only on Tier 3+ sheets`);
      }
      assert.ok(!h.advancements.some((a) => a.option === 'multiclass'), 'multiclassing is not generated');
    }
    const ids = c.domainCards.map((x) => x.cardId);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate cards');
    for (const entry of c.domainCards) assert.ok(catalog.get(entry.cardId).level <= entry.acquiredAtLevel, 'card level at or below the level it was acquired');
    const loadout = c.domainCards.filter((x) => x.location === 'loadout');
    assert.ok(loadout.length <= 5, 'loadout holds at most five cards');
    if (c.domainCards.length > 5) assert.ok(c.domainCards.some((x) => x.location === 'vault'), 'excess cards go to the vault');
    for (const id of [c.equipment.primaryWeaponId, c.equipment.secondaryWeaponId, c.equipment.armorId].filter(Boolean)) {
      const t = catalog.get(id).tier;
      assert.ok(t === c.derived.tier || t === c.derived.tier - 1, `gear tier ${t} for character tier ${c.derived.tier}`);
    }
  }
});

test('Vitality and Master of the Craft apply permanently from the vault', async () => {
  const catalog = await getCatalog();
  let vitality = 0;
  let craft = 0;
  for (let i = 0; i < 400 && (vitality < 3 || craft < 3); i++) {
    const c = generateCharacter({ seed: `persist-${i}`, level: 10, classId: i % 2 ? 'class.warrior' : 'class.bard' }, catalog);
    for (const [cardId] of [['card.vitality'], ['card.master-of-the-craft']]) {
      const entry = c.domainCards.find((x) => x.cardId === cardId);
      if (!entry) continue;
      assert.equal(entry.location, 'vault');
      assert.ok(c.featureChoices[cardId], `${cardId} records its choice`);
      if (cardId === 'card.vitality') vitality++;
      else craft++;
    }
  }
  assert.ok(vitality > 0 && craft > 0, `expected to see both cards (vitality ${vitality}, craft ${craft})`);
});

test('high-level generation is deterministic', async () => {
  const catalog = await getCatalog();
  const a = generateCharacter({ seed: 'deterministic-10', level: 10 }, catalog);
  const b = generateCharacter({ seed: 'deterministic-10', level: 10 }, catalog);
  assert.deepEqual(a, b);
});

async function leveled(input) {
  const catalog = await getCatalog();
  const c = generateCharacter({ seed: 'v2-mutation', level: 9, ...input }, catalog);
  assert.ok(validateCharacter(c, catalog).valid);
  return { catalog, c };
}
async function expectHistoryError(mutate, pattern, input = {}) {
  const { catalog, c } = await leveled(input);
  const bad = clone(c);
  mutate(bad, catalog);
  const result = validateCharacter(bad, catalog);
  assert.equal(result.valid, false, 'mutation should be rejected');
  assert.ok(result.errors.some((e) => pattern.test(e)), `expected ${pattern} in:\n${result.errors.join('\n')}`);
}

test('validator replays history and rejects illegal level-ups', async () => {
  await expectHistoryError((c) => { c.advancementHistory.pop(); }, /advancement history entries/);
  await expectHistoryError((c) => { c.advancementHistory[1].tierAchievement = { experienceId: c.experiences[0].id, proficiency: 1, clearedMarkedTraits: false }; }, /tier achievement not allowed/);
  await expectHistoryError((c) => { c.advancementHistory[3].tierAchievement = null; }, /tier achievement missing/);
  await expectHistoryError((c) => { c.advancementHistory[0].advancements = [{ option: 'proficiency', slotTier: 2, cost: 2 }]; }, /tier 2|slot/);
  await expectHistoryError((c) => { c.advancementHistory[0].advancements = [{ option: 'multiclass', slotTier: 2, cost: 2 }]; }, /unknown or unsupported advancement "multiclass"/);
  await expectHistoryError((c) => { c.advancementHistory[0].advancements = [{ option: 'hp', slotTier: 2, cost: 1 }]; }, /must cost exactly 2/);
  await expectHistoryError((c) => {
    c.advancementHistory[0].advancements = [{ option: 'evasion', slotTier: 2, cost: 1 }, { option: 'evasion', slotTier: 2, cost: 1 }];
  }, /no unmarked evasion slot left in tier 2/);
  await expectHistoryError((c) => {
    c.advancementHistory[0].advancements = [{ option: 'traits', slotTier: 2, cost: 1, traits: ['agility', 'strength'] }, { option: 'traits', slotTier: 2, cost: 1, traits: ['agility', 'finesse'] }];
  }, /agility is marked/);
  await expectHistoryError((c) => { c.advancementHistory[0].advancements = [{ option: 'subclass', slotTier: 2, cost: 1, subclassTier: 'specialization' }, { option: 'hp', slotTier: 2, cost: 1 }]; }, /slot|subclass/);
  await expectHistoryError((c, catalog) => {
    const high = catalog.domainCardsFor(c.selections.classId, 10).find((card) => card.level === 9 && !c.domainCards.some((x) => x.cardId === card.id));
    c.advancementHistory[0].domainCardId = high.id;
    c.domainCards.push({ cardId: high.id, acquiredAtLevel: 2, location: 'vault', source: 'level-up' });
  }, /above the allowed 2/);
  await expectHistoryError((c) => { c.advancementHistory[2].domainCardId = c.domainCards[0].cardId; }, /already owned/);
  await expectHistoryError((c) => { c.derived.proficiency += 1; }, /derived proficiency/);
  await expectHistoryError((c) => { c.derived.thresholds.major += 1; }, /thresholds\.major/);
  await expectHistoryError((c) => { c.experiences.pop(); }, /Experiences/);
  await expectHistoryError((c) => { c.advancementHistory[4].companion.push({ option: 'aware' }); }, /companion takes/, { subclassId: 'subclass.beastbound' });
  await expectHistoryError((c) => {
    const vault = c.domainCards.find((x) => x.location === 'vault');
    for (const x of c.domainCards) x.location = 'loadout';
    if (!vault) throw new Error('fixture needs a vault card');
  }, /more than 5 cards in the active loadout/);
});
