#!/usr/bin/env node
// Validates data/ schemas, provenance tags and references. Exit code 1 on error.
import { checkData, loadAllData } from './lib/data-checks.mjs';
import { readJson } from '../tests/helpers.js';

const errors = checkData(await loadAllData(readJson));
if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('Data validation passed.');
