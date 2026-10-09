# Hope & Fear content profile (planned for V3)

This folder will hold the SRD 2.0 *Hope & Fear* expansion records (4 classes, 8 subclasses, the Dread domain, 6 ancestries, 6 communities, expansion gear and optional transformations) using exactly the same schemas as `data/core/`, with `sourceSet: "hope-fear"`.

It is intentionally empty in M0. The importer already excludes `DH HF` records from the core profile, and `generateCharacter` rejects any `contentProfile` other than `core` until V3 adds a `hope-fear` entry to `data/manifest.json`.
