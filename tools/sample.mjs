#!/usr/bin/env node
// Prints a generated Markdown sheet for manual inspection.
// Usage: node tools/sample.mjs [seed] [classId] [subclassId] [ancestryId] [communityId] [secondAncestryId] [--mixed]
// Use - for any selection to leave it Random.
import { generateCharacter } from '../src/generator.js';
import { renderCharacterMarkdown } from '../src/markdown.js';
import { getCatalog } from '../tests/helpers.js';

const args = process.argv.slice(2).filter((a) => a !== '--mixed');
const mixedAncestry = process.argv.includes('--mixed');
const [seed = 'sample-1', classId, subclassId, ancestryId, communityId, secondAncestryId] = args.map((a) => (a === '-' ? null : a));
const catalog = await getCatalog();
const character = generateCharacter({ seed, classId, subclassId, ancestryId, communityId, secondAncestryId, options: { mixedAncestry } }, catalog);
process.stdout.write(renderCharacterMarkdown(character, catalog));
