import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

export const readJson = async (relativePath) => JSON.parse(await readFile(DATA_DIR + relativePath, 'utf8'));

export const HOPE_FEAR = 'core+hope-fear';
const cached = {};
export function getCatalog(contentProfile = 'core') {
  cached[contentProfile] ??= loadCatalog(readJson, { contentProfile });
  return cached[contentProfile];
}

export const clone = (value) => structuredClone(value);
