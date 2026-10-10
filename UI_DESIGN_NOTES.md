# QuickSheet — The Adventurer's Folio (UI redesign)

This is a **presentation-only redesign** of the existing M2/V2 static app. The SRD-derived data, seeded generator, validation, progression, and Markdown exporter are unchanged.

## Creative direction

- **Modern fantasy editorial:** deep forest-ink workspace, warm parchment document, softly metallic brass accents, a restrained serif for character identity, and sharp utilitarian UI type.
- **Paper-sheet cues without copying official assets:** six trait shields, level medallion, resource slots, damage thresholds, divided panels, etched section labels, weapons and domain cards. All ornaments are original CSS/typography; no external images, icons, logos, fonts or runtime services.
- **Read-first, not play-tracking:** HP / Stress / Hope / Armor slots are static representations of the numbers in the generated Markdown. They are deliberately not clickable or persistent.
- **Markdown-first:** `src/sheet-view.js` takes a Markdown string, extracts its stable QuickSheet headings and sections, and builds a visual folio. The `Markdown` tab shows **the exact same UTF-8 text**, and Copy/Download use those exact bytes. No round-trip Markdown serialization occurs.
- **Open an existing `.md`:** client-side only; a generated QuickSheet Markdown file is rendered just like a newly generated character. Arbitrary Markdown receives a safe generic preview. Imported files are **not validated as legal characters**.
- **Provenance stays intact:** the original attribution is present in the Markdown and in a collapsible source section of the folio. All site footer notices remain.

## Architecture

- `index.html` — app-shell markup, existing input IDs, output, tabs, local file picker.
- `styles.css` — CSS-only visual system; desktop two-column workspace, responsive content, mobile stacking, reduced motion, and optional print styles.
- `src/sheet-view.js` — pure Markdown -> sheet HTML presenter, using the existing escaping `markdownToHtml` for detail text and tables.
- `src/app.js` — still calls the same generator and Markdown renderer; new folio/source presentation, accessible tabs, and local .md opening.
- `src/preview.js` — one robustness fix for isolated Markdown pipe lines.
- `tests/sheet-view.test.js` — verified visual renderer across the existing 30 snapshot sheets, including V2 data and hostile markup.

## Run

```sh
npm run serve
```

Open `http://localhost:8000/`, select any class/level (or keep choices on Random), and click **Generate character**. Switch between **Folio view** and **Markdown**; use **Open .md** to view a previously downloaded file. All data requests remain relative for GitHub Pages.

Run `npm test`, `npm run validate:data`, and `npm run smoke` before deploying. The redesign does not implement M3 and does not create commits or push anything.

## Intentional limitations

- The folio recognizes the headings produced by QuickSheet's current Markdown contract. It is a robust renderer for that format, **not** a universal Daggerheart Markdown-schema parser. Other Markdown is displayed as ordinary safe Markdown.
- Long V2 rules tables (e.g. Beastforms and companions) are kept intact and placed in a full-width reference section. Vault cards are collapsed by default to prioritize the active loadout.
- Browser printing is optional browser functionality; QuickSheet still exports Markdown, not PDF.
