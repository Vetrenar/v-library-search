# Library Search

An Obsidian plugin that turns a collection of notes into a searchable **library**. Open a note, and the plugin reads its search terms (its aliases, or a frontmatter property you choose) and surfaces every place those terms appear across your library — in headings, callouts, list items, frontmatter, or full text — grouped by note type.

It also ships a **PDF → card index** tool that builds one note per PDF, with the PDF's table of contents written in as linked headings, so a library can be bootstrapped from a folder of PDFs.

> Replace the placeholders marked `<…>` (repository URL, author, license, screenshots) before publishing.

---

## Features

- **Term-driven search.** The active note's aliases (or a chosen property) become the query; results are pulled from your library automatically — no typing required.
- **Inflection-aware matching.** Three match modes — substring, **word forms** (stemmed), and whole word. Word-form mode matches inflected forms of a whole phrase: an alias `red dog` also finds `red dogs`; `рыжая собака` finds `рыжей собаки`, `рыжих собак`, and so on.
- **Unicode-correct.** Terms and text are normalized (NFC) before matching, so Cyrillic (`й`, `ё`) and accented Latin (`é`, `ü`, `ñ`) match reliably regardless of how they were typed.
- **Note types (groups).** Classify notes by a frontmatter property (e.g. `type: book`) and give each type its own search targets and term source.
- **Granular search targets.** Per group, choose where to look: headings, callout titles and bodies, specific frontmatter fields, full note body, list items and tasks, and the filename.
- **Three ways to see results.** A docked **inline panel** at the top or bottom of a note, a pinnable **side view**, and an inline ` ```library-search ``` ` **code block**.
- **PDF outline → cards.** Extract a PDF's embedded outline as Markdown headings with PDF++-style page links, and maintain a card-index folder that updates idempotently.
- **Bilingual UI.** English and Russian.

---

---

## Installation

### From the community plugins browser

Search for **Library Search** in *Settings → Community plugins → Browse*, install, and enable.

### Manually
1. Download `main.js`, `manifest.json`, and `styles.css` from the https://github.com/Vetrenar/v-library-search/releases.
2. Copy them into `<your-vault>/.obsidian/plugins/library-search/`.
3. Reload Obsidian and enable **Library Search** in *Settings → Community plugins*.

### With BRAT
Add the repository https://github.com/Vetrenar/v-library-search in the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin to track pre-release builds.

---

## Quick start

There are two ways to get a library going.

### A. You already have library notes
1. Open *Settings → Library Search → Start*.
2. Set **Library folder** to the folder that holds your notes (leave empty to use the PDF index folder).
3. Make sure your library notes carry aliases (or set a custom **term source** property).
4. Open a note that has aliases — matches appear in the inline panel.

### B. You're building a library from PDFs
1. Open *Settings → Library Search → PDF index*.
2. Set the **PDF folder** (where your PDFs live) and the **index folder** (where card notes are created).
3. Choose the **card name template** and the **link property** that ties a card to its PDF.
4. Run the command **PDF outline: rebuild cards for all PDFs in folder**, or right-click a PDF → **Extract outline → card**.
5. Each card now contains the PDF's table of contents under a heading; the search indexes those cards.

> Cards are matched to your note types by a frontmatter property. If you use groups like `type: book`, make sure your card template sets that property — otherwise a card won't join any group and won't appear in results.

---

## Concepts

### Search terms
For the active note, the plugin collects search terms from either:
- **Aliases** (default) — it reads `aliases` / `alias` (any case variant) from frontmatter, or
- **A custom property** — a frontmatter field you name, which should hold a list of values.

These terms are the query used against the library.

### Note types (groups)
A group is a rule: a frontmatter **property** plus a set of accepted **values**. For example, a *Books* group might match `type: book` and an *Articles* group `type: article`. A note that matches no group is excluded from results. Each group can override the global term source and defines its own search targets.

### Search targets
Per group, you control where matches are looked for:
- **Headings** — fastest; read from the metadata cache. Output as heading only, heading + first N lines, or heading + full section.
- **Callouts** — titles and/or bodies, optionally limited to certain callout types.
- **Frontmatter fields** — named fields whose values are checked.
- **Full note text** — the slowest target; reads each file in full.
- **List items & tasks** — bullet/numbered items, optionally including checkboxes (and only unchecked ones).
- **Filename** — match against the basename.

### Match modes
Set under *Search*:

| Mode | Behaviour | Best for |
| --- | --- | --- |
| **Substring** | The phrase matches anywhere, no word boundaries. | Maximum recall. |
| **Word forms** | Each word of the phrase is reduced to a stem; endings are free, so inflected forms match. | Inflected languages (Russian, etc.). |
| **Whole word** | The whole word/phrase must match exactly. | Precision. |

All modes are case-insensitive by default (toggleable) and Unicode-normalized, so mixed Cyrillic/Latin libraries behave predictably. Word-form mode uses a lightweight stemmer for Cyrillic words and a free-ending prefix for others — it favours recall over precision, so it may occasionally over-match (e.g. a stem shared by unrelated words). Switch to *Whole word* when you need strict matching.

---

## Where results appear

- **Inline note panel** — a virtual panel docked at the top or bottom of a note (a CodeMirror panel in edit mode, a banner in reading mode). It is never written to the file. Pin it to keep it on the current note, collapse it to just a title bar, and use the extra-terms box to narrow what's already shown.
- **Side view** — open it from the ribbon (book icon) or the **Open search panel** command. Same search, pin, and extra-terms filter.
- **Inline code block** — embed results directly in a note (see below).

---

## Inline code block

Place a fenced block with the `library-search` language in any note:

````markdown
```library-search
extra term one
extra term two
```
````

It searches by the note's own aliases plus any extra terms listed in the block (one per line). Leave the block empty to search by aliases only.

---

## PDF outline → card index

The PDF tool reads a PDF's embedded outline (bookmarks) and writes it as Markdown headings whose destinations become PDF++-style links, e.g.:

```
## Chapter 3 [[Book.pdf#page=42&offset=,,|p.38]]
```

Highlights:
- **Book page numbers** come from the PDF's page labels; a manual offset is used when labels are absent.
- **Heading-level overflow** — deep outline levels beyond H6 render as nested lists.
- **Card index workflow** — a watched PDF folder (A) and a card folder (B). For each PDF, the matching card is found or created from a template, and the outline is written under a chosen heading. Re-runs update in place.
- **Auto-create on add** (optional) — drop a PDF into the watched folder and its card is generated automatically.
- **Unprocessed scan** — list PDFs that have no card or an empty outline section, and rebuild a selected set.

### Card / link templates
Templates support `{{token}}` placeholders, including `{{file.basename}}`, `{{file.name}}`, `{{file.path}}`, `{{page}}`, `{{pageLabel}}`, `{{pageCount}}`, and `{{date}}`. A few legacy single-brace and underscore aliases are also accepted. Unknown tokens collapse to an empty string; no code is evaluated.

---

## Settings reference

Settings are organized into tabs.

- **Start** — library folder, search-term source (aliases or a custom property), inline panel on/off and position, and a shortcut into the PDF-index setup.
- **PDF index** — PDF folder, index folder, the card↔PDF link property, card name template and prefix strip, an optional card template note, the target heading and its level, automation, heading/list formatting, page-number handling, link-display template, and where the manual command outputs (cursor or clipboard).
- **Note types** — the global term source, the group editor (name, icon, membership property and values, optional per-group term source, and the search targets), and "group results by type".
- **Search** — match mode, case sensitivity, and max matches per file.
- **Display** — inline panel options (position, reading-mode banner, collapsed by default, title, and where the panel appears), plus show-tags and show-file-path.
- **More** — interface language.

---

## Commands

- **Open search panel** — open the side view.
- **Toggle inline note panel** — show/hide the docked panel.
- **PDF outline: insert into active note (pick PDF)** — choose a PDF and drop its outline at the cursor or to the clipboard.
- **PDF outline: extract from current PDF → card** — build/refresh the card for the active PDF.
- **PDF outline: update outline in current card** — refresh the outline in the active card.
- **PDF outline: rebuild cards for all PDFs in folder** — process the whole watched folder.
- **PDF outline: show unprocessed files** — list PDFs missing a card or outline and rebuild a selection.

A right-click menu on any PDF also offers **Extract outline → card** and **Copy outline to clipboard**.

---

## Language

The UI ships in **English** and **Russian**, selectable under *More → Language*. The default is English.

---

## Building from source

This is a TypeScript Obsidian plugin.

```bash
npm install
npm run build      # production build → main.js
npm run dev        # watch mode, if configured
```

Runtime/peer dependencies of note: `obsidian`, `@codemirror/view`, and `@codemirror/state`. PDF parsing uses Obsidian's bundled pdf.js via `loadPdfJs()`.

Source layout:
- `main.ts` — plugin entry, search engine, inline panel, side view, code block.
- `settings.ts` — settings types, defaults, and the tabbed settings UI.
- `pdf-outline.ts` — the PDF outline extractor and card-index workflow.
- `i18n.ts` — English/Russian strings and the `t()` lookup.
- `styles.css` — styles.

---

## Notes & limitations

- Word-form matching is a heuristic, not a full morphological analyzer; it prefers recall. Use *Whole word* for strict matching.
- `ё` and `е` are treated as distinct characters by default.
- The inline panel is UI-only and is never saved to your notes.

---

## License

This plugin is free and open-source software, licensed under the GNU General Public License v3.0 (GPL-3.0).

You are free to use, inspect, modify, and distribute the code in accordance with the terms of the license. Contributions, feature requests, and issue reports are welcome via the project's GitHub repository.

---

## Acknowledgements

PDF links are formatted to be compatible with the [PDF++](https://github.com/RyotaUshio/obsidian-pdf-plus) plugin. PDF parsing uses pdf.js as bundled by Obsidian.
