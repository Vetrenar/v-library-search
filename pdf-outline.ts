/* ════════════════════════════════════════════════════════════════════════════
PDF OUTLINE EXTRACTOR  —  standalone feature module
Wired into the host plugin via:
this.pdfOutline = new PdfOutlineFeature(this, () => this.settings.pdfOutline);
this.pdfOutline.onload();
and renderPdfOutlineSettings(...) inside the settings tab.
Capabilities
────────────
• Extract a PDF's embedded outline (bookmarks) as Markdown headings whose
destinations become PDF++-style links: [[file.pdf#page=N&offset=,,|p.X]].
• "Book" page numbers (p.8) are read from the PDF's page labels; a manual
offset is used when labels are absent.
• Heading-level overflow: outline depth maps to heading level starting from a
base level. When the level would exceed H6, items render as nested LISTS of
the corresponding depth (level 7 → top-level bullet, 8 → one indent, …).
• Card index workflow: folder A holds PDFs, folder B holds one "card" note per
PDF (a frontmatter property links the card → PDF). On command, or when a PDF
is added to folder A, the matching card is found (or created from a template)
and the outline is written under a chosen heading — idempotently, between
invisible %% markers, so re-runs update in place without clobbering notes.
═══════════════════════════════════════════════════════════════════════════ */
import {
    App,
    FuzzySuggestModal,
    MarkdownView,
    Modal,
    Notice,
    Plugin,
    Setting,
    TFile,
    TFolder,
    normalizePath,
    loadPdfJs,
    moment,
} from 'obsidian';
import { t } from './i18n';
/* Obsidian re-exports moment via `export =`, which TypeScript treats as
non-callable. The runtime value is the normal callable moment; this alias
restores the call signature for date formatting. */
const mom = moment as unknown as (...args: unknown[]) => { format(fmt: string): string };
/* ── Settings ──────────────────────────────────────────────────────────────*/
export interface PdfOutlineSettings {
    /* Heading / list mapping */
    baseHeadingLevel: number;          // 0 = auto (target heading level + 1)
    overflowAsList: boolean;           // levels past H6 become nested lists
    listIndentUnit: string;            // indent per list level (e.g. 4 spaces / tab)
    includeLinklessHeadings: boolean;  // emit bookmarks without a destination
    /* Page numbering */
    usePageLabels: boolean;
    pageOffset: number;                // displayed = physical − offset (no labels)
    displayTemplate: string;           // link text; {{pageLabel}} / {{page}}

    /* Loose "pick a PDF" command output */
    output: 'cursor' | 'clipboard';

    /* Card index workflow */
    pdfFolder: string;                 // folder A (watched)
    indexFolder: string;               // folder B (cards)
    pdfLinkProperty: string;           // frontmatter key: card → pdf
    targetHeading: string;             // heading under which the TOC is written
    defaultTargetHeadingLevel: number; // used only if the heading must be created
    templatePath: string;              // template note for new cards (optional)
    cardNamePrefixStrip: string;       // strip this prefix from pdf name → card name
    cardNameTemplate: string;          // index-note filename template; {{pdf_name}} {{date}}
    autoCreateOnAdd: boolean;          // watch folder A, create/update on new pdf
}
export const DEFAULT_PDF_OUTLINE_SETTINGS: PdfOutlineSettings = {
    baseHeadingLevel: 0,
    overflowAsList: true,
    listIndentUnit: '    ',
    includeLinklessHeadings: true,
    usePageLabels: true,
    pageOffset: 0,
    displayTemplate: 'p.{{pageLabel}}',

    output: 'cursor',

    pdfFolder: '',
    indexFolder: '',
    pdfLinkProperty: 'pdf',
    targetHeading: 'Contents',
    defaultTargetHeadingLevel: 2,
    templatePath: '',
    cardNamePrefixStrip: '',
    cardNameTemplate: '{{pdf_name}}',
    autoCreateOnAdd: false,
};
/* Flat outline entry extracted from the PDF tree. */
interface OutlineEntry {
    depth: number;            // 1-based nesting depth in the bookmark tree
    title: string;
    pageIndex: number | null; // 0-based; null when the bookmark has no destination
}
interface ExtractedOutline {
    entries: OutlineEntry[];
    pageLabels: string[] | null;
    pageCount: number;        // total pages in the PDF (0 if unknown)
}
/* ── Template placeholders ───────────────────────────────────────────────────
Templates (card filename, card body, link display) use {{token}} syntax.
{{page}}          Physical page number, counted from 1          e.g. 32
{{pageLabel}}     Displayed number (PDF label, or page offset)   e.g. 8
{{file.name}}     PDF filename with extension                    Book.pdf
{{file.basename}} PDF filename without extension                 Book
{{file.path}}     Vault-relative path to the PDF                 PDF/Book.pdf
{{date}}          Today's date, DD-MM-YYYY                       10-06-2026
{{pageCount}}     Total pages in the PDF (0 if unknown)          312
page / pageLabel are only meaningful in the link-display template; in card
templates they resolve to an empty string. Unknown tokens collapse to ''.
No JavaScript is evaluated — substitution is plain text only.
Legacy aliases kept so older templates keep working:
{{pdf_name}} {{file_name}} {{title}}  → file.basename
{{pdf_path}} {{file_path}}            → file.path
{{pdf_fullname}}                      → file.name
{{pdf_link}} {{file_link}}            → [[link]]
{{folder}}                            → PDF's parent folder path
{{page_count}}                        → pageCount
{label} {pageLabel} {page} {pageCount}  (single-brace, display only)
──────────────────────────────────────────────────────────────────────────── */
type Placeholders = Record<string, string>;
/** Replace every {{token}} (and a few legacy single-brace tokens) in `tpl`
from the `vars` map. Unknown tokens become ''. Never throws; no eval. */
function fillTemplate(tpl: string, vars: Placeholders): string {
    if (!tpl) return tpl;
    return tpl
        .replace(/{{\s*([\w.]+)\s*}}/g, (_m, key: string) => vars[key] ?? '')
        .replace(/{\s*(page|pageLabel|label|pageCount)\s*}/g, (_m, key: string) => vars[key] ?? '');
}
/** Pre-computed card→PDF mapping to avoid O(NM) lookups in batch scans. */
interface CardLookup {
    /* pdfPath → card (resolved via link property — authoritative). */
    byLink: Map<string, TFile>;
    /* normalised expected-basename → card (name-based fallback). */
    byName: Map<string, TFile>;
    /* All card files in the index folder (for cached reads). */
    cards: TFile[];
}
/**
Cached PDF index for O(1) basename lookups instead of O(N) linear scans.
Built once per batch operation and reused across all lookups.
*/
interface PdfIndex {
    /* All PDF files in the vault. */
    files: TFile[];
    /* normalised-basename → TFile  (first match wins, like allPdfs().find). */
    byBasename: Map<string, TFile>;
}
/** Classification of an unprocessed PDF.
'no_card'        — the index card note does not exist at all.
'empty_section'  — the card exists but the target heading section is empty
                (heading missing or has no content under it). */
type UnprocessedStatus = 'no_card' | 'empty_section';
/** A PDF that needs attention, with the reason why. */
interface UnprocessedPdfInfo {
    pdf: TFile;
    status: UnprocessedStatus;
}
/* ════════════════════════════════════════════════════════════════════════════
FEATURE
═══════════════════════════════════════════════════════════════════════════ */
export class PdfOutlineFeature {
    private app: App;
    private autoTimer: number | null = null;
    private autoQueue = new Set<string>();
    /** Cached PDF index for the current batch operation. Null when idle. */
    private pdfIndexCache: PdfIndex | null = null;
    constructor(
        private plugin: Plugin,
        private getSettings: () => PdfOutlineSettings,
    ) {
        this.app = plugin.app;
    }

    onload() {
        const p = this.plugin;

        p.addCommand({
            id: 'pdf-outline-pick',
            name: t('pdf.cmd.pick'),
            callback: () => this.pickAndInsert(),
        });

        p.addCommand({
            id: 'pdf-outline-current',
            name: t('pdf.cmd.current'),
            checkCallback: (checking) => {
                const f = this.currentPdf();
                if (!f) return false;
                if (!checking) void this.extractToCard(f);
                return true;
            },
        });

         p.addCommand({
            id: 'pdf-outline-update-card',
            name: t('pdf.cmd.updateCard'),
            checkCallback: (checking) => {
                const c = this.currentCard();
                if (!c) return false;
                if (!checking) void this.updateCard(c);
                return true;
            },
        });

         p.addCommand({
            id: 'pdf-outline-rebuild-folder',
            name: t('pdf.cmd.rebuildFolder'),
            callback: () => void this.rebuildFolder(),
        });

        p.addCommand({
            id: 'pdf-outline-show-unprocessed',
            name: t('pdf.cmd.showUnprocessed'),
            callback: () => void this.showUnprocessed(),
        });

        // Context menu on any PDF file.
        p.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
            if (file instanceof TFile  && file.extension === 'pdf') {
                menu.addItem(i => i
                    .setTitle(t('pdf.menu.extractToCard'))
                    .setIcon('list-tree')
                    .onClick(() => void this.extractToCard(file)));
                menu.addItem(i => i
                    .setTitle(t('pdf.menu.copyToClipboard'))
                    .setIcon('clipboard-list')
                    .onClick(() => void this.copyToClipboard(file)));
            }
        }));

        // Auto-track folder A. Attach AFTER layout-ready so the initial vault load
        // (which fires `create` for every existing file) doesn't mass-process.
        this.app.workspace.onLayoutReady(() => {
            p.registerEvent(this.app.vault.on('create', (file) => {
                const s = this.getSettings();
                if (!s.autoCreateOnAdd) return;
                if (!(file instanceof TFile) || file.extension !== 'pdf') return;
                 if (!this.inFolder(file, s.pdfFolder)) return;
                this.queueAuto(file);
            }));
        });

        // Invalidate the PDF index cache on vault changes so single-file calls never use stale data.
        const clearIdx = () => this.clearPdfIndexCache();
        p.registerEvent(this.app.vault.on('create', clearIdx));
        p.registerEvent(this.app.vault.on('rename',  clearIdx));
        p.registerEvent(this.app.vault.on('delete', clearIdx));

        // Cleanup on unload.
        p.register(() => { if (this.autoTimer !== null) window.clearTimeout(this.autoTimer); });
    }

    /* ── PDF index cache ────────────────────────────────────────────────────*/

    /** Build (or return cached) PDF index. The cache lives for the duration of
     *  a batch operation (e.g. showUnprocessed, rebuildFolder) and is cleared
     *  when the operation finishes. This turns repeated O(N) `allPdfs().find()`
     *  calls into O(1) Map lookups. */
    private getPdfIndex(): PdfIndex {
        if (this.pdfIndexCache) return this.pdfIndexCache;
        const files = this.allPdfs();
        const byBasename = new Map<string, TFile>();
        for (const f of files) {
            const key = f.basename.toLowerCase().normalize('NFC');
            if (!byBasename.has(key)) byBasename.set(key, f);
        }
        this.pdfIndexCache = { files, byBasename };
        return this.pdfIndexCache;
    }

    /** Clear the PDF index cache. Call after a batch operation finishes. */
    private clearPdfIndexCache() {
        this.pdfIndexCache = null;
    }

    /** Find a PDF by basename using the cached index (O(1)) instead of
     *  iterating all vault files (O(N)). Falls back to linear scan only
     *  if the cache isn't  populated. */
    private findPdfByBasename(basename: string): TFile | null {
        const idx = this.getPdfIndex();
        const key = basename.toLowerCase().normalize('NFC');
        return idx.byBasename.get(key) ?? null;
    }

    /* ── Commands / entry points ────────────────────────────────────────────*/

    /** Pick any PDF and drop its outline at the cursor (or clipboard).  */
    pickAndInsert() {
        const pdfs = this.allPdfs();
        if (!pdfs.length) { new Notice(t('pdf.notice.noPdfsInVault')); return; }
        new PdfPickerModal(this.app, pdfs, (pdf) => {
            void (async () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const sourcePath = view?.file?.path ?? '';
                const out = await this.readPdfOutline(pdf);
                if (!out.entries.length) { new Notice(t('pdf.notice.noOutline')); return; }
                const base = this.looseBase();
                const md = this.renderOutline(out, base, this.linkText(pdf, sourcePath), pdf) + '\n';
                if (this.getSettings().output === 'cursor' && view && view.getMode() === 'source') {
                    view.editor.replaceSelection(md);
                    new Notice(t('pdf.notice.outlineInserted'));
                } else {
                    await navigator.clipboard.writeText(md);
                    new Notice(t('pdf.notice.outlineCopied'));
                }
            })();
        }).open();
    }

    async copyToClipboard(pdf: TFile) {
        const out = await this.readPdfOutline(pdf);
        if (!out.entries.length) { new Notice(t('pdf.notice.noOutline')); return; }
        const md = this.renderOutline(out, this.looseBase(), this.linkText(pdf, ''), pdf) + '\n';
        await navigator.clipboard.writeText(md);
        new Notice(t('pdf.notice.outlineCopied'));
    }

    /** PDF → its card (found or created), TOC written under the target heading.
     *  Returns a status string so callers (especially processBatch) can tell
     *  what happened without parsing Notices. */
    async extractToCard(pdf: TFile, silent = false): Promise<'ok' | 'no_outline' | 'skipped' | 'error'> {
        const s = this.getSettings();
        if (!s.indexFolder && !s.templatePath) {
            // Card workflow not configured → fall back to clipboard.
            if (!silent) await this.copyToClipboard(pdf);
            return 'skipped';
        }
        const notice = silent ? null : new Notice(`PDF outline: ${pdf.name} …`, 0);
        try {
            const out = await this.readPdfOutline(pdf);
            if (!out.entries.length) {
                notice?.hide();
                if (!silent) new Notice(t('pdf.notice.noOutlineBookmarks'));
                return 'no_outline';
            }
            let card = this.findCardForPdf(pdf);
            const created = !card;
            if (!card) {
                card = await this.createCardForPdf(pdf, out.pageCount);
            } else {
                // Heal a found card whose link property is missing/broken so the
                // cache lookup succeeds next time (no duplicate on re-run).
                await this.ensureLinkProperty(card, pdf);
             }
            await this.writeOutline(card, pdf, out);
            notice?.hide();
            if (!silent) {
                new Notice(created
                    ? t('pdf.notice.createdAndInserted').replace('{{name}}', card.basename)
                    : t('pdf.notice.updatedOutline').replace('{{name}}', card.basename));
            }
            return 'ok';
        } catch (e) {
            notice?.hide();
            console.error('[PDF outline] extractToCard failed:', e);
            if (!silent) new Notice(t('pdf.notice.failed'));
            return 'error';
        }
    }

    /** Active card → resolve its linked PDF → refresh the TOC. */
    async updateCard(card: TFile): Promise<void> {
        const pdf = this.linkedPdf(card);
        if (!pdf) { new Notice(t('pdf.notice.noLinkedPdf').replace('{{prop}}', this.getSettings().pdfLinkProperty || 'pdf')); return; }
        const notice = new Notice(`PDF outline: ${pdf.name} …`, 0);
        try {
            const out = await this.readPdfOutline(pdf);
            if (!out.entries.length) { notice.hide(); new Notice(t('pdf.notice.noOutline')); return; }
            await this.writeOutline(card, pdf, out);
            notice.hide();
            new Notice(t('pdf.notice.updatedOutline').replace('{{name}}', card.basename));
        } catch (e) {
            notice.hide();
            console.error('[PDF outline] updateCard failed:', e);
            new Notice(t('pdf.notice.failed'));
        }
    }

    /** Process every PDF under folder A. */
    async rebuildFolder(): Promise<void> {
        const s = this.getSettings();
        const pdfs = this.allPdfs().filter(f => this.inFolder(f, s.pdfFolder));
        if (!pdfs.length) { new Notice(t('pdf.notice.noPdfsInFolder')); return; }
        // Warm up the PDF index cache for the batch.
        this.getPdfIndex();
        const notice = new Notice(t('pdf.notice.rebuilding').replace('{{count}}', String(pdfs.length)), 0);
        let ok = 0;
        try {
            for (let i = 0; i < pdfs.length; i++) {
                try { await this.extractToCard(pdfs[i], true); ok++; }
                catch (e) { console.error('[PDF outline]', pdfs[i].path, e); }
                // Yield every 4 PDFs to keep the UI responsive.
                if (i % 4 === 3) await new Promise<void>(r => window.setTimeout(r, 0));
            }
        } finally {
            this.clearPdfIndexCache();
        }
        notice.hide();
        new Notice(t('pdf.notice.processed').replace('{{ok}}', String(ok)).replace('{{total}}', String(pdfs.length)));
    }

    /* ── Auto-tracking ──────────────────────────────────────────────────────*/

    private queueAuto(file: TFile) {
        this.autoQueue.add(file.path);
        if (this.autoTimer !== null)  window.clearTimeout(this.autoTimer);
        this.autoTimer = window.setTimeout(() => {
            const paths = [...this.autoQueue];
            this.autoQueue.clear();
            this.autoTimer = null;
            // Sequential — avoids duplicate-card race when multiple PDFs land at once.
            void (async () => {
                for (const path of paths) {
                    const f = this.app.vault.getAbstractFileByPath(path);
                    if (f instanceof TFile && f.extension === 'pdf') await this.extractToCard(f, true);
                }
            })();
        }, 1200);
    }

    /* ── PDF reading ────────────────────────────────────────────────────────*/

    private async readPdfOutline(pdf: TFile): Promise<ExtractedOutline> {
        const pdfjsLib = await loadPdfJs();

        // 🛡 OOM Protection: Skip huge files to prevent Electron crash.
        // 250 MB is a safe upper bound for Uint8Array allocation in V8.
        const MAX_SAFE_SIZE = 250 * 1024 * 1024;
        if (pdf.stat?.size && pdf.stat.size > MAX_SAFE_SIZE) {
            console.warn(`[PDF Outline] Skipping huge file to prevent OOM: ${pdf.path} (${(pdf.stat.size / 1024 / 1024).toFixed(1)} MB)`);
            new Notice(t('pdf.notice.skippedHuge').replace('{{name}}', pdf.basename));
            return { entries: [], pageLabels: null, pageCount: 0 };
        }

        let doc: Record<string, unknown> | null = null;
        try {
            // Pass ArrayBuffer directly to PDF.js — avoids a 2× peak-memory spike.
            const data = await this.app.vault.readBinary(pdf);
            doc = await (pdfjsLib as Record<string, unknown>).getDocument({ data }).promise as Record<string, unknown>;

            const entries: OutlineEntry[] = [];
            const tree = await (doc.getOutline as () => Promise<unknown[]>)();
            if (tree && tree.length) await this.flatten(doc, tree, 1, entries);

            let pageLabels: string[] | null = null;
            if (this.getSettings().usePageLabels) {
                try { pageLabels = await (doc.getPageLabels as () => Promise<string[] | null>)(); } catch { pageLabels = null; }
            }
            const pageCount: number = (typeof doc.numPages === 'number') ? doc.numPages as number : 0;
            return {  entries, pageLabels, pageCount };
        } catch (e) {
            console.error(`[PDF Outline] Failed to parse ${pdf.path}:`, e);
            new Notice(`Failed to parse PDF: ${pdf.basename}`);
            return { entries: [], pageLabels: null, pageCount: 0 };
        } finally {
            // 🧹 CRITICAL: Release WASM/JS memory held by PDF.js.
            // Without this, batch processing hundreds of PDFs will leak memory
            // until Obsidian's V8 heap is exhausted.
            if (doc) {
                try { if (typeof doc.destroy === 'function') await (doc.destroy as () => Promise<void>)(); } catch { /* no-op */ }
            }
        }
    }

    /** Iterative stack-based flattening — avoids call-stack overflow on deep outlines. */
    private async flatten(doc: Record<string, unknown>, rootItems: unknown[], startDepth: number, acc: OutlineEntry[]) {
        interface StackItem { item: Record<string, unknown>; depth: number }
        const stack: StackItem[] = rootItems
            .slice().reverse().map(item => ({ item: item as Record<string, unknown>, depth: startDepth }));
        while (stack.length) {
            const { item, depth } = stack.pop()!;
            if (!item || typeof item !== 'object') continue;
            acc.push({
                depth,
                title: ((item.title as string) ?? '').trim(),
                pageIndex: await this.resolveDest(doc, item.dest as string | unknown[] | null),
            });
            const items = item.items as unknown[] | undefined;
            if (Array.isArray(items) && items.length) {
                for (let i = items.length - 1; i >= 0; i--) {
                    stack.push({ item: items[i] as Record<string, unknown>, depth: depth + 1 });
                }
            }
        }
    }

    private async resolveDest(doc: Record<string, unknown>, dest: string | unknown[] | null): Promise<number | null> {
        try {
            if (dest == null) return null;
            const explicit: unknown[] | null = Array.isArray(dest) ? dest : await (doc.getDestination as (d: string) => Promise<unknown[] | null>)(dest as string);
            if (!explicit || !explicit.length) return null;
            const ref = explicit[0];
            if (ref == null) return null;
            if (typeof ref === 'number') return ref;          // rare: direct 0-based page
            const pageIndex = await (doc.getPageIndex as (r: unknown) => Promise<number>)(ref);
            // Guard against undefined/null returns from getPageIndex
            return (typeof pageIndex === 'number') ? pageIndex : null;
        } catch { return null; }
    }

    /* ── Rendering (the heading→list overflow lives here) ────────────────────*/

    private renderOutline(out: ExtractedOutline, base: number, linkText: string, pdf: TFile): string {
        const s = this.getSettings();
        const lines: string[] = [];
        for (const e of out.entries) {
            const level = base + (e.depth - 1);
            const link = e.pageIndex === null ? '' : this.formatLink(e.pageIndex, linkText, out.pageLabels, out.pageCount, pdf);

            if (level <= 6) {
                if (e.pageIndex === null) {
                    if (s.includeLinklessHeadings && e.title) lines.push('#'.repeat(level) + ' ' + e.title);
                } else {
                    lines.push('#'.repeat(level) + ' ' + e.title + ' ' + link);
                }
            } else if (s.overflowAsList) {
                // level 7 → indent 0, level 8 → indent 1, …
                const indent = s.listIndentUnit.repeat(Math.max(0, level - 7));
                const text = link ? e.title + ' ' + link : e.title;
                if (e.pageIndex !== null || (s.includeLinklessHeadings && e.title)) {
                    lines.push(indent + '- ' + text);
                }
            } else {
                // Clamp everything past H6 to H6.
                if (e.pageIndex === null)  {
                    if (s.includeLinklessHeadings && e.title) lines.push('###### ' + e.title);
                } else {
                    lines.push('###### ' + e.title + ' ' + link);
                }
            }
        }
        return lines.join('\n');
    }

    private formatLink(pageIndex: number, linkText: string, pageLabels: string[] | null, pageCount: number, pdf: TFile): string {
        const s = this.getSettings();
        const physical = pageIndex + 1;
        const label = (s.usePageLabels && pageLabels && pageLabels[pageIndex])
            ? pageLabels[pageIndex]
            : String(physical - s.pageOffset);
        const vars: Placeholders = {
            ...this.fileVars(pdf, pageCount),
             page:      String(physical),
            pageLabel: label,
            label,                       // legacy alias
            pageCount: String(pageCount),
        };
        const display = fillTemplate(s.displayTemplate, vars);
        return `[[${linkText}#page=${physical}&offset=,,|${display}]]`;
    }

    /* ── Card resolution / creation ─────────────────────────────────────────*/

    /** Resolve the PDF linked from a card's frontmatter property. Tolerates a
     *  missing `.pdf` extension and names that collide with a same-named note.
     *
     *  FIX: Uses the cached PDF index (O(1) basename lookup) instead of
     *  calling allPdfs().find() (O(N)) for the last-resort fallback. */
    private linkedPdf(card: TFile): TFile | null {
        const prop = this.getSettings().pdfLinkProperty || 'pdf';
        const cache = this.app.metadataCache.getFileCache(card);

        const resolve = (link: string): TFile | null => {
            const clean = link.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split(/[|#]/)[0].trim();
            if (!clean) return null;
            let dest = this.app.metadataCache.getFirstLinkpathDest(clean, card.path);
            if (dest && dest.extension === 'pdf') return dest;
            if (!/\.pdf$/i.test(clean)) {
                dest = this.app.metadataCache.getFirstLinkpathDest(clean + '.pdf', card.path);
                 if (dest && dest.extension === 'pdf') return dest;
            }
            // Last resort: O(1) basename lookup via cached index instead of
            // the old O(N) allPdfs().find() scan.
            const base = clean.replace(/\.pdf$/i, '');
            return this.findPdfByBasename(base);
        };

        // 1) Indexed frontmatter links.
        for (const l of cache?.frontmatterLinks ?? []) {
            if (l.key.split('.')[0] !== prop) continue;
            const dest = resolve(l.link);
            if (dest) return dest;
        }
        // 2) Raw frontmatter value.
        const raw = cache?.frontmatter?.[prop];
        for (const v of Array.isArray(raw) ? raw : [raw]) {
            if (typeof v !== 'string') continue;
            const dest = resolve(v);
            if (dest) return dest;
        }
        return null;
    }

    /** Find the card in folder B for this PDF — first by its link property
     *  (authoritative), then by expected filename (cache-independent).
      *
     *  FIX: Uses buildCardLookup() with the cached PDF index to avoid
     *  O(N*M) scans. For single-PDF lookups the old approach is fine. */
    private findCardForPdf(pdf: TFile): TFile | null {
        const s = this.getSettings();
        const cards = this.app.vault.getMarkdownFiles().filter(f => this.inFolder(f, s.indexFolder));
        // 1) A card whose link property resolves to this PDF.
        for (const card of cards) {
            const dest = this.linkedPdf(card);
            if (dest && dest.path === pdf.path) return card;
        }
        // 2) A card whose name matches the one this PDF maps to. Catches cards
        //    created moments ago (metadata cache not yet updated) and cards whose
        //    link property is missing/broken — reuse + repair beats duplicating.
        const expected = this.norm(this.expectedCardBasename(pdf));
        const byName = cards.find(c => this.norm(c.basename) === expected);
        return byName ?? null;
    }

    /** The card basename a PDF maps to (prefix-strip + filename template),
     *  BEFORE uniquification. Also used to detect an already-existing card. */
    private expectedCardBasename(pdf: TFile, pageCount = 0): string {
        const s = this.getSettings();
        let name = pdf.basename;
        if (s.cardNamePrefixStrip && name.startsWith(s.cardNamePrefixStrip)) {
            name = name.slice(s.cardNamePrefixStrip.length);
        }
        name = name.trim() || pdf.basename;

        const tmpl = (s.cardNameTemplate && s.cardNameTemplate.trim()) || '{{file.basename}}';
        // {{pdf_name}} keeps its historical meaning here: the prefix-stripped name.
        const vars = { ...this.fileVars(pdf, pageCount), pdf_name: name };
        let base = fillTemplate(tmpl, vars);
        base = (base.trim() || name).replace(/[\\/:*?"<>|]/g, '-');
        return base;
    }

    /** Make sure the card's link property points at the PDF, so a later
     *  cache-based lookup finds it instead of creating a duplicate.
     *  Uses processFrontMatter with feature-detection fallback for
     *  compatibility with Obsidian versions before 1.4. */
    private async ensureLinkProperty(card: TFile, pdf: TFile): Promise<void> {
        const prop = this.getSettings().pdfLinkProperty || 'pdf';
        const linkText = this.linkText(pdf, card.path);
        if (typeof this.app.fileManager.processFrontMatter === 'function') {
            await this.app.fileManager.processFrontMatter(card, (fm: Record<string, unknown>) => {
                const cur = fm[prop];
                if (cur == null || cur === '') fm[prop] = `[[${linkText}]]`;
            });
        }
    }

    private async createCardForPdf(pdf: TFile, pageCount = 0): Promise<TFile> {
        const s = this.getSettings();
        const folder = this.resolveFolderPath(s.indexFolder);
        if (folder) await this.ensureFolder(folder);

        const base = this.expectedCardBasename(pdf, pageCount);
        const cardPath = await this.uniquePath(normalizePath((folder ? folder + '/' : '') + base + '.md'));

        const linkText = this.linkText(pdf, cardPath);
        let content = '';
        if (s.templatePath) {
            const tpl = this.app.vault.getAbstractFileByPath(normalizePath(s.templatePath));
            if (tpl instanceof TFile) content = await this.app.vault.read(tpl);
        }
        content = this.fillCardTemplate(content, pdf, linkText, pageCount);

        const card = await this.app.vault.create(cardPath, content);
         await this.ensureLinkProperty(card, pdf);
        return card;
    }

    /** Flat token→value map for the file (shared by every template). */
    private fileVars(pdf: TFile, pageCount: number, linkText?: string): Placeholders {
        const basename = pdf.basename;
        const path = pdf.path;
        const vars: Placeholders = {
            'file.name':     pdf.name,
            'file.basename': basename,
            'file.path':     path,
            'folder':        pdf.parent?.path ?? '',
            'pageCount':     String(pageCount),
            'date':          mom().format('DD-MM-YYYY'),
            // legacy aliases
            'pdf_name':      basename,
            'file_name':     basename,
            'title':         basename,
            'pdf_fullname':  pdf.name,
            'file_name_ext': pdf.name,
            'pdf_path':      path,
            'file_path':     path,
            'page_count':    String(pageCount),
        };
        if (linkText != null) {
            const wl = `[[${linkText}]]`;
            vars['pdf_link']  = wl;
            vars['file_link'] = wl;
            vars['link']      = wl;
            vars['linktext']  = linkText;
        }
         return vars;
    }

    /** Fill a card-body / card-name template via {{token}} substitution. */
    private fillCardTemplate(tpl: string, pdf: TFile, linkText: string, pageCount: number): string {
        return fillTemplate(tpl, this.fileVars(pdf, pageCount, linkText));
    }

    /* ── Writing the TOC into the card (idempotent, marker-based) ────────────*/

    private async writeOutline(card: TFile, pdf: TFile, out: ExtractedOutline) {
        const linkText = this.linkText(pdf, card.path);
        await this.app.vault.process(card, (content) => this.spliceOutline(content, out, linkText, pdf));
    }

    private spliceOutline(content: string, out: ExtractedOutline, linkText: string, pdf: TFile): string {
        const s = this.getSettings();
        const nl = content.includes('\r\n') ? '\r\n' : '\n';
        const lines = content.split(/\r?\n/);

        const headings = this.parseHeadings(lines);
        const target = headings.find(h => this.norm(h.text) === this.norm(s.targetHeading));

        let headingLine: number;
        let headingLevel: number;

        if (target) {
            headingLine = target.line;
            headingLevel = target.level;
        } else {
            // Append the heading at end of file.
            headingLevel = Math.min(6, Math.max(1, s.defaultTargetHeadingLevel));
            if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
            lines.push('#'.repeat(headingLevel) + ' ' + s.targetHeading);
            headingLine = lines.length - 1;
        }

        //  Section ends at the next heading of equal/higher rank, else EOF.
        let sectionEnd = lines.length;
        for (const h of headings) {
            if (h.line > headingLine && h.level <= headingLevel) { sectionEnd = h.line; break; }
        }

        const base = s.baseHeadingLevel > 0 ? s.baseHeadingLevel : headingLevel + 1;
        const outlineMd = this.renderOutline(out, base, linkText, pdf);
        const outlineLines = outlineMd.length ? outlineMd.split('\n') :  [];

        // Replace the whole section under the target heading with the fresh
        // outline — no comment markers. This heading is the outline's container,
        // so re-running just refreshes its body.
        const replacement = outlineLines.length ? ['', ...outlineLines, ''] : [''];
        // Avoid spread-into-splice stack overflow for PDFs with thousands of bookmarks.
        const splicedLines = [
            ...lines.slice(0, headingLine + 1),
            ...replacement,
            ...lines.slice(sectionEnd),
        ];
        lines.length = 0;
        lines.push(...splicedLines);
        return lines.join(nl);
    }

    /** Lightweight heading parser that skips frontmatter and fenced code blocks. */
    private parseHeadings(lines: string[]): { line: number; level:  number; text: string }[] {
        const out: { line: number; level: number; text: string }[] = [];
        let start = 0;
        if (lines[0] === '---') {
            const end = lines.indexOf('---', 1);
            if (end > 0) start = end + 1;
        }
        let inFence = false;
        let fenceChar = '';
        for (let i = start; i < lines.length; i++) {
            const line = lines[i];
            const fence = line.match(/^\s*(```+|~~~+)/);
            if (fence) {
                const marker = fence[1];
                if (!inFence) { inFence = true; fenceChar = marker; }
                // Closing: same char AND at least as long as opening (CommonMark spec).
                else if (marker[0] === fenceChar[0] && marker.length >= fenceChar.length) { inFence = false; }
                continue;
            }
            if (inFence) continue;
            const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
            if (h) out.push({ line: i, level: h[1].length, text: h[2].trim() });
        }
        return out;
    }

    /* ── Unprocessed scan / batch rebuild ───────────────────────────────────*/

    /** A PDF is "processed" when it has a card whose target heading exists and
     *  has non-empty content under it. */
    async isProcessed(pdf: TFile): Promise<boolean> {
        const card = this.findCardForPdf(pdf);
        if (!card) return false;
        try {
            const content = await this.app.vault.cachedRead(card);
            return this.targetSectionHasContent(content);
        } catch { return false; }
    }

    /** Build a one-shot lookup table mapping each card to its linked PDF.
     *  Scans the index folder once instead of per-PDF, turning O(N*M) into O(M+N).
     *
     *  FIX: Uses the cached PDF index so linkedPdf()'s fallback basename
     *  lookup is O(1) instead of O(N) per card. Also pre-reads all card
     *  contents using the cache to avoid repeated disk I/O. */
    private buildCardLookup(): CardLookup {
        const s = this.getSettings();
        const cards = this.app.vault.getMarkdownFiles().filter(f => this.inFolder(f, s.indexFolder));
        const byLink = new Map<string, TFile>();
        const byName = new Map<string, TFile>();

        for (const card of cards) {
            // 1) Link-based lookup (authoritative) — now uses O(1) PDF index
            const dest = this.linkedPdf(card);
            if (dest) byLink.set(dest.path, card);

            // 2) Name-based lookup (fallback for cards without a valid link)
            const base = this.norm(card.basename);
            if (!byName.has(base)) byName.set(base, card);
        }

        return { byLink, byName, cards };
    }

    /** Like isProcessed(), but uses a pre-built lookup instead of scanning all
     *  markdown files for every PDF. Also caches card file reads. */
    private async isProcessedWithLookup(
        pdf: TFile,
        lookup: CardLookup,
        contentCache: Map<string, string>,
    ): Promise<boolean> {
        const status = await this.getUnprocessedStatus(pdf, lookup, contentCache);
        return status === 'processed';
    }

    /** Classify a PDF's processing status using a pre-built lookup.
     *  Returns 'no_card' if the card does not exist at all,
     *  'empty_section' if the card exists but its target heading section
     *  is empty or missing, or 'processed' if everything is in order. */
    private async getUnprocessedStatus(
        pdf: TFile,
        lookup: CardLookup,
        contentCache: Map<string, string>,
    ): Promise<'no_card' | 'empty_section' | 'processed'> {
        // 1) Try link-based lookup first (authoritative).
        let card = lookup.byLink.get(pdf.path) ?? null;

        // 2) Fallback: name-based match.
        if (!card) {
            const expected = this.norm(this.expectedCardBasename(pdf));
            card = lookup.byName.get(expected) ?? null;
        }

        if (!card) return 'no_card';
        try {
            let content = contentCache.get(card.path);
            if (content === undefined) {
                content = await this.app.vault.cachedRead(card);
                contentCache.set(card.path, content);
             }
            return this.targetSectionHasContent(content) ? 'processed' : 'empty_section';
        } catch {
            return 'no_card';
        }
    }

    /** True when the configured target heading exists and its section body has
     *  at least one non-blank line. */
    private targetSectionHasContent(content: string): boolean {
        const s = this.getSettings();
        const lines = content.split(/\r?\n/);
        const headings = this.parseHeadings(lines);
        const target = headings.find(h => this.norm(h.text) === this.norm(s.targetHeading));
        if (!target) return false;
        let sectionEnd = lines.length;
        for (const h of headings) {
            if (h.line > target.line && h.level <= target.level) { sectionEnd = h.line; break; }
        }
        for (let i = target.line + 1; i < sectionEnd; i++) {
            if (lines[i].trim() !== '') return true;
        }
        return false;
    }

    /** Collect + show PDFs (in folder A, or whole vault) that have no outline yet,
     *   classified by reason: card missing vs card has empty outline section.
     *
     *  FIX (was freezing Obsidian):
     *  1. Warm up the PDF index cache so linkedPdf()'s basename lookup is O(1)
     *     instead of calling allPdfs().find() (O(N)) for every card.
     *  2. Cache card file contents within a single scan so each card is read
     *     at most once (cachedRead is only cached across calls if the file was
     *     already read; first reads still hit disk).
     *  3. Yield to the UI thread every 4 PDFs (was 8) for better responsiveness.
     *  4. Clear the cache after the operation finishes. */
    async showUnprocessed(): Promise<void> {
        const s = this.getSettings();
        if (!s.indexFolder && !s.templatePath) {
            new Notice(t('pdf.notice.configureFirst'));
            return;
        }
        const pdfs = this.allPdfs().filter(f => this.inFolder(f, s.pdfFolder));
        if (!pdfs.length) { new Notice(t('pdf.notice.noPdfsInFolder')); return; }

        // Warm up the PDF index cache — this is the key fix for the freeze.
        // Without it, buildCardLookup() → linkedPdf() → allPdfs().find()
        // becomes O(M*N) where M = cards, N = PDFs.
        this.getPdfIndex();

        // Build the card→PDF lookup once (not per-PDF) to avoid O(N*M) scans.
        const cardLookup = this.buildCardLookup();

        // Cache card file contents within this scan so each card is read at
         // most once, even if multiple PDFs resolve to the same card.
        const contentCache = new Map<string, string>();

        const notice = new Notice(t('pdf.notice.scanning'), 0);
        const unprocessed: UnprocessedPdfInfo[] = [];

        try {
            for (let i = 0; i < pdfs.length; i++) {
                const status = await this.getUnprocessedStatus(pdfs[i], cardLookup, contentCache);
                if (status !== 'processed') {
                    unprocessed.push({ pdf: pdfs[i], status });
                }
                // Yield to the UI thread every 4 PDFs so Obsidian doesn't freeze.
                // (Was 8, reduced for better responsiveness with large vaults.)
                if (i % 4 === 3) await new Promise<void>(r => window.setTimeout(r, 0));
            }
        } finally {
            this.clearPdfIndexCache();
        }

        notice.hide();
        if (!unprocessed.length) { new Notice(t('pdf.notice.allProcessed')); return; }
        new UnprocessedPdfsModal(this.app, this, unprocessed).open();
    }

    /** Rebuild a chosen set of PDFs (used by the unprocessed modal).
     *  Shows detailed results: how many succeeded, how many had no outline, errors. */
    async processBatch(pdfs: TFile[]): Promise<void> {
        if (!pdfs.length) return;
        // Warm up the PDF index cache for the batch.
        this.getPdfIndex();
        const notice = new Notice(t('pdf.notice.rebuilding').replace('{{count}}', String(pdfs.length)), 0);
        let ok = 0;
        let noOutlineCount = 0;
        let errorCount = 0;
        try {
            for (let i = 0; i < pdfs.length; i++) {
                const result = await this.extractToCard(pdfs[i], true);
                if (result === 'ok') ok++;
                else if (result === 'no_outline') {
                     noOutlineCount++;
                    new Notice(t('pdf.notice.noOutlineEntry').replace('{{name}}', pdfs[i].basename), 4000);
                }
                else errorCount++;
                // Yield every 4 PDFs.
                if (i % 4 === 3) await new Promise<void>(r => window.setTimeout(r, 0));
            }
        } finally {
            this.clearPdfIndexCache();
        }
        notice.hide();
        const parts: string[] = [];
        if (ok) parts.push(t('pdf.batchProcessed').replace('{{ok}}', String(ok)));
        if (noOutlineCount) parts.push(t('pdf.batchNoOutline').replace('{{count}}', String(noOutlineCount)));
        if (errorCount) parts.push(t('pdf.batchFailed').replace('{{count}}', String(errorCount)));
        new Notice(`PDF outline: ${parts.join(', ')} (${pdfs.length} total).`);
    }

    /* ── Small helpers ──────────────────────────────────────────────────────*/

    private allPdfs(): TFile[] {
        return this.app.vault.getFiles().filter(f => f.extension === 'pdf');
    }

    private currentPdf(): TFile | null {
        const f = this.app.workspace.getActiveFile();
        return f && f.extension === 'pdf' ? f : null;
    }

    private currentCard(): TFile | null {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== 'md') return null;
         return this.linkedPdf(f) ? f : null;
    }

    private linkText(pdf: TFile, sourcePath: string): string {
        return this.app.metadataCache.fileToLinktext(pdf, sourcePath, false);
    }

    private looseBase(): number {
        const b = this.getSettings().baseHeadingLevel;
        return b > 0 ? b : 3;
    }

    /** Resolve a user-typed folder string to an existing folder's real path,
     *  matching case-insensitively so a casing typo doesn't spawn a duplicate
     *  folder or hide existing cards. Returns the normalized input if no such
     *  folder exists yet. */
    private resolveFolderPath(folder: string): string {
        const norm = normalizePath(folder || '').replace(/\/+$/, '');
        if (!norm || norm === '/') return '';
        if (this.app.vault.getAbstractFileByPath(norm)) return norm;
        const ci = this.app.vault.getAllLoadedFiles()
            .find(f => f instanceof TFolder && f.path.toLowerCase() === norm.toLowerCase());
        return ci ? ci.path : norm;
    }

    private inFolder(file: TFile, folder: string): boolean {
        const root = this.resolveFolderPath(folder);
        if (!root) return true;                   // empty = whole vault
        return file.path === root || file.path.startsWith(root + '/');
    }

    private norm(s: string): string  {
        return s.normalize('NFC').trim().toLowerCase();
    }

    private async ensureFolder(path: string) {
        const parts = normalizePath(path).split('/').filter(Boolean);
        let cur =  '';
        for (const part of parts) {
            cur = cur ? cur + '/' + part : part;
            if (!this.app.vault.getAbstractFileByPath(cur)) {
                await this.app.vault.createFolder(cur).catch(() => { /* exists / race */ });
            }
        }
    }

    private async uniquePath(path: string): Promise<string> {
        if (!this.app.vault.getAbstractFileByPath(path)) return path;
        const dot = path.lastIndexOf('.');
        const stem = path.slice(0, dot);
        const ext = path.slice(dot);
         let i = 1;
        let cand = `${stem} ${i}${ext}`;
        while (this.app.vault.getAbstractFileByPath(cand)) { i++; cand = `${stem} ${i}${ext}`; }
        return cand;
    }
}
/* ════════════════════════════════════════════════════════════════════════════
PDF PICKER MODAL
═══════════════════════════════════════════════════════════════════════════ */
class PdfPickerModal extends FuzzySuggestModal<TFile> {
    constructor(
        app: App,
        private pdfs: TFile[],
        private onChoose: (file: TFile) => void,
    ) {
        super(app);
        this.setPlaceholder(t('pdf.pickerPlaceholder'));
    }
    getItems(): TFile[] { return this.pdfs; }
    getItemText(item: TFile): string { return item.path; }
    onChooseItem(item: TFile): void { this.onChoose(item); }
}
/* ════════════════════════════════════════════════════════════════════════════
UNPROCESSED PDFs MODAL  (grouped list + filters + rebuild selected)
PDFs are shown in two groups:
• "No card"        — the card note does not exist at all.
• "Empty section"  — the card exists but its outline section is empty.
Each group can be selected / deselected independently.
During batch processing, PDFs without embedded outlines trigger a Notice.
═══════════════════════════════════════════════════════════════════════════ */
class UnprocessedPdfsModal extends Modal {
    private selected: Set<number> = new Set();
    private listEl!: HTMLElement;
    private countEl!: HTMLElement;
    private filterMode: 'all' | 'no_card' | 'empty_section' = 'all';
    constructor(
        app: App,
        private feature: PdfOutlineFeature,
        private pdfInfos: UnprocessedPdfInfo[],
    ) {
        super(app);
        // All items selected by default.
        pdfInfos.forEach((_, i) => this.selected.add(i));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('pdf-outline-unprocessed-modal');

        // ── Title & description ──────────────────────────────────────────
        contentEl.createEl('h2', { text: t('pdf.unprocessed.title') });

        const noCard = this.pdfInfos.filter(i => i.status === 'no_card').length;
        const empty = this.pdfInfos.filter(i => i.status === 'empty_section').length;

        const descText = t('pdf.unprocessed.desc')
            .replace('{{total}}', String(this.pdfInfos.length))
            .replace('{{noCard}}', String(noCard))
            .replace('{{empty}}', String(empty));
        contentEl.createEl('p', { cls: 'setting-item-description', text: descText });

        // ── Filter tabs ────────────────────────────────────────────────────
        const filterBar = contentEl.createDiv({ cls: 'pdfo-filter-bar' });
        const filters: { key: typeof this.filterMode; label: string; count: number }[] = [
            { key: 'all',            label: t('pdf.unprocessed.filterAll'),    count: this.pdfInfos.length },
            { key: 'no_card',        label: t('pdf.unprocessed.filterNoCard'), count: noCard },
            { key: 'empty_section',  label: t('pdf.unprocessed.filterEmpty'), count: empty },
        ];
        for (const f of filters) {
            const btn = filterBar.createEl('button', {
                text: `${f.label} (${f.count})`,
                cls: f.key === this.filterMode ? 'pdfo-filter-active' : '',
            });
            btn.addEventListener('click', () => {
                this.filterMode = f.key;
                filterBar.querySelectorAll('.pdfo-filter-active')
                    .forEach(el => el.removeClass('pdfo-filter-active'));
                btn.addClass('pdfo-filter-active');
                this.renderList();
            });
        }

        // ── Select-all header ──────────────────────────────────────────────
        const header = contentEl.createDiv({ cls: 'pdfo-header' });
        const selAll = header.createEl('input', { type: 'checkbox' });
        selAll.checked = true;
        selAll.addEventListener('change', () => {
            this.selected.clear();
            if (selAll.checked) this.pdfInfos.forEach((_, i) => this.selected.add(i));
            this.renderList();
        });
        header.createEl('span', { text: t('pdf.unprocessed.selectAll') });
        this.countEl = header.createEl('span', { cls: 'pdfo-count' });

        // ── Quick-select group buttons ───────────────────────────────────
        const groupActions = contentEl.createDiv({ cls: 'pdfo-group-actions' });
        if (noCard > 0) {
            const selNoCard = groupActions.createEl('button', {
                text: t('pdf.unprocessed.selectNoCard'),
                cls: 'pdfo-group-btn',
            });
            selNoCard.addEventListener('click', () => {
                this.selected.clear();
                this.pdfInfos.forEach((info, i) => {
                    if (info.status === 'no_card') this.selected.add(i);
                });
                this.renderList();
            });
        }
        if (empty > 0) {
            const selEmpty = groupActions.createEl('button', {
                text: t('pdf.unprocessed.selectEmpty'),
                cls: 'pdfo-group-btn',
            });
            selEmpty.addEventListener('click', () => {
                this.selected.clear();
                this.pdfInfos.forEach((info, i) => {
                    if (info.status === 'empty_section') this.selected.add(i);
                });
                this.renderList();
            });
        }

        // ── PDF list ────────────────────────────────────────────────────────
        this.listEl = contentEl.createDiv({ cls: 'pdfo-list' });
        this.renderList();

        // ── Bottom actions ─────────────────────────────────────────────────
        const actions = contentEl.createDiv({ cls: 'pdfo-actions' });
        const cancelBtn = actions.createEl('button', { text: t('pdf.unprocessed.cancel') });
        cancelBtn.addEventListener('click', () => this.close());
        const rebuildBtn = actions.createEl('button', {
            text: t('pdf.unprocessed.rebuildSelected'),
            cls: 'mod-cta',
        });
        rebuildBtn.addEventListener('click', () => {
            const selectedInfos = [...this.selected]
                .map(i => this.pdfInfos[i])
                .filter(Boolean);
            if (!selectedInfos.length) {
                new Notice(t('pdf.unprocessed.nothingSelected'));
                return;
            }
             this.close();
            void this.feature.processBatch(selectedInfos.map(info => info.pdf));
        });
    }

    /* ── List rendering ───────────────────────────────────────────────────*/

    private renderList() {
        // Запоминаем позицию скролла, чтобы список не прыгал наверх
        const scrollPos = this.listEl ? this.listEl.scrollTop : 0;
        
        this.listEl.empty();

        const filtered = this.pdfInfos
            .map((info, i) => ({ info, i }))
            .filter(({ info }) =>
                this.filterMode === 'all' || info.status === this.filterMode);

        if (!filtered.length) {
            this.listEl.createDiv({
                text: t('pdf.unprocessed.noResultsInFilter'),
                cls: 'pdfo-empty',
            });
            this.updateCount();
            return;
        }

        // ИСПРАВЛЕНИЕ: Используем Map для правильной группировки всех файлов по статусу
        const groupsMap = new Map<UnprocessedStatus, { info: UnprocessedPdfInfo; i: number }[]>();
        for (const { info, i } of filtered) {
            if (!groupsMap.has(info.status)) {
                groupsMap.set(info.status, []);
            }
            groupsMap.get(info.status)!.push({ info, i });
        }

        // Преобразуем Map в массив групп для рендеринга
        const groups = Array.from(groupsMap.entries()).map(([status, items]) => ({
            status,
            items,
        }));

        for (const group of groups) {
            // ── Group header ─────────────────────────────────────────
            const groupHeader = this.listEl.createDiv({ cls: 'pdfo-group-header' });
            const groupCb = groupHeader.createEl('input', { type: 'checkbox' });
            
            // Считаем сколько элементов в группе выбрано
            const selectedInGroup = group.items.filter(({ i }) => this.selected.has(i)).length;
            const allSelected = selectedInGroup === group.items.length;
            const someSelected = selectedInGroup > 0;

            // ИСПРАВЛЕНИЕ: Native indeterminate state (квадратик при частичном выборе)
            groupCb.checked = allSelected;
            groupCb.indeterminate = someSelected && !allSelected;

            groupCb.addEventListener('change', () => {
                for (const { i } of group.items) {
                    if (groupCb.checked) this.selected.add(i);
                    else this.selected.delete(i);
                }
                this.updateCount();
                this.renderList();
                this.listEl.scrollTop = scrollPos;
            });

            const statusLabel = group.status === 'no_card'
                ? t('pdf.unprocessed.noCardLabel')
                : t('pdf.unprocessed.emptySectionLabel');
            groupHeader.createEl('span', {
                text: `${statusLabel} (${group.items.length})`,
                cls: 'pdfo-group-label',
            });

            // ── Items in this group ──────────────────────────────────
            for (const { info, i } of group.items) {
                const row = this.listEl.createDiv({ cls: 'pdfo-item' });
                const cb = row.createEl('input', { type: 'checkbox', cls: 'pdfo-cb' });
                cb.checked = this.selected.has(i);
                
                cb.addEventListener('change', () => {
                    if (cb.checked) this.selected.add(i);
                    else this.selected.delete(i);
                    this.updateCount();
                    this.renderList();
                    this.listEl.scrollTop = scrollPos;
                });

                const infoDiv = row.createDiv({ cls: 'pdfo-info' });
                infoDiv.createEl('div', { text: info.pdf.basename, cls: 'pdfo-name' });
                infoDiv.createEl('div', {
                    text: info.pdf.parent?.path || '/',
                    cls: 'pdfo-path',
                });
                
                const badgeCls = info.status === 'no_card'
                     ? 'pdfo-status-no_card'
                    : 'pdfo-status-empty_section';
                const badgeText = info.status === 'no_card'
                    ? t('pdf.unprocessed.noCardBadge')
                    : t('pdf.unprocessed.emptySectionBadge');
                row.createDiv({ cls: `pdfo-status-badge ${badgeCls}`, text: badgeText });
            }
        }
        
        this.updateCount();
        
        // Восстанавливаем скролл через requestAnimationFrame на случай длинного рендера
        window.requestAnimationFrame(() => {
            if (this.listEl) this.listEl.scrollTop = scrollPos;
        });
    }

    private updateCount() {
        this.countEl.textContent =
            `${this.selected.size} / ${this.pdfInfos.length} ${t('pdf.unprocessed.selected')}`;
    }

    onClose() { this.contentEl.empty(); }
}
/* ════════════════════════════════════════════════════════════════════════════
SETTINGS UI  (called from the host plugin's settings tab)
Now accepts a `t` translation function for i18n.
═══════════════════════════════════════════════════════════════════════════ */
export function renderPdfOutlineSettings(
    el: HTMLElement,
    s: PdfOutlineSettings,
    save: () => Promise<void> | void,
) {
    el.createEl('h3', { text: t('pdf.title') });
    el.createDiv({ text: t('pdf.cardIndexDesc'), cls: 'setting-item-description' });
    // ── "How it works" callout ───────────────────────────────────────────────
    const guide = el.createDiv({ cls: 'pdfo-guide setting-item-description' });
    guide.createDiv({ text: t('pdf.quickStartTitle'), cls: 'pdfo-guide-title' });
    ['pdf.quickStartStep1', 'pdf.quickStartStep2', 'pdf.quickStartStep3', 'pdf.quickStartStep4']
        .forEach(k => guide.createDiv({ text: t(k), cls: 'pdfo-guide-step' }));

    // ── Step 1 · Folders ──────────────────────────────────────────────────────
    el.createDiv({ text: t('pdf.sectionFolders'), cls: 'setting-item-heading' });

    new Setting(el)
        .setName(t('pdf.pdfFolder'))
        .setDesc(t('pdf.pdfFolderDesc'))
        .addText(c => c.setPlaceholder('PDF').setValue(s.pdfFolder).onChange(async v => { s.pdfFolder = v.trim(); await save(); }));

    new Setting(el)
        .setName(t('pdf.indexFolder'))
        .setDesc(t('pdf.indexFolderDesc'))
        .addText(c => c.setPlaceholder('Index').setValue(s.indexFolder).onChange(async v => { s.indexFolder = v.trim(); await save(); }));

    // ── Step 2 · How cards are linked & named ────────────────────────────────
    el.createDiv({ text: t('pdf.sectionCards'), cls: 'setting-item-heading' });

    new Setting(el)
        .setName(t('pdf.pdfLinkProperty'))
        .setDesc(t('pdf.pdfLinkPropertyDesc'))
        .addText(c => c.setPlaceholder('pdf').setValue(s.pdfLinkProperty).onChange(async v => { s.pdfLinkProperty = v.trim() || 'pdf'; await save(); }));

    new Setting(el)
        .setName(t('pdf.cardNameTemplate'))
        .setDesc(t('pdf.cardNameTemplateDesc'))
        .addText(c => c.setPlaceholder('{{pdf_name}}').setValue(s.cardNameTemplate)
            .onChange(async v => { s.cardNameTemplate = v; await save(); }));

    new Setting(el)
        .setName(t('pdf.cardNamePrefixStrip'))
        .setDesc(t('pdf.cardNamePrefixStripDesc'))
        .addText(c => c.setValue(s.cardNamePrefixStrip).onChange(async v => { s.cardNamePrefixStrip = v; await save(); }));

    new Setting(el)
        .setName(t('pdf.templatePath'))
        .setDesc(t('pdf.templatePathDesc'))
        .addText(c => c.setValue(s.templatePath).onChange(async v => { s.templatePath = v.trim(); await save(); }));

    // Collapsible placeholder reference.
    renderPlaceholderReference(el, t);

    // ── Step 3 · Where the outline is written ───────────────────────────────
    el.createDiv({ text: t('pdf.sectionOutput'), cls: 'setting-item-heading' });

    new Setting(el)
        .setName(t('pdf.targetHeading'))
        .setDesc(t('pdf.targetHeadingDesc'))
        .addText(c => c.setPlaceholder('Contents').setValue(s.targetHeading).onChange(async v => { s.targetHeading = v; await save(); }));

    new Setting(el)
        .setName(t('pdf.defaultTargetHeadingLevel'))
        .setDesc(t('pdf.defaultTargetHeadingLevelDesc'))
        .addSlider(sl => sl.setLimits(1, 6, 1).setValue(s.defaultTargetHeadingLevel)
            .onChange(async v => { s.defaultTargetHeadingLevel = v; await save(); }));

    // ── Step 4 · Automation ──────────────────────────────────────────────────
    el.createDiv({ text: t('pdf.sectionAutomation'), cls: 'setting-item-heading' });

    new Setting(el)
        .setName(t('pdf.autoCreateOnAdd'))
        .setDesc(t('pdf.autoCreateOnAddDesc'))
        .addToggle(c => c.setValue(s.autoCreateOnAdd).onChange(async v => { s.autoCreateOnAdd = v; await save(); }));
    el.createDiv({ text: t('pdf.autoCreateOnAddWarn'), cls: 'setting-item-description pdfo-warn' });

    // ── Formatting: headings & lists ──────────────────────────────────────────
    el.createDiv({ text: t('pdf.headingsAndLists'), cls: 'setting-item-heading' });

    new Setting(el)
        .setName(t('pdf.baseHeadingLevel'))
        .setDesc(t('pdf.baseHeadingLevelDesc'))
        .addSlider(sl => sl.setLimits(0, 6, 1).setValue(s.baseHeadingLevel)
            .onChange(async v => { s.baseHeadingLevel = v; await save(); }));

    let listIndentSetting: Setting;

    new Setting(el)
        .setName(t('pdf.overflowAsList'))
        .setDesc(t('pdf.overflowAsListDesc'))
         .addToggle(c => c.setValue(s.overflowAsList).onChange(async v => {
            s.overflowAsList = v;
            await save();
            listIndentSetting.settingEl.style.display = v ? '' : 'none';
        }));

    listIndentSetting = new Setting(el)
        .setName(t('pdf.listIndentUnit'))
        .setDesc(t('pdf.listIndentUnitDesc'))
        .addDropdown(d => d
            .addOption('    ', t('pdf.indent4spaces'))
            .addOption('  ', t('pdf.indent2spaces'))
            .addOption('\t', t('pdf.indentTab'))
            .setValue(s.listIndentUnit === '\t' ? '\t' : (s.listIndentUnit === '  ' ? '  ' : '    '))
            .onChange(async v => { s.listIndentUnit = v; await save(); }));
    listIndentSetting.settingEl.style.display = s.overflowAsList ? '' : 'none';

    new Setting(el)
        .setName(t('pdf.includeLinklessHeadings'))
        .setDesc(t('pdf.includeLinklessHeadingsDesc'))
        .addToggle(c => c.setValue(s.includeLinklessHeadings).onChange(async v => { s.includeLinklessHeadings = v; await save(); }));

    // ── Formatting: page numbers & link text ─────────────────────────────────
    el.createDiv({ text: t('pdf.pageNumbersAndLinks'), cls: 'setting-item-heading' });

    let pageOffsetSetting: Setting;

    new Setting(el)
         .setName(t('pdf.usePageLabels'))
        .setDesc(t('pdf.usePageLabelsDesc'))
        .addToggle(c => c.setValue(s.usePageLabels).onChange(async v => {
            s.usePageLabels = v;
            await save();
            // The offset is only consulted when labels are NOT used.
            pageOffsetSetting.settingEl.style.display = v ? 'none' : '';
        }));

    pageOffsetSetting = new Setting(el)
        .setName(t('pdf.pageOffset'))
        .setDesc(t('pdf.pageOffsetDesc'))
        .addText(c => c.setValue(String(s.pageOffset)).onChange(async v => {
            const n = parseInt(v, 10); s.pageOffset = isNaN(n) ? 0 : n; await save();
        }));
    pageOffsetSetting.settingEl.style.display = s.usePageLabels ? 'none' : '';

    new Setting(el)
        .setName(t('pdf.displayTemplate'))
        .setDesc(t('pdf.displayTemplateDesc'))
        .addText(c => c.setPlaceholder('p.{{pageLabel}}').setValue(s.displayTemplate)
            .onChange(async v => { s.displayTemplate = v || 'p.{{pageLabel}}'; await save(); }));
    el.createDiv({ text: t('pdf.displayTemplateHint'), cls: 'setting-item-description' });

    new Setting(el)
        .setName(t('pdf.manualInsertOutput'))
        .setDesc(t('pdf.manualInsertOutputDesc'))
        .addDropdown(d => d
            .addOption('cursor', t('pdf.outputCursor'))
            .addOption('clipboard', t('pdf.outputClipboard'))
            .setValue(s.output)
            .onChange(async v => { s.output = v as 'cursor' | 'clipboard'; await save(); }));
}
/* Collapsible placeholder reference table (shared by the templates above). */
function renderPlaceholderReference(el: HTMLElement, t: (key: string) => string) {
    const details = el.createEl('details', { cls: 'pdfo-ph-ref' });
    details.createEl('summary', { text: t('pdf.placeholderRef') });
    details.createDiv({ text: t('pdf.placeholderRefIntro'), cls: 'setting-item-description' });
    const table = details.createEl('table', { cls: 'pdfo-ph-table' });
    const rows: [string, string][] = [
        ['{{page}}',          t('pdf.phPage')],
        ['{{pageLabel}}',     t('pdf.phPageLabel')],
        ['{{file.name}}',     t('pdf.phFileName')],
        ['{{file.basename}}', t('pdf.phFileBasename')],
        ['{{file.path}}',     t('pdf.phFilePath')],
        ['{{date}}',          t('pdf.phDate')],
        ['{{pageCount}}',     t('pdf.phPageCount')],
    ];
    for (const [token, desc] of rows) {
        const tr = table.createEl('tr');
        tr.createEl('td', { text: token, cls: 'pdfo-ph-token' });
        tr.createEl('td', { text: desc });
    }
}
