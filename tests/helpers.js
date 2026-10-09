import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

export const readJson = async (relativePath) => JSON.parse(await readFile(DATA_DIR + relativePath, 'utf8'));

let cached;
export function getCatalog() {
  cached ??= loadCatalog(readJson, { contentProfile: 'core' });
  return cached;
}

export const clone = (value) => structuredClone(value);
