#!/usr/bin/env node
// Prints a generated Markdown sheet for manual inspection.
// Usage: node tools/sample.mjs [seed] [classId] [subclassId] [ancestryId] [communityId]
import { generateCharacter } from '../src/generator.js';
import { renderCharacterMarkdown } from '../src/markdown.js';
import { getCatalog } from '../tests/helpers.js';

const [seed = 'sample-1', classId = null, subclassId = null, ancestryId = null, communityId = null] = process.argv.slice(2);
const catalog = await getCatalog();
const character = generateCharacter({ seed, classId, subclassId, ancestryId, communityId }, catalog);
process.stdout.write(renderCharacterMarkdown(character, catalog));
