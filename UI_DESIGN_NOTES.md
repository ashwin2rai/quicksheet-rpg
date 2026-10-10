# QuickSheet — Adventurer's Folio (UI improvements)

This interface refresh sits on top of the uploaded M3 / V3 repository. Existing SRD-derived data, catalog/validation, seeded character generation, level progression, Markdown renderer, import curation, and legal attribution were not changed. No web framework, external assets, CDN, accounts, or backend were added.

## Visual direction

- **Modern, legible fantasy editorial:** Georgia serif for character identity, system fonts for rules, parchment and forest-ink surfaces, brass details, subtle field borders, and greater type sizes throughout. No official game art or logos are used.
- **Light/dark** themes change the full interface *and* sheet. Light is warm parchment; dark is deep green-charcoal. Theme preference uses best-effort browser localStorage only.
- **Features & Heritage cards**: the generated `### Ancestry`, `### Community`, `### Transformation`, `### Class`, and `### Subclass` sections are divided into separately bordered, accented **feature cards**. The parser recognizes feature names emitted by the unchanged Markdown renderer; multi-paragraph rules and bullet lists stay with their feature. Very long reference sections (Beastforms, Companions, Martial Stances) retain space for tables and detailed rules. Active Domain Cards keep their own colored cards.
- **Touch-sized markers:** HP, Stress, Hope, Armor slots and supported class resource pools have visible pressed/unpressed states, keyboard-focus indicators, and aria-pressed labels. Unstoppable Die has manual face buttons. Marks do not apply rules, calculate resources, or roll any dice.
- **Notes:** a full-width, editable notes panel appears at the end of the folio, before attribution. Text input is plain text, so players can write any notes without a complex editor.

## Modules / data flow

- `src/sheet-view.js`: pure Markdown -> HTML folio rendering; resource buttons, special dice/pools, individual Feature/Heritage cards, Notes textarea.
- `src/folio-runtime.js`: small standalone classic script usable both on GitHub Pages and inside exported `file://` sheets. Theme and download helpers; mounts the resource/notes interactions, reads and writes visual-only session snapshots, and handles Markdown annotation round trips.
- `src/app.js`: wires theme switch, resources/notes changes, the updated Markdown source preview/copy/download, HTML export, and Markdown imports. Game generation is unchanged.
- `src/sheet-file.js`: file names, the exact `.md` download, and one self-contained HTML file by embedding the folio markup, stylesheet, runtime, bootstrap script, and safely encoded state. All data stays on-device.
- `src/standalone-init.js`: initializes a downloaded HTML file, handles its theme toggle, Save .md, and Save updated HTML actions. Saving updated HTML embeds the current snapshot in the new file; it does not overwrite the original.
- `styles.css`: both color themes, accessibility-focused spacing, readable typography, domain and feature-card treatments, responsive breakpoints and printable folio.
- `tests/folio-runtime.test.js`: covers exact untouched Markdown, annotated round trips, card/marker output and portable HTML content.

## User expectations and limitations

1. Exporting Markdown with no user edits preserves the generator's original exact output. After notes/marks are changed, `## Session Tracking` and/or `## Notes` are appended just before the untouched source attribution. The markers encode positions (`●`/`○`), not only totals, so re-import retains nonconsecutive markings.
2. Imported QuickSheet Markdown with annotations restores those notes/marks. Arbitrary Markdown is displayed through the original HTML-escaping generic preview, not transformed into a structured character model.
3. This is not a combat manager: manually marking Hope, dice or other tracks does not trigger any rule, roll dice, or change derived statistics. Some class dice are repeatable instead of consumable; their markers merely track a player's own reminder.
4. Only the theme is persisted to the generating page's browser storage. For character data and notes, users must export a new `.md` or `.html` to retain changes. Browsers do not permit an opened local file to be overwritten automatically.
5. Standalone HTML files are portable/offline, with no remote fonts, CSS, game data, scripts, analytics or libraries. Local assets are read from the repo when the user first clicks **Save HTML folio**, then embedded in the resulting file.

## Verify

```sh
npm test
npm run validate:data
npm run smoke
npm run serve
```

For the browser, generate a character (including a Hope & Fear character), click several non-adjacent HP slots, change Hope/Armor, edit notes, copy/download `.md`, then open it to confirm restored marks. Save HTML, open it without an internet connection, edit notes and resources, then use **Save updated HTML** and verify those changes reopen correctly. Test desktop and narrow mobile widths. No Git commands are required; the user handles commits/deployment.
