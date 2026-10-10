// Catalog: validated, source-tagged game data plus eligibility queries.
// The catalog is built from plain JSON bundles so the same code runs in the
// browser (fetch) and in Node tests (fs). Records outside the selected content
// profile are never exposed.

export const TRAITS = Object.freeze(['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge']);
export const TRAIT_LABELS = Object.freeze({
  agility: 'Agility', strength: 'Strength', finesse: 'Finesse',
  instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge',
});

const COLLECTIONS = ['classes', 'subclasses', 'features', 'ancestries', 'communities', 'domains', 'domainCards', 'weapons', 'armor', 'items', 'beastforms'];
// Collections only some source sets provide (Hope & Fear); absent means empty.
const OPTIONAL_COLLECTIONS = ['transformations', 'martialStances'];

export class CatalogError extends Error {}

/**
 * Reads the files of a manifest map. A collection may list several files (one per
 * source set); their records are concatenated into one bundle.
 */
export async function readBundles(readJson, files) {
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, paths]) => {
    const bundles = await Promise.all([paths].flat().map((path) => readJson(path)));
    return [key, bundles.length === 1 ? bundles[0] : { meta: bundles[0].meta, records: bundles.flatMap((b) => b.records) }];
  })));
}

/**
 * Loads every data file listed in data/manifest.json for a content profile.
 * @param {(relativePath: string) => Promise<any>} readJson resolves a path relative to data/
 */
export async function loadCatalog(readJson, { contentProfile = 'core' } = {}) {
  const manifest = await readJson('manifest.json');
  const profile = manifest.profiles[contentProfile];
  if (!profile) throw new CatalogError(`Unknown or unsupported content profile "${contentProfile}"`);
  const [gameData, flavor] = await Promise.all([readBundles(readJson, profile.files), readBundles(readJson, manifest.flavor)]);
  return createCatalog({ manifest, contentProfile, gameData, flavor });
}

export function createCatalog({ manifest, contentProfile, gameData, flavor }) {
  const profile = manifest.profiles[contentProfile];
  if (!profile) throw new CatalogError(`Unknown or unsupported content profile "${contentProfile}"`);
  const allowedSets = new Set(profile.sourceSets);
  const byId = new Map();
  const lists = {};
  for (const name of [...COLLECTIONS, ...OPTIONAL_COLLECTIONS]) {
    const bundle = gameData[name] ?? (OPTIONAL_COLLECTIONS.includes(name) ? { records: [] } : null);
    if (!bundle) throw new CatalogError(`Missing data collection "${name}"`);
    lists[name] = Object.freeze(bundle.records.filter((r) => allowedSets.has(r.source?.sourceSet)));
    for (const record of lists[name]) {
      if (byId.has(record.id)) throw new CatalogError(`Duplicate id ${record.id}`);
      byId.set(record.id, record);
    }
  }
  const experiences = Object.freeze([...flavor.experiences.records]);
  for (const record of experiences) byId.set(record.id, record);
  const classStyles = new Map(flavor.classStyles.records.map((r) => [r.classId, r]));

  const catalog = {
    contentProfile,
    contentLabel: profile.label,
    sourceSets: Object.freeze([...allowedSets]),
    dataVersion: manifest.dataVersion,
    srdVersion: manifest.srdVersion,
    ...lists,
    flavor: Object.freeze({
      ...withoutMeta(flavor.names),
      ...withoutMeta(flavor.details),
      ...withoutMeta(flavor.companions),
      ...withoutMeta(flavor.sayings),
      ...withoutMeta(flavor.patrons ?? {}),
      experiences,
      classStyles,
    }),

    has: (id) => byId.has(id),
    get(id) {
      const record = byId.get(id);
      if (!record) throw new CatalogError(`Unknown id "${id}" in content profile "${contentProfile}"`);
      return record;
    },
    find: (id) => byId.get(id) ?? null,
    subclassesOf: (classId) => lists.subclasses.filter((s) => s.classId === classId),
    /** Domain cards a class may take at or below a level. */
    domainCardsFor(classId, maxLevel) {
      const domains = new Set(catalog.get(classId).domainIds);
      return lists.domainCards.filter((c) => domains.has(c.domainId) && c.level <= maxLevel);
    },
    classStyle: (classId) => classStyles.get(classId) ?? { experienceTags: [], conceptTags: [] },
  };
  return Object.freeze(catalog);
}

function withoutMeta({ meta, ...rest }) {
  return rest;
}

export function tierForLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new RangeError(`Level must be an integer 1-10, got ${level}`);
  if (level === 1) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}
