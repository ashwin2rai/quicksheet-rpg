# QuickSheet

A free, unofficial instant character generator for Daggerheart™ Compatible play. Pick options (or leave them on Random), generate, and copy or download a Markdown character sheet.

## Attribution

This product includes materials from the Daggerheart System Reference Document 2.0, © Critical Role, LLC. All rights reserved. Darrington Press created the SRD material; it is used under the [Darrington Press Community Gaming License](https://darringtonpress.com/license/). Official SRD: https://www.daggerheart.com/srd/

Game text is referenced from [Old Gus' edited SRD](https://github.com/callmepartario/og-dhsrd) and further selected and reformatted by QuickSheet. Daggerheart was designed by Spenser Starke and Rowan Hall and published by Darrington Press. QuickSheet is not affiliated with or endorsed by Darrington Press or Critical Role.

Original code and flavor tables: Apache License 2.0 ([LICENSE](LICENSE)). SRD content is not covered by that license. See [NOTICE.md](NOTICE.md).

## Development

Requires Node.js 20+. No dependencies.

```sh
npm run serve                 # http://localhost:8000 (must be served over HTTP)
npm test                      # tests and snapshots (UPDATE_SNAPSHOTS=1 to accept changes)
npm run validate:data         # data checks
npm run smoke                 # static deployment checks
npm run sample -- <seed>      # print a generated sheet
npm run import:og -- <og-dhsrd-checkout> [--check]   # re-import SRD data
npm run drift                 # compare upstream sources with pinned hashes
```

Docs: [rules decisions](docs/rules-decisions.md), [data provenance](docs/data-provenance.md).
