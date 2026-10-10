// Named resolvers for feature effects that generic modifiers cannot express.
// Each resolver makes a mandatory choice during generation, validates a stored
// choice independently, reports the modifiers that choice produces, and
// describes it for the sheet. `mechanics` is the feature's curated mechanics
// block, so option lists and limits live in data rather than code.

const none = () => [];

export const RESOLVERS = Object.freeze({
  // Generic: pick one option from mechanics.choice.options.
  // Used by Sorcerer "Elementalist" and Drakona "Elemental Breath".
  chooseOption: Object.freeze({
    resolve({ rng, mechanics }) {
      return { option: rng.pick(mechanics.choice.options) };
    },
    validate(choice, _character, mechanics) {
      if (!choice || !mechanics.choice.options.includes(choice.option)) {
        return [`${mechanics.choice.label} must be one of ${mechanics.choice.options.join(', ')}`];
      }
      return [];
    },
    modifiers: none,
    describe: (choice, _character, mechanics) => `${mechanics.choice.label}: ${choice.option}`,
    detail: (choice) => choice.option,
  }),

  // Generic: pick an integer in [min, max]. Used by Wizard "Strange Patterns".
  chooseNumber: Object.freeze({
    resolve({ rng, mechanics }) {
      return { number: rng.int(mechanics.choice.min, mechanics.choice.max) };
    },
    validate(choice, _character, mechanics) {
      const { min, max, label } = mechanics.choice;
      if (!choice || !Number.isInteger(choice.number) || choice.number < min || choice.number > max) {
        return [`${label} must be an integer from ${min} to ${max}`];
      }
      return [];
    },
    modifiers: none,
    describe: (choice, _character, mechanics) => `${mechanics.choice.label}: ${choice.number}`,
    detail: (choice) => String(choice.number),
  }),

  // Generic: choose `count` distinct benefits from mechanics.choice.options, each a list of
  // modifiers. Used by Vitality ("permanently gain two of the following benefits").
  chooseBenefits: Object.freeze({
    resolve({ rng, mechanics }) {
      return { options: rng.weightedSample(Object.keys(mechanics.choice.options), mechanics.choice.count) };
    },
    validate(choice, _character, mechanics) {
      const keys = Object.keys(mechanics.choice.options);
      const picked = choice?.options ?? [];
      if (picked.length !== mechanics.choice.count || new Set(picked).size !== picked.length || picked.some((k) => !keys.includes(k))) {
        return [`${mechanics.choice.label} needs ${mechanics.choice.count} different options from ${keys.join(', ')}`];
      }
      return [];
    },
    modifiers: (choice, mechanics) => choice.options.flatMap((k) => mechanics.choice.options[k]),
    describe: (choice, _character, mechanics) => `${mechanics.choice.label}: ${choice.options.map((k) => mechanics.choice.optionLabels[k]).join(' and ')}`,
  }),

  // Master of the Craft: "Gain a permanent +2 bonus to two of your Experiences or a
  // permanent +3 bonus to one of your Experiences."
  masterOfTheCraft: Object.freeze({
    resolve({ character, rng }) {
      const exps = character.experiences;
      if (rng.next() < 0.5 && exps.length >= 2) return { mode: 'two', experienceIds: rng.weightedSample(exps, 2).map((e) => e.id) };
      return { mode: 'one', experienceIds: [rng.pick(exps).id] };
    },
    validate(choice, character) {
      const ids = choice?.experienceIds ?? [];
      const want = choice?.mode === 'two' ? 2 : choice?.mode === 'one' ? 1 : null;
      if (!want || ids.length !== want || new Set(ids).size !== ids.length) return ['Master of the Craft needs +2 to two Experiences or +3 to one'];
      if (ids.some((id) => !character.experiences.some((e) => e.id === id))) return ['Master of the Craft chose an Experience the character does not have'];
      return [];
    },
    modifiers: (choice) => choice.experienceIds.map((id) => ({ target: `experience:${id}`, value: choice.mode === 'two' ? 2 : 3 })),
    describe(choice, character) {
      const name = (id) => character.experiences.find((e) => e.id === id)?.name ?? id;
      return `Master of the Craft: ${choice.experienceIds.map((id) => `${name(id)} ${choice.mode === 'two' ? '+2' : '+3'}`).join(', ')}`;
    },
  }),

  // Clank, Purposeful Design: "At character creation, choose one of your
  // Experiences that best aligns with this purpose and gain a permanent +1 bonus to it."
  clankPurposefulDesign: Object.freeze({
    resolve({ character, rng }) {
      return { experienceId: rng.pick(character.experiences).id };
    },
    validate(choice, character) {
      if (!choice || typeof choice.experienceId !== 'string') return ['Purposeful Design requires a chosen Experience'];
      if (!character.experiences.some((e) => e.id === choice.experienceId)) {
        return [`Purposeful Design chose Experience ${choice.experienceId}, which the character does not have`];
      }
      return [];
    },
    modifiers(choice) {
      return [{ target: `experience:${choice.experienceId}`, value: 1 }];
    },
    describe(choice, character) {
      const exp = character.experiences.find((e) => e.id === choice.experienceId);
      return `Purpose-aligned Experience: ${exp ? exp.name : choice.experienceId} (+1)`;
    },
  }),

  // Orderborne, Dedicated: "Record three sayings or values your upbringing instilled in you."
  orderborneDedicated: Object.freeze({
    resolve({ rng, catalog }) {
      return { sayings: rng.weightedSample(catalog.flavor.orderborneSayings, 3) };
    },
    validate(choice) {
      const sayings = choice?.sayings;
      if (!Array.isArray(sayings) || sayings.length !== 3) return ['Dedicated requires exactly three recorded sayings or values'];
      if (sayings.some((s) => typeof s !== 'string' || !s.trim())) return ['Dedicated sayings must be non-empty text'];
      if (new Set(sayings).size !== 3) return ['Dedicated sayings must be distinct'];
      return [];
    },
    modifiers: none,
    describe: (choice) => `Your sayings: ${choice.sayings.map((s) => `"${s}"`).join('; ')}`,
  }),

  // Beastbound, Companion: animal type, name, damage type and two Experiences
  // (SRD Ranger Companion rules). Animal and name are QuickSheet suggestions the
  // table may change with the GM.
  beastboundCompanion: Object.freeze({
    resolve({ rng, catalog, mechanics }) {
      const c = mechanics.companion;
      return {
        animal: rng.pick(catalog.flavor.companionAnimals),
        name: rng.pick(catalog.flavor.companionNames),
        damageType: rng.weighted(['phy', 'mag'], (t) => (t === 'phy' ? 3 : 1)),
        experiences: rng.weightedSample(c.exampleExperiences, c.experienceCount),
      };
    },
    validate(choice, _character, mechanics) {
      const errors = [];
      const c = mechanics.companion;
      if (!choice) return ['Companion choices are missing'];
      if (typeof choice.animal !== 'string' || !choice.animal.trim()) errors.push('Companion needs an animal type');
      if (typeof choice.name !== 'string' || !choice.name.trim()) errors.push('Companion needs a name');
      if (!['phy', 'mag'].includes(choice.damageType)) errors.push('Companion damage type must be physical or magic');
      const exps = choice.experiences ?? [];
      if (exps.length !== c.experienceCount || new Set(exps).size !== exps.length) {
        errors.push(`Companion needs ${c.experienceCount} distinct Experiences`);
      }
      return errors;
    },
    modifiers: none,
    describe: (choice) => `Companion: ${choice.name}, ${choice.animal}`,
  }),

  // Warlock, Patron's Pact: "Write their name on your character sheet, then work with your GM
  // to determine their sphere of influence." The name is an original QuickSheet suggestion;
  // the sphere comes from the SRD's examples in mechanics.choice.options.
  warlockPatron: Object.freeze({
    resolve({ rng, catalog, mechanics }) {
      return { name: rng.pick(catalog.flavor.patronNames), sphere: rng.pick(mechanics.choice.options) };
    },
    validate(choice, _character, mechanics) {
      const errors = [];
      if (typeof choice?.name !== 'string' || !choice.name.trim()) errors.push('the patron needs a name');
      if (!mechanics.choice.options.includes(choice?.sphere)) errors.push(`${mechanics.choice.label} must be one of ${mechanics.choice.options.join(', ')}`);
      return errors;
    },
    modifiers: none,
    describe: (choice) => `Patron: ${choice.name}, sphere of influence ${choice.sphere}`,
  }),

  // Martial Artist, Stance Fighter: "choose two martial stances from Tier 1". Stances gained
  // at later levels are recorded in the advancement history, not here.
  martialStances: Object.freeze({
    resolve({ rng, catalog, mechanics }) {
      const s = mechanics.stances;
      const options = catalog.martialStances.filter((x) => x.tier <= s.initialTier);
      return { stanceIds: rng.weightedSample(options, s.initial).map((x) => x.id) };
    },
    validate(choice, _character, mechanics, catalog) {
      const s = mechanics.stances;
      const ids = choice?.stanceIds ?? [];
      if (ids.length !== s.initial || new Set(ids).size !== ids.length) return [`Stance Fighter needs ${s.initial} different starting stances`];
      const errors = [];
      for (const id of ids) {
        const stance = catalog.martialStances.find((x) => x.id === id);
        if (!stance) errors.push(`unknown martial stance ${id}`);
        else if (stance.tier > s.initialTier) errors.push(`${stance.name} is a Tier ${stance.tier} stance; starting stances come from Tier ${s.initialTier}`);
      }
      return errors;
    },
    modifiers: none,
    describe: () => 'Known stances are listed under Martial Stances',
  }),

  // Shapeshifter, Only Skin Deep: "You gain the benefit of only one of your chosen ancestry's
  // features, which you select when you choose the ancestry."
  onlySkinDeep: Object.freeze({
    resolve({ rng }) {
      return { keep: rng.pick(['top', 'bottom']) };
    },
    validate(choice) {
      return ['top', 'bottom'].includes(choice?.keep) ? [] : ['Only Skin Deep must keep the top or the bottom ancestry feature'];
    },
    modifiers: none,
    describe: (choice) => `Benefits only from the ancestry's ${choice.keep === 'top' ? 'first' : 'second'} feature, listed above`,
  }),
});
