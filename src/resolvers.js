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
});
