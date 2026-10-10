# QuickSheet

A free, unofficial instant character generator for Daggerheart™ Compatible play. Pick options (or leave them on Random), generate, and view a beautifully formatted character folio. Copy or download the original Markdown character sheet at any time.

## Attribution

This product includes materials from the Daggerheart System Reference Document 2.0, © Critical Role, LLC. All rights reserved. Darrington Press created the SRD material; it is used under the [Darrington Press Community Gaming License](https://darringtonpress.com/license/). Official SRD: https://www.daggerheart.com/srd/

Game text is referenced from [Old Gus' edited SRD](https://github.com/callmepartario/og-dhsrd) and further selected and reformatted by QuickSheet. Daggerheart was designed by Spenser Starke and Rowan Hall and published by Darrington Press. QuickSheet is not affiliated with or endorsed by Darrington Press or Critical Role.

Original code and flavor tables: Apache License 2.0 ([LICENSE](LICENSE)). SRD content is not covered by that license. See [NOTICE.md](NOTICE.md).

## The character folio

The new visual folio is a **read-only presentation of the generated Markdown**, inspired by the organization of a tabletop character sheet. It displays traits, resources, weapons, armor, experiences, features, domain cards, story and advancements in dedicated sections. It does not edit character data or track HP, Hope or Stress during play.

- Click **Generate character** to create a rules-checked character from levels 1-10.
- Switch **Folio view / Markdown** to see the same character as a styled sheet or source document.
- **Copy Markdown** and **Download .md** use exactly the generated Markdown.
- **Open .md** to preview a previously generated Markdown file locally in your browser. Imported files are displayed without changing them and are not independently rules-validated.
- Everything runs locally and works on desktop or mobile without accounts, external assets or runtime APIs.

See [UI_DESIGN_NOTES.md](UI_DESIGN_NOTES.md) for the design rationale and implementation.

## Content

- **Core Only** (default): the 9 core classes, 18 subclasses, 18 ancestries and 9 communities.
- **Core + Hope & Fear**: also the expansion material included in SRD 2.0. That adds the Assassin, Brawler, Warlock and Witch with their subclasses, the Dread domain, six ancestries (Aetheris, Earthkin, Emberkin, Gnome, Skykin, Tidekin), six communities (Duneborne, Freeborne, Frostborne, Hearthborne, Reborne, Warborne) and the expansion weapons and armor.
- **Transformations** (Demigod, Ghost, Reanimated, Shapeshifter, Vampire, Werewolf) need Core + Hope & Fear and are opt-in. The default is None; you can choose one or Random. A character has at most one.

Core Only output is exactly what it was before Hope & Fear support was added. See [rules decisions](docs/rules-decisions.md) RD-042 to RD-053 for how expansion rules are interpreted.

## Development

Requires Node.js 20+. No dependencies.

```sh
npm run serve                 # http://localhost:8000 (no-cache dev server)
npm test                      # tests and snapshots (UPDATE_SNAPSHOTS=1 to accept changes)
npm run validate:data         # data checks
npm run smoke                 # static deployment checks
npm run sample -- <seed>      # print a generated sheet (--level=N, --hope-fear, --transformation[=id])
npm run import:og -- <og-dhsrd-checkout> [--check]   # re-import SRD data
npm run drift                 # compare upstream sources with pinned hashes
```

Docs: [rules decisions](docs/rules-decisions.md), [data provenance](docs/data-provenance.md).
