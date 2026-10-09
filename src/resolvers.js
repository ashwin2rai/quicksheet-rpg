// Named resolvers for feature effects that generic modifiers cannot express.
// Each resolver makes a mandatory choice during generation, validates a stored
// choice independently, and reports the modifiers that choice produces.

export const RESOLVERS = Object.freeze({
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
});
