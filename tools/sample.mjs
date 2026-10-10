#!/usr/bin/env node
// Prints a generated Markdown sheet for manual inspection.
// Usage: node tools/sample.mjs [seed] [classId] [subclassId] [ancestryId] [communityId] [secondAncestryId]
//          [--mixed] [--level=N] [--hope-fear] [--transformation[=transformationId]]
// Use - for any selection to leave it Random. --hope-fear uses the Core + Hope & Fear profile;
// --transformation (Hope & Fear only) adds a random or the given transformation.
import { generateCharacter } from '../src/generator.js';
import { renderCharacterMarkdown } from '../src/markdown.js';
import { getCatalog } from '../tests/helpers.js';

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const mixedAncestry = flags.includes('--mixed');
const level = Number(flags.find((f) => f.startsWith('--level='))?.split('=')[1] ?? 1);
const contentProfile = flags.includes('--hope-fear') ? 'core+hope-fear' : 'core';
const transformationFlag = flags.find((f) => f.startsWith('--transformation'));
const transformationId = transformationFlag?.split('=')[1] ?? null;
const [seed = 'sample-1', classId, subclassId, ancestryId, communityId, secondAncestryId] = args.map((a) => (a === '-' ? null : a));
const catalog = await getCatalog(contentProfile);
const character = generateCharacter({
  seed, level, classId, subclassId, ancestryId, communityId, secondAncestryId, transformationId, contentProfile,
  options: { mixedAncestry, transformation: Boolean(transformationFlag) && !transformationId },
}, catalog);
process.stdout.write(renderCharacterMarkdown(character, catalog));
