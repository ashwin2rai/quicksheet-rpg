# QuickSheet

*Instant characters. Simple sheets. Ready for adventure.*

**QuickSheet** is a free, unofficial, non-commercial instant character generator for Daggerheart™ Compatible play. It builds rules-aware characters and exports readable Markdown. It does not manage live character sheets. Daggerheart was designed by Spenser Starke and Rowan Hall and published by Darrington Press (Critical Role), and was originally released on May 20, 2025. QuickSheet is an independent fan project. It is not affiliated with, approved by, or endorsed by Darrington Press or Critical Role.

This product includes materials from the Daggerheart System Reference Document 2.0, © Critical Role, LLC. All rights reserved. Darrington Press created the SRD material, and it is used subject to the [Darrington Press Community Gaming License](https://darringtonpress.com/license/) ([official SRD](https://www.daggerheart.com/srd/), [daggerheart.com](https://www.daggerheart.com/)). This project references [Old Gus's edited SRD](https://github.com/callmepartario/og-dhsrd), which was already modified for web reference. QuickSheet further selects, structures and formats eligible material for generation and Markdown output. The original source code and prose are separate from the underlying game content. See [NOTICE.md](NOTICE.md).


## Status: Milestone M0 (proof of concept)

This release is a deliberately **incomplete** end-to-end proof of concept. It generates **Level 1** characters from a limited core subset:

| Supported in M0 | Options |
| --- | --- |
| Classes | Bard (Troubadour, Wordsmith); Guardian (Stalwart, Vengeance) |
| Ancestries | Clank, Galapa, Giant, Human, Simiah |
| Communities | Highborne, Loreborne, Wanderborne, Wildborne |
| Domain cards | All Level 1 cards in Blade, Codex, Grace and Valor |
| Gear | All core Tier 1 weapons and armor, except setting-specific items (see `docs/rules-decisions.md`) |

These features are not in M0:
- the other seven core classes
- Mixed Ancestry
- Levels 2-10 (V2)
- Hope & Fear content (V3)

The page shows only the options above.

## Using it locally

You need any modern browser. Node.js 20+ is only needed to run the tests. There are no dependencies to install.

```sh
python3 -m http.server 8000     # or: npm run serve
# open http://localhost:8000/
```

Opening `index.html` directly from disk (`file://`) blocks the JSON data from loading, so serve the folder over HTTP.

1. Leave any selector on **Random**, or fix an ancestry, community, class or subclass. Subclass becomes available once you choose a class.
2. Click **Generate Character**. **Regenerate** keeps your fixed choices and rerolls everything else.
3. Use **Copy Markdown** or **Download .md**. Both give you exactly the Markdown shown in the preview.

Every sheet records its seed, generator version and data version. To reproduce a sheet, call `generateCharacter({ seed, ...selections }, catalog)` with the same data version.

## Development

```sh
npm test                # rules invariants, 100 seeded samples per subclass, validator mutation tests, snapshots
npm run validate:data   # schema, provenance-tag and reference checks for data/
npm run smoke           # static deployment checks (relative URLs, no remote requests, no Math.random)
npm run sample -- <seed> [classId] [subclassId] [ancestryId] [communityId]   # print a sheet
UPDATE_SNAPSHOTS=1 npm test   # accept intentional Markdown changes (review the diff!)
npm run import:og -- <path-to-og-dhsrd-checkout> [--check]   # re-import SRD data
```

### Architecture

The site is plain HTML, CSS and JavaScript ES modules with local JSON data. It has no framework, backend, CDN or runtime network access beyond its own files, and every URL is relative, so it works under `https://<owner>.github.io/quicksheet-rpg/`.

| Module | Responsibility |
| --- | --- |
| `src/catalog.js` | Loads `data/manifest.json` for a content profile, filters records by `sourceSet`, and answers eligibility queries |
| `src/rng.js` | Seeded RNG (cyrb128 + sfc32), injected everywhere; uses an unpredictable seed by default |
| `src/generator.js` | `generateCharacter(input, catalog)`: resolves selections, traits, loadout, items, cards, Experiences, mandatory choices and flavor; returns only validated characters, retrying a bounded number of times |
| `src/resolvers.js` | Named, tested resolvers for effects generic modifiers cannot express (e.g. Clank *Purposeful Design*) |
| `src/derive.js` | Derived stats from base values, equipment, level, history and feature modifiers, with a per-source breakdown |
| `src/progression.js` | Tier map and Proficiency-from-history; `advanceOneLevel` stub for V2 |
| `src/validate.js` | `validateCharacter(character, catalog)`: an independent rules check that recomputes derived numbers and returns specific errors |
| `src/markdown.js` | `renderCharacterMarkdown(character, catalog)`: a pure function that renders the sheet, including the attribution footer |
| `src/preview.js`, `src/sheet-file.js`, `src/app.js` | Escaping preview renderer, filename/download helpers, and the UI |

Data lives in `data/core/` (generated from Old Gus by `tools/import-og-dhsrd.mjs` and `tools/curation/core.json`) and in `data/flavor/` (original tables). Upstream pins are in `data/srd-sources.lock.json`. Rules judgment calls are in [docs/rules-decisions.md](docs/rules-decisions.md), and provenance is in [docs/data-provenance.md](docs/data-provenance.md). The full product specification is in `objective/QUICKSHEET_IMPLEMENTATION_SPEC.md`.

## License

The original code and original flavor tables are licensed under the Apache License 2.0 ([LICENSE](LICENSE)). SRD-derived game content stays under the DPCGL terms and is **not** covered by the Apache License. See [NOTICE.md](NOTICE.md).
