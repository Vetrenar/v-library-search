# Library Search and PDF Outline

An Obsidian plugin consisting of two distinct modules designed for literature review and Zettelkasten workflows:
1. **Library Search:** Context-aware searching across a designated library folder based on the aliases or frontmatter properties of the active note.
2. **PDF Outline Extraction:** Automated extraction of PDF bookmarks into Markdown headings or lists, mapped to a "card index" note system.

---

## 1. Library Search

This module searches your vault for references to the concepts defined in your active note. It reads the `aliases` array (or a specified frontmatter property) from the current note and queries a designated "Library" folder.

### Setup
1. Open the plugin settings and define the **Library folder** (e.g., `Sources/` or `Library/`). If left blank, it defaults to the PDF Index folder or the entire vault.
2. Configure **Result groups** to categorize your library. By default, it looks for a `type` property in your notes' frontmatter (e.g., `type: book` or `type: article`).
3. Define **Search targets** per group. You can restrict searches to headings, callout titles/bodies, specific frontmatter fields, the full note body, or filenames.

### Usage Interfaces
* **Side Panel:** Open via the ribbon icon or the `Open Library Search panel` command. It tracks the active note and updates results automatically. You can pin the panel to stop it from tracking active leaf changes.
* **Inline Panel:** A virtual CodeMirror 6 panel docked at the top or bottom of the editor (configurable in settings). It can also appear as a banner in Reading View. It does not write any data to your Markdown file.
* **Code Block:** Embed a static search query directly into a note:
  ````markdown
  ```library-search
  artificial intelligence, neural networks
  ```
  ````
  This block combines the note's aliases with the comma-separated terms provided inside the block.

### Search Behavior
Search parameters such as case sensitivity, whole-word matching, and maximum matches per file can be adjusted in the settings to optimize performance on large vaults.

---

## 2. PDF Outline Extraction

This module reads the embedded bookmark tree of a PDF file and generates a clickable Table of Contents (ToC) using PDF++ style links (`[[file.pdf#page=N&offset=,,|p.X]]`).

### The Card Index Workflow
The extraction relies on a two-folder system:
* **Folder A (PDFs):** Where your PDF files are stored.
* **Folder B (Index/Cards):** Where the corresponding Markdown notes (cards) are created.

Each card is linked to its PDF via a frontmatter property (default: `pdf: "[[filename.pdf]]"`). When an extraction is triggered, the plugin locates the corresponding card (or creates it using a template) and writes the outline under a specific target heading (default: `## Contents`). 

Re-running the extraction on the same PDF is idempotent; it will only replace the content under the target heading, leaving the rest of your notes intact.

### Key Features
* **Page Labels:** Reads native PDF page labels to display "book page numbers" (e.g., `p. 8`) instead of physical PDF page numbers (e.g., `p. 32`). A manual offset can be applied if labels are missing.
* **Deep Outlines:** If a PDF has a deeply nested bookmark tree that exceeds Markdown's `H6` limit, the plugin can automatically convert deeper levels into nested bulleted lists.
* **OOM Protection:** Skips PDFs larger than 250 MB to prevent memory exhaustion during batch processing.

### Commands
* `PDF outline: insert into active note (pick PDF)`: Opens a modal to select any PDF in the vault and inserts its outline at the cursor (or copies to clipboard).
* `PDF outline: extract from current PDF → card`: Extracts the outline of the currently active PDF and writes it to its linked card.
* `PDF outline: update outline in current card`: Refreshes the ToC in the active Markdown card based on its linked PDF.
* `PDF outline: rebuild cards for all PDFs in folder`: Batch processes all PDFs in Folder A.
* `PDF outline: show unprocessed files`: Opens a modal listing PDFs that either lack a corresponding card or have an empty outline section, allowing for selective batch rebuilding.

### Templates and Placeholders
You can define a template note for newly created cards and customize the card filename format. The following placeholders are supported:

| Placeholder | Description |
| :--- | :--- |
| `{{file.name}}` | PDF filename with extension (e.g., `Book.pdf`) |
| `{{file.basename}}` | PDF filename without extension (e.g., `Book`) |
| `{{file.path}}` | Vault-relative path to the PDF |
| `{{page}}` | Physical page number (counted from 1) |
| `{{pageLabel}}` | Displayed book page number (from PDF labels or offset) |
| `{{pageCount}}` | Total number of pages in the PDF |
| `{{date}}` | Current date (DD-MM-YYYY) |

*Note: `{{page}}` and `{{pageLabel}}` are primarily intended for the link display template (e.g., `p.{{pageLabel}}`), while file and date variables are used for card filenames and body templates.*

---

## Localization

The plugin interface and settings are fully localized in:
* English (Default)
* Russian

The language can be changed in the first section of the plugin settings. Changes apply immediately to the settings tab and UI elements.

---

## Security & Privacy

* **100% Local Execution:** All search indexing, text parsing, and PDF processing are executed locally within your Obsidian environment using native APIs and bundled libraries (PDF.js).
* **Zero Telemetry:** The plugin does not collect analytics, track usage, or transmit any vault data, file names, or PDF contents to external servers. Your research data remains strictly on your device.
* **Data Integrity:** PDF outline extraction is designed to be idempotent. It targets specific headings and uses safe string splicing to avoid clobbering your personal notes or unrelated frontmatter.

---

## License

This plugin is free and open-source software, licensed under the **GNU General Public License v3.0 (GPL-3.0)**. 

You are free to use, inspect, modify, and distribute the code in accordance with the terms of the license. Contributions, feature requests, and issue reports are welcome via the project's GitHub repository.