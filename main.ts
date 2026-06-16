import {
    App,
    CachedMetadata,
    Component,
    debounce,
    HeadingCache,
    ItemView,
    MarkdownPostProcessorContext,
    MarkdownRenderChild,
    MarkdownRenderer,
    MarkdownView,
    Plugin,
    setIcon,
    TFile,
    WorkspaceLeaf,
} from 'obsidian';
import { EditorView, showPanel, Panel } from '@codemirror/view';
import { StateField, StateEffect, EditorState } from '@codemirror/state';
// NOTE: @codemirror/view and @codemirror/state should be listed as dependencies
// in package.json: `npm i -S @codemirror/view @codemirror/state`
import {
    PdfOutlineFeature,
    DEFAULT_PDF_OUTLINE_SETTINGS,
} from './pdf-outline';
import { t, setLanguage } from './i18n';
import {
    LibrarySearchSettings,
    DEFAULT_SETTINGS,
    DisplaySettings,
    BehaviorSettings,
    GroupRule,
    SearchTargets,
    LibrarySearchSettingTab,
} from './settings';

const VIEW_TYPE = 'library-search-view';
const HOVER_SOURCE = 'library-search';

/* ═══════════════════════════════════════════════════════════════════════════
MATCH / RESULT TYPES
═══════════════════════════════════════════════════════════════════════════ */

type MatchKind =
    | 'heading'        // §  heading text
    | 'callout-title'  // ❯  callout > [!type]- Title
    | 'callout-body'   // ❯  inside callout body
    | 'frontmatter'    // ⊟  frontmatter field value
    | 'body'           // ¶  plain note body
    | 'filename';      // 📄 file basename

interface Match {
    kind:            MatchKind;
    /** Primary display text (heading text, callout title, fm value, …) */
    label:           string;
    /** For frontmatter: which field name matched */
    fieldName?:      string;
    /** Short surrounding context for body / callout-body / frontmatter matches */
    snippet?:        string;
    /** Text below a matched heading (only when mode != heading-only) */
    sectionContent?: string;
}

interface SearchResult {
    noteName: string;
    filePath: string;
    matches:  Match[];
    tags:     string[];
    groupName: string;
}

/** Split the "extra terms" box into individual filter tokens: comma- or
 *  whitespace-separated, case-folded per the user's case-sensitivity setting. */
function filterTokens(raw: string, caseSensitive: boolean): string[] {
    return raw
        .split(/[,\s]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => caseSensitive ? s : s.toLowerCase());
}

/** Flatten everything a result shows on screen into one haystack, so the
 *  quick filter checks the same text the user is looking at. */
function resultHaystack(r: SearchResult): string {
    const parts: string[] = [r.noteName, r.filePath, r.groupName, ...r.tags];
    for (const m of r.matches) {
        parts.push(m.label);
        if (m.fieldName)      parts.push(m.fieldName);
        if (m.snippet)        parts.push(m.snippet);
        if (m.sectionContent) parts.push(m.sectionContent);
    }
    return parts.join('\n');
}

/** True if every token is found somewhere in the result (AND, not OR). */
function resultMatchesTokens(r: SearchResult, tokens: string[], caseSensitive: boolean): boolean {
    if (tokens.length === 0) return true;
    const hay = caseSensitive ? resultHaystack(r) : resultHaystack(r).toLowerCase();
    return tokens.every(tok => hay.includes(tok));
}

/* ═══════════════════════════════════════════════════════════════════════════
PURE HELPERS
═══════════════════════════════════════════════════════════════════════════ */

/** Build two RegExp objects — one for .test() (no /g), one for exec-loops (/g). */
function buildPatterns(terms: string[], b: BehaviorSettings) {
    const escaped = terms.map(t => t.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    const patterns = b.wholeWord ? escaped.map(t => `\\b${t}\\b`) : escaped;
    const src   = patterns.join('|');
    const flags = b.caseSensitive ? '' : 'i';
    return {
        tester: new RegExp(src, flags),
        looper: new RegExp(src, 'g' + flags),
    };
}

/**
 * Extract text under a heading using Obsidian's AST (MetadataCache).
 * This avoids false positives inside code blocks and is O(1) per heading
 * once the cache is available.
 */
function extractSectionContentAST(
    content: string,
    cache: CachedMetadata,
    heading: HeadingCache,
    maxLines: number,
    maxChars: number,
): string {
    const startOffset = heading.position.end.offset;

    // Find the next heading of equal or higher rank (lower level number)
    const nextHeading = cache.headings?.find(h =>
        h.position.start.offset > startOffset &&
        h.level <= heading.level
    );

    const endOffset = nextHeading ? nextHeading.position.start.offset : content.length;
    let sectionText = content.slice(startOffset, endOffset).trim();

    if (maxLines > 0) {
        const lines = sectionText.split('\n');
        sectionText = lines.slice(0, maxLines).join('\n').trim();
    }
    if (maxChars > 0 && sectionText.length > maxChars) {
        sectionText = sectionText.slice(0, maxChars).trimEnd() + ' …';
    }
    return sectionText;
}

/** Short snippet of text centred on a regex match position. */
function extractSnippet(text: string, matchIndex: number, contextChars: number): string {
    const s   = Math.max(0, matchIndex - contextChars);
    const e   = Math.min(text.length, matchIndex + contextChars);
    let frag  = text.slice(s, e).replace(/\n/g, ' ');
    if (s > 0)           frag = '…' + frag;
    if (e < text.length) frag = frag + '…';
    return frag;
}

/** Navigate to a vault file in the current non-pinned leaf. */
function openFile(app: App, filePath: string) {
    const f = app.vault.getAbstractFileByPath(filePath);
    if (f instanceof TFile) void app.workspace.getLeaf(false).openFile(f);
}

/** Safely access the CM6 EditorView from a MarkdownView. */
function getCmView(view: MarkdownView): EditorView | null {
    return (view.editor as unknown as { cm?: EditorView })?.cm ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════════
INLINE NOTE PANEL  (CM6 docked panel + reading-mode banner)
"Virtual" UI attached to the top/bottom of a note. Never written to disk.
═══════════════════════════════════════════════════════════════════════════ */

/** Payload pushed into a per-editor CM6 state field by the plugin. */
interface PanelPayload {
    /** File the panel should describe, or null to hide the panel. */
    filePath: string | null;
    /** Render signature; the panel re-renders only when this changes. */
    sig: string;
}

const setPanelPayload = StateEffect.define<PanelPayload>();

/** Build the CM6 StateField that drives the docked panel for one editor. */
function buildPanelField(plugin: LibrarySearchPlugin): StateField<PanelPayload> {
    const topCtor    = (view: EditorView) => createDockedPanel(view, plugin, true);
    const bottomCtor = (view: EditorView) => createDockedPanel(view, plugin, false);

    return StateField.define<PanelPayload>({
        create: () => ({ filePath: null, sig: '' }),
        update(value, tr) {
            for (const e of tr.effects) if (e.is(setPanelPayload)) value = e.value;
            return value;
        },
        provide: f => showPanel.from(f, payload => {
            if (!payload.filePath) return null;
            return plugin.settings.panel.position === 'top' ? topCtor : bottomCtor;
        }),
    });
}

/**
 * A Component per panel container, so MarkdownRenderer children created for the
 * results are released on the next render / when the panel goes away.
 */
const panelComponents = new WeakMap<HTMLElement, Component>();

function unloadPanelComponent(container: HTMLElement) {
    const c = panelComponents.get(container);
    if (c) { c.unload(); panelComponents.delete(container); }
}

function createDockedPanel(view: EditorView, plugin: LibrarySearchPlugin, atTop: boolean): Panel {
    const dom = activeDocument.createElement('div');
    dom.className = 'lsv-cm-panel';
    let lastSig = '';

    const sync = (state: EditorState) => {
        const payload = state.field(plugin.panelField);
        if (payload.sig === lastSig) return;
        lastSig = payload.sig;
        void renderPanelContents(dom, plugin, payload.filePath);
    };

    sync(view.state);
    return {
        dom,
        top: atTop,
        update(u) { sync(u.state); },
        destroy() { unloadPanelComponent(dom); },
    };
}

/**
 * Render the full panel UI (header + aliases + extra-term input + results) into
 * `container`. Shared by the CM6 docked panel and the reading-mode banner.
 */
async function renderPanelContents(
    container: HTMLElement,
    plugin: LibrarySearchPlugin,
    filePath: string | null,
    force = false,
): Promise<void> {
    if (!filePath) { container.empty(); unloadPanelComponent(container); return; }

    const pinned = container.dataset.pinned === '1';
    if (!force && pinned && container.dataset.builtFor) return;

    container.empty();
    unloadPanelComponent(container);
    container.dataset.builtFor = filePath;

    const file = plugin.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return;

    if (container.dataset.collapsed === undefined) {
        container.dataset.collapsed = plugin.settings.panel.collapsedByDefault ? '1' : '0';
    }
    const collapsed = container.dataset.collapsed === '1';
    const searchOpen = container.dataset.searchOpen === '1';

    // ── Header bar ──────────────────────────────────────────────────────────
    const header = container.createDiv('lsv-panel-header');
    const titleIcon = header.createSpan({ cls: 'lsv-panel-title-icon' });
    setIcon(titleIcon, 'book-open');
    header.createSpan({ text: plugin.settings.panel.title, cls: 'lsv-panel-title' });
    const countEl = header.createSpan({ cls: 'lsv-panel-count' });

    const searchToggle = header.createSpan({ cls: 'lsv-panel-btn', title: t('ui.searchTerms') });
    setIcon(searchToggle, 'sliders-horizontal');
    searchToggle.toggleClass('is-active', searchOpen);
    searchToggle.onclick = (e) => {
        e.stopPropagation();
        const open = container.dataset.searchOpen !== '1';
        container.dataset.searchOpen = open ? '1' : '0';
        if (container.dataset.collapsed === '1') {
            container.dataset.collapsed = '0';
            void renderPanelContents(container, plugin, filePath, true);
            return;
        }
        container.querySelector('.lsv-search-ctrl')?.toggleClass('is-open', open);
        searchToggle.toggleClass('is-active', open);
    };

    const pinBtn = header.createSpan({ cls: 'lsv-panel-btn', title: pinned ? t('ui.unpin') : t('ui.pin') });
    setIcon(pinBtn, pinned ? 'pin-off' : 'pin');
    pinBtn.toggleClass('is-active', pinned);
    pinBtn.onclick = (e) => {
        e.stopPropagation();
        const nowPinned = container.dataset.pinned !== '1';
        container.dataset.pinned = nowPinned ? '1' : '0';
        setIcon(pinBtn, nowPinned ? 'pin-off' : 'pin');
        pinBtn.toggleClass('is-active', nowPinned);
        pinBtn.setAttribute('title', nowPinned ? t('ui.unpin') : t('ui.pin'));
        if (!nowPinned) plugin.refreshPanels(true);
    };

    const collapseBtn = header.createSpan({ cls: 'lsv-panel-collapse' });
    setIcon(collapseBtn, collapsed ? 'chevron-right' : 'chevron-down');

    // ── Body — always built; collapse just hides it via CSS class ────────────
    const body = container.createDiv('lsv-panel-body');
    if (collapsed) body.addClass('lsv-collapsed');
    header.onclick = () => {
        const nowCollapsed = container.dataset.collapsed !== '1';
        container.dataset.collapsed = nowCollapsed ? '1' : '0';
        setIcon(collapseBtn, nowCollapsed ? 'chevron-right' : 'chevron-down');
        body.toggleClass('lsv-collapsed', nowCollapsed);
    };
    const aliases = plugin.getSearchTerms(file);

    const searchCtrl = body.createDiv({ cls: 'lsv-search-ctrl' + (searchOpen ? ' is-open' : '') });
    const aliasRow = searchCtrl.createDiv('lsv-panel-aliases');
    aliasRow.createSpan({ text: t('ui.aliases'), cls: 'lsv-label' });
    if (aliases.length === 0) {
        aliasRow.createSpan({ text: t('ui.none'), cls: 'lsv-muted' });
    } else {
        aliases.forEach(a => aliasRow.createSpan({ text: a, cls: 'lsv-tag lsv-tag--alias' }));
    }

    const row   = searchCtrl.createDiv('lsv-extra-row');
    const input = row.createEl('input', { type: 'text', cls: 'lsv-input' });
    input.placeholder = t('ui.extraTerms');
    input.value = container.dataset.extra ?? '';
    const btn = row.createEl('button', { text: t('ui.search'), cls: 'lsv-btn' });

    const resultsWrap = body.createDiv('lsv-results');

    /** (Re)render `results`, replacing whatever is currently shown. Each call
     *  needs a fresh Component so renderResults' delegated listeners aren't
     *  layered on top of stale ones. */
    const showResults = (results: SearchResult[]) => {
        resultsWrap.empty();
        unloadPanelComponent(container);
        const comp = new Component();
        comp.load();
        panelComponents.set(container, comp);
        countEl.setText(results.length ? `${results.length}` : '');
        renderResults(resultsWrap, results, plugin.settings.display, plugin.settings.groups, plugin.app, comp);
    };

    /** Results from the alias-based search — fetched once. The extra-terms
     *  box below narrows this set client-side; it never re-queries the vault. */
    let baseResults: SearchResult[] = [];

    /** Apply the extra-terms box as an AND filter over `baseResults`. */
    const applyFilter = () => {
        const tokens = filterTokens(input.value, plugin.settings.behavior.caseSensitive);
        showResults(baseResults.filter(r => resultMatchesTokens(r, tokens, plugin.settings.behavior.caseSensitive)));
    };
    const applyFilterDebounced = debounce(applyFilter, 120, true);

    if (aliases.length === 0) {
        resultsWrap.createDiv({ text: t('ui.noAliases'), cls: 'lsv-muted' });
        countEl.setText('');
    } else {
        const load = resultsWrap.createDiv({ text: t('ui.searching'), cls: 'lsv-loading' });
        baseResults = await plugin.searchLibrary(aliases);
        load.remove();
        applyFilter();
    }

    // Typing filters the results already on screen — no new vault search.
    input.addEventListener('input', () => {
        container.dataset.extra = input.value;
        applyFilterDebounced();
    });
    // Enter / button: flush the debounce and apply immediately.
    input.onkeydown = e => { if (e.key === 'Enter') { applyFilterDebounced.cancel(); applyFilter(); } };
    btn.onclick = () => { applyFilterDebounced.cancel(); applyFilter(); };
}

/* ═══════════════════════════════════════════════════════════════════════════
PLUGIN
═══════════════════════════════════════════════════════════════════════════ */

export default class LibrarySearchPlugin extends Plugin {
    settings: LibrarySearchSettings;
    panelField: StateField<PanelPayload>;
    private readingBanners = new Map<MarkdownView, HTMLElement>();
    private viewSig = new Map<MarkdownView, string>();
    private refreshTimer: number | null = null;
    private retryTimer: number | null = null;
    private retryViews = new Set<MarkdownView>();
    private retryCount = new Map<MarkdownView, number>();
    pdfOutline!: PdfOutlineFeature;

    async onload() {
        await this.loadSettings();
        setLanguage(this.settings.language);

        this.registerView(VIEW_TYPE, leaf => new LibrarySearchView(leaf, this));

        this.registerMarkdownCodeBlockProcessor('library-search', (source, el, ctx) => {
            ctx.addChild(new LibrarySearchBlock(el, ctx, source, this));
        });

        this.panelField = buildPanelField(this);
        this.registerEditorExtension([this.panelField]);

        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleRefresh()));
        this.registerEvent(this.app.workspace.on('file-open',          () => this.scheduleRefresh()));
        this.registerEvent(this.app.workspace.on('layout-change',      () => this.scheduleRefresh()));
        this.registerEvent(this.app.metadataCache.on('changed',        (file) => { if (this.isPanelScope(file.path)) this.scheduleRefresh(); }));

        this.addCommand({
            id: 'open-panel',
            name: 'Open search panel',
            callback: () => this.activateView(),
        });

        this.addCommand({
            id: 'toggle-inline-panel',
            name: 'Toggle inline note panel',
            callback: () => {
                this.settings.panel.enabled = !this.settings.panel.enabled;
                void this.saveSettings();
                this.refreshPanels(true);
            },
        });

        try {
            this.pdfOutline = new PdfOutlineFeature(this, () => this.settings.pdfOutline);
            this.pdfOutline.onload();
        } catch (e) {
            console.error('[Library Search] PDF outline module failed to initialise:', e);
        }

        this.addRibbonIcon('book-open', t('ui.librarySearch'), () => this.activateView());
        this.addSettingTab(new LibrarySearchSettingTab(this.app, this));

        this.registerHoverLinkSource(HOVER_SOURCE, {
            display: t('ui.librarySearch'),
            defaultMod: true,
        });

        this.app.workspace.onLayoutReady(() => this.refreshPanels(true));
    }

    onunload() {
        for (const v of [...this.readingBanners.keys()]) this.removeReadingBanner(v);
        this.viewSig.clear();
        this.retryViews.clear();
        if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
        if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    }

    private scheduleRefresh() {
        if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = null;
            this.refreshPanels();
        }, 150);
    }

    private scheduleRetry() {
        if (this.retryViews.size === 0) return;
        if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            const toRetry = [...this.retryViews];
            this.retryViews.clear();
            for (const view of toRetry) {
                this.viewSig.delete(view);
                this.retryCount.delete(view);
            }
            this.refreshPanels();
        }, 300);
    }

    refreshPanels(force = false) {
        const { panel } = this.settings;
        if (force) this.viewSig.clear();
        const seen = new Set<MarkdownView>();

        for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) continue;
            seen.add(view);

            const cmEarly = getCmView(view);
            const dockedEl = cmEarly?.dom.querySelector('.lsv-cm-panel') as HTMLElement | null;
            const bannerEl = this.readingBanners.get(view) ?? null;
            if (panel.enabled && (dockedEl?.dataset.pinned === '1' || bannerEl?.dataset.pinned === '1')) continue;

            const file    = view.file;
            const inScope = panel.enabled && !!file && this.isPanelScope(file.path);
            const mode    = view.getMode();

            const aliases = inScope && file ? this.getSearchTerms(file).join('\u0001') : '';
            const sig = inScope && file ? `${mode}|${file.path}|${aliases}|${panel.position}` : 'hidden';

            if (this.viewSig.get(view) === sig) continue;
            this.viewSig.set(view, sig);

            const shouldHaveEditorPanel = inScope && mode !== 'preview' && file;
            const cm = getCmView(view);
            if (cm) {
                cm.dispatch({
                    effects: setPanelPayload.of({
                        filePath: shouldHaveEditorPanel ? file.path : null,
                        sig,
                    }),
                });
            } else if (shouldHaveEditorPanel) {
                const attempts = (this.retryCount.get(view) ?? 0) + 1;
                if (attempts <= 5) {
                    this.retryCount.set(view, attempts);
                    this.viewSig.delete(view);
                    this.retryViews.add(view);
                    this.scheduleRetry();
                }
            }

            if (inScope && panel.readingMode && mode === 'preview' && file) {
                this.ensureReadingBanner(view, file.path);
            } else {
                this.removeReadingBanner(view);
            }
        }

        for (const v of [...this.viewSig.keys()]) {
            if (!seen.has(v)) { this.removeReadingBanner(v); this.viewSig.delete(v); this.retryViews.delete(v); this.retryCount.delete(v); }
        }
    }

    private ensureReadingBanner(view: MarkdownView, filePath: string) {
        const host = (view.contentEl.querySelector('.markdown-reading-view') as HTMLElement)
            ?? view.contentEl;
        let el = this.readingBanners.get(view);
        if (!el) {
            el = activeDocument.createElement('div');
            el.className = 'lsv-reading-banner';
            this.readingBanners.set(view, el);
        }
        const atTop = this.settings.panel.position === 'top';
        const placed = atTop ? host.firstChild === el : host.lastChild === el;
        if (el.parentElement !== host || !placed) {
            el.remove();
            if (atTop) { host.prepend(el); } else { host.append(el); }
        }
        void renderPanelContents(el, this, filePath);
    }

    private removeReadingBanner(view: MarkdownView) {
        const el = this.readingBanners.get(view);
        if (el) { unloadPanelComponent(el); el.remove(); this.readingBanners.delete(view); }
    }

    private isPanelScope(path: string): boolean {
        const folders = this.settings.panel.triggerFolders.length
            ? this.settings.panel.triggerFolders
            : [this.effectiveLibraryFolder()];
        return folders.some(f => {
            const folder = f.replace(/\/+$/, '');
            if (!folder) return true;
            return path === folder || path.startsWith(folder + '/');
        });
    }

    async activateView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE);
        if (leaves.length > 0) { workspace.setActiveLeaf(leaves[0], { focus: true }); return; }
        const leaf = workspace.getLeaf('tab');
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
        workspace.setActiveLeaf(leaf, { focus: true });
    }

    getSearchTerms(file: TFile): string[] {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm) return [];
        const cfg = this.settings.terms;

        if (cfg.source === 'property' && cfg.property) {
            const raw: unknown = fm[cfg.property];
            if (raw == null) return [];
            return (Array.isArray(raw) ? raw : [raw]).map(String).map(s => s.trim()).filter(Boolean);
        }

        const raw: unknown = fm['aliases'] ?? fm['alias'] ?? fm['Aliases'] ?? fm['Alias'];
        if (raw == null) return [];
        return (Array.isArray(raw) ? raw : [raw]).map(String).map(s => s.trim()).filter(Boolean);
    }

    async searchLibrary(terms: string[]): Promise<SearchResult[]> {
        if (terms.length === 0) return [];

        const { display, behavior } = this.settings;
        const { tester, looper } = buildPatterns(terms, behavior);
        const cap = behavior.maxMatchesPerFile;
        const results: SearchResult[] = [];

        const libFiles = this.app.vault.getMarkdownFiles().filter(f => this.isInLibrary(f.path));
        let fileIndex = 0;
        for (const file of libFiles) {

            const cache = this.app.metadataCache.getFileCache(file);
            const fm    = cache?.frontmatter;
            if (!fm) continue;

            const group = this.settings.groups.find(g => {
                const raw: unknown = fm[g.property];
                if (raw == null) return false;
                const vals = (Array.isArray(raw) ? raw : [raw]).map(x => String(x).trim());
                if (g.values.length === 0) return vals.some(v => v !== '');
                return vals.some(v => g.values.includes(v));
            });
            if (!group) continue;
            const targets = group.targets;

            let _content: string | null = null;
            let _readFailed = false;
            const getContent = async (): Promise<string | null> => {
                if (_content !== null) return _content;
                if (_readFailed) return null;
                try { _content = await this.app.vault.cachedRead(file); }
                catch { _readFailed = true; return null; }
                return _content;
            };

            const matches: Match[] = [];

            const add = (m: Match): boolean => {
                if (cap > 0 && matches.length >= cap) return false;
                matches.push(m);
                return true;
            };

            // ── Filename ─────────────────────────────────────────────────────
            if (targets.filename) {
                if (tester.test(file.basename)) {
                    add({ kind: 'filename', label: file.basename });
                }
            }

            // ── Frontmatter fields ────────────────────────────────────────────
            if (targets.frontmatterFields.length > 0) {
                for (const field of targets.frontmatterFields) {
                    if (cap > 0 && matches.length >= cap) break;
                    const value = String(fm[field] ?? '');
                    if (!value) continue;
                    if (tester.test(value)) {
                        looper.lastIndex = 0;
                        const m = looper.exec(value);
                        const snippet = display.showBodySnippet && m
                            ? extractSnippet(value, m.index, display.snippetContextChars)
                            : undefined;
                        add({ kind: 'frontmatter', label: value, fieldName: field, snippet });
                    }
                }
            }

            // ── Headings (MetadataCache AST) ──────────────────────────────────
            if (targets.headings) {
                const cachedHeadings = cache?.headings ?? [];
                if (display.headingOutputMode === 'heading-only') {
                    for (const h of cachedHeadings) {
                        if (cap > 0 && matches.length >= cap) break;
                        if (tester.test(h.heading)) add({ kind: 'heading', label: h.heading });
                    }
                } else {
                    const hits = cachedHeadings.filter(h => tester.test(h.heading));
                    if (hits.length) {
                        const text = await getContent();
                        if (text && cache) {
                            const maxL = display.headingOutputMode === 'with-excerpt' ? display.excerptMaxLines : 0;
                            for (const h of hits) {
                                if (cap > 0 && matches.length >= cap) break;
                                add({
                                    kind: 'heading',
                                    label: h.heading,
                                    sectionContent: extractSectionContentAST(text, cache, h, maxL, display.sectionMaxChars),
                                });
                            }
                        }
                    }
                }
            }

            // ── Callouts (AST Sections) ─────────────────────────────────────
            if (targets.calloutTitles || targets.calloutBodies) {
                const calloutSections = (cache?.sections ?? []).filter(s => s.type === 'callout');
                if (calloutSections.length > 0) {
                    const text = await getContent();
                    if (text) {
                        for (const sec of calloutSections) {
                            if (cap > 0 && matches.length >= cap) break;

                            const start = sec.position.start.offset;
                            const end = sec.position.end.offset;
                            const calloutText = text.slice(start, end);

                            const firstNl = calloutText.indexOf('\n');
                            const firstLine = firstNl === -1 ? calloutText : calloutText.slice(0, firstNl);
                            const titleMatch = firstLine.match(/^\s*>\s*\[!([^\]]+)\][+-]?\s*(.*)$/);

                            if (!titleMatch) continue;
                            const title = titleMatch[2].trim();
                            const bodyText = firstNl === -1 ? '' : calloutText.slice(firstNl + 1)
                                .split('\n').map(l => l.replace(/^\s*>\s?/, '')).join('\n').trim();

                            if (targets.calloutTitles && title) {
                                if (tester.test(title)) add({ kind: 'callout-title', label: title });
                            }

                            if (targets.calloutBodies && bodyText && (cap === 0 || matches.length < cap)) {
                                looper.lastIndex = 0;
                                const bm = looper.exec(bodyText);
                                if (bm) {
                                    add({
                                        kind: 'callout-body',
                                        label: title || '(untitled callout)',
                                        snippet: display.showBodySnippet ? extractSnippet(bodyText, bm.index, display.snippetContextChars) : undefined,
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // ── Full note body ────────────────────────────────────────────────
            if (targets.noteBody && (cap === 0 || matches.length < cap)) {
                const text = (await getContent()) ?? '';
                const closeIdx  = text.indexOf('\n---', 3);
                const bodyStart  = text.startsWith('---') && closeIdx !== -1
                    ? closeIdx + 4
                    : 0;
                const body = text.slice(bodyStart);

                looper.lastIndex = 0;
                let bm: RegExpExecArray | null;
                while ((bm = looper.exec(body)) !== null) {
                    if (cap > 0 && matches.length >= cap) break;

                    const lineStart = body.lastIndexOf('\n', bm.index) + 1;
                    const lineEnd   = body.indexOf('\n', bm.index);
                    const line = body.slice(lineStart, lineEnd === -1 ? body.length : lineEnd);
                    if (/^#{1,6}\s/.test(line)) continue;
                    if (/^\s*>\s*\[![^\]]+\]/.test(line)) continue;

                    const snippet = display.showBodySnippet
                        ? extractSnippet(body, bm.index, display.snippetContextChars)
                        : undefined;

                    add({ kind: 'body', label: line.trim().slice(0, 120) || '(body)', snippet });
                    break;
                }
            }

            if (matches.length > 0) {
                const tags = (cache?.tags ?? []).map(t => t.tag);
                results.push({
                    noteName: file.basename,
                    filePath: file.path,
                    matches,
                    tags,
                    groupName: group.name,
                });
            }

            // Yield to the UI thread every 20 files to prevent freezing on large vaults
            if (++fileIndex % 20 === 0) await new Promise(r => window.setTimeout(r, 0));
        }

        return results.sort((a, b) =>
            a.noteName.localeCompare(b.noteName, undefined, { sensitivity: 'base' }),
        );
    }

    effectiveLibraryFolder(): string {
        const lib = (this.settings.libraryFolder || '').trim();
        return lib || (this.settings.pdfOutline?.indexFolder || '').trim();
    }

    private isInLibrary(path: string): boolean {
        const folder = this.effectiveLibraryFolder().replace(/\/+$/, '');
        if (!folder) return true;
        return path.startsWith(folder + '/') || path === folder;
    }

    async loadSettings() {
        const loaded = await this.loadData() as Partial<LibrarySearchSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

        const DEFAULT_TARGETS: SearchTargets = { headings: true, calloutTitles: true, calloutBodies: false, frontmatterFields: [], noteBody: false, filename: false };
        // Legacy migration: very old versions stored a single top-level `targets`
        // object. It is no longer part of the typed settings, so read it the same
        // defensive way as the bookTypes/articleTypes legacy reads below.
        let legacyTargets: Partial<SearchTargets> = {};
        if (loaded) {
            legacyTargets = ((loaded as Record<string, unknown>).targets as Partial<SearchTargets> | undefined) ?? {};
        }
        const seedTargets: SearchTargets = Object.assign({}, DEFAULT_TARGETS, legacyTargets);
        this.settings.display  = Object.assign({}, DEFAULT_SETTINGS.display,  this.settings.display);
        this.settings.behavior = Object.assign({}, DEFAULT_SETTINGS.behavior, this.settings.behavior);
        this.settings.panel    = Object.assign({}, DEFAULT_SETTINGS.panel,    this.settings.panel);
        this.settings.terms    = Object.assign({}, DEFAULT_SETTINGS.terms,    this.settings.terms);
        this.settings.pdfOutline = Object.assign({}, DEFAULT_PDF_OUTLINE_SETTINGS, this.settings.pdfOutline);

        if (!this.settings.language) this.settings.language = 'en';

        if (loaded && !loaded.groups && ((loaded as Record<string, unknown>).bookTypes || (loaded as Record<string, unknown>).articleTypes)) {
            this.settings.groups = [
                { name: 'Books',    property: 'type', values: ((loaded as Record<string, unknown>).bookTypes as string[]) ?? [],    icon: 'book-open', targets: { ...seedTargets } },
                { name: 'Articles', property: 'type', values: ((loaded as Record<string, unknown>).articleTypes as string[]) ?? [], icon: 'file-text', targets: { ...seedTargets } },
            ];
        }
        if (!Array.isArray(this.settings.groups) || this.settings.groups.length === 0) {
            this.settings.groups = DEFAULT_SETTINGS.groups.map(g => ({ ...g, values: [...g.values], targets: { ...g.targets } }));
        }

        for (const g of this.settings.groups) {
            if (typeof g.property !== 'string' || g.property === '') {
                g.property = 'type';
            }
            if (!Array.isArray(g.values)) {
                g.values = Array.isArray((g as Record<string, unknown>).types) ? (g as Record<string, unknown>).types as string[] : [];
            }
            delete (g as Record<string, unknown>).types;
            g.targets = Object.assign({}, DEFAULT_TARGETS, g.targets ?? seedTargets);
        }
    }

    async saveSettings() { await this.saveData(this.settings); }
}

/* ═══════════════════════════════════════════════════════════════════════════
SHARED RENDERER
═══════════════════════════════════════════════════════════════════════════ */

const KIND_ICON: Record<MatchKind, string> = {
    'heading':       'heading',
    'callout-title': 'chevron-right',
    'callout-body':  'chevron-right',
    'frontmatter':   'braces',
    'body':          'align-left',
    'filename':      'file-text',
};

async function renderMd(
    app: App, md: string, el: HTMLElement, sourcePath: string, component: Component,
): Promise<void> {
    el.addClass('lsv-md');
    try {
        await MarkdownRenderer.render(app, md, el, sourcePath, component);
    } catch {
        el.setText(md);
    }
}

async function renderMatch(
    parent: HTMLElement,
    match: Match,
    app: App,
    component: Component,
    sourcePath: string,
): Promise<void> {
    const row  = parent.createDiv('lsv-match');
    const iconEl = row.createSpan({ cls: 'lsv-match-icon' });
    setIcon(iconEl, KIND_ICON[match.kind]);
    const body = row.createDiv('lsv-match-body');

    const labelRow = body.createDiv('lsv-match-label-row');
    if (match.kind === 'frontmatter' && match.fieldName) {
        labelRow.createSpan({ text: match.fieldName + ': ', cls: 'lsv-match-field' });
    }
    if (match.kind === 'callout-body') {
        labelRow.createSpan({ text: 'in: ', cls: 'lsv-match-field' });
    }
    const labelEl = labelRow.createSpan({ cls: 'lsv-match-label' });
    await renderMd(app, match.label, labelEl, sourcePath, component);

    if (match.snippet) {
        const snip = body.createDiv('lsv-snippet');
        await renderMd(app, match.snippet, snip, sourcePath, component);
    }

    if (match.sectionContent) {
        const wrap    = body.createDiv('lsv-section-wrap');
        const content = wrap.createDiv('lsv-section-content');
        await renderMd(app, match.sectionContent, content, sourcePath, component);

        const toggle = wrap.createDiv({ cls: 'lsv-section-toggle' });
        const togIcon = toggle.createSpan({ cls: 'lsv-toggle-icon' });
        setIcon(togIcon, 'chevron-right');
        const togText = toggle.createSpan({ text: t('ui.expand') });
        toggle.onclick = () => {
            const expanded = content.classList.toggle('lsv-expanded');
            setIcon(togIcon, expanded ? 'chevron-down' : 'chevron-right');
            togText.textContent = expanded ? t('ui.collapse') : t('ui.expand');
        };
    }
}

function renderResults(
    parent: HTMLElement,
    results: SearchResult[],
    display: DisplaySettings,
    groups: GroupRule[],
    app: App,
    component: Component,
): void {
    if (results.length === 0) {
        parent.createDiv({ text: t('ui.noResults'), cls: 'lsv-muted' });
        return;
    }
    const hoverParent = { hoverPopover: null } as unknown as Record<string, unknown>;

    const render = (items: SearchResult[], sectionTitle: string, icon: string) => {
        if (items.length === 0) return;
        const section = parent.createDiv('lsv-section');
        const h4 = section.createEl('h4', { cls: 'lsv-section-title' });
        const secIcon  = h4.createSpan({ cls: 'lsv-sec-icon' });
        setIcon(secIcon, icon);
        h4.createSpan({ text: `${sectionTitle} (${items.length})` });

        // ── EVENT DELEGATION ─────────────────────────────────────────────────
        // One listener per section instead of N*2 listeners per item.
        // `component.registerDomEvent` auto-removes them on component.unload().
        component.registerDomEvent(section, 'click', (evt: MouseEvent) => {
            const item = (evt.target as HTMLElement).closest<HTMLElement>('.lsv-item');
            if (!item) return;
            const filePath = item.dataset.filePath;
            if (!filePath) return;

            const a = (evt.target as HTMLElement).closest<HTMLElement>('a.internal-link');
            if (a) {
                if (a.classList.contains('lsv-link')) {
                    // Title link: open the note itself
                    evt.preventDefault();
                    openFile(app, filePath);
                } else {
                    // Internal link inside matches: resolve relative to the note
                    evt.preventDefault();
                    const href = a.getAttribute('data-href') ?? a.getAttribute('href') ?? a.textContent ?? '';
                    if (href) void app.workspace.openLinkText(href, filePath, false);
                }
                return;
            }
            // Click outside any link: open the note
            openFile(app, filePath);
        });

        component.registerDomEvent(section, 'mouseover', (evt: MouseEvent) => {
            const a = (evt.target as HTMLElement).closest<HTMLElement>('a.internal-link');
            if (!a) return;
            const item = a.closest<HTMLElement>('.lsv-item');
            const href = a.getAttribute('data-href') ?? a.getAttribute('href') ?? a.textContent ?? '';
            if (!href || !item) return;
            const filePath = item.dataset.filePath;
            if (!filePath) return;

            app.workspace.trigger('hover-link', {
                event: evt,
                source: HOVER_SOURCE,
                hoverParent,
                targetEl: a,
                linktext: href,
                sourcePath: filePath,
            });
        });

        for (const r of items) {
            const item = section.createDiv('lsv-item');
            item.dataset.filePath = r.filePath; // Store path for event delegation

            const link = item.createDiv('lsv-item-title')
                .createEl('a', { text: r.noteName, cls: 'lsv-link internal-link' });
            link.setAttr('data-href', r.filePath);

            if (display.showFilePath) {
                item.createDiv({ text: r.filePath, cls: 'lsv-item-path' });
            }

            if (display.showTags && r.tags.length > 0) {
                const tagsRow = item.createDiv('lsv-item-tags');
                r.tags.forEach(tag => tagsRow.createSpan({ text: tag, cls: 'lsv-tag lsv-tag--meta' }));
            }

            if (r.matches.length > 0) {
                const matchList = item.createDiv('lsv-matches');
                r.matches.forEach(m => void renderMatch(matchList, m, app, component, r.filePath));
            }
        }
    };

    if (display.groupByType) {
        for (const g of groups) {
            render(results.filter(r => r.groupName === g.name), g.name, g.icon || 'folder');
        }
    } else {
        render(results, t('ui.results'), 'search');
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
TAB VIEW
═══════════════════════════════════════════════════════════════════════════ */

class LibrarySearchView extends ItemView {
    private plugin: LibrarySearchPlugin;
    private aliases: string[] = [];
    private baseResults: SearchResult[] = [];
    private extraFilterRaw = '';
    private trackedFile: TFile | null = null;
    private isPinned = false;
    private searchCtrlOpen = false;
    private lastAliasSig = '';
    private renderComp: Component | null = null;
    private searchGen   = 0;

    constructor(leaf: WorkspaceLeaf, plugin: LibrarySearchPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType()    { return VIEW_TYPE; }
    getDisplayText() { return t('ui.librarySearch'); }
    getIcon()        { return 'book-open'; }

    async onOpen() {
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', leaf => {
                if (this.isPinned) return;
                if (leaf?.view instanceof MarkdownView) {
                    const file = leaf.view.file;
                    if (file && file !== this.trackedFile) {
                        this.trackedFile = file;
                        void this.rebuild();
                    }
                }
            }),
        );
        this.registerEvent(
            this.app.metadataCache.on('changed', file => {
                if (file !== this.trackedFile) return;
                const sig = this.plugin.getSearchTerms(file).join('\u0001');
                if (sig === this.lastAliasSig) return;
                void this.rebuild();
            }),
        );
        this.trackedFile = this.app.workspace.getActiveFile();
        await this.rebuild();
    }

    private async rebuild() {
        const root = this.contentEl;
        root.empty();
        root.addClass('lsv-container');

        const head = root.createDiv({ cls: 'lsv-head-row' });
        head.createEl('h3', { text: t('ui.librarySearch'), cls: 'lsv-title' });
        const searchToggle = head.createEl('button', { cls: 'lsv-icon-btn', title: t('ui.searchTerms') });
        setIcon(searchToggle, 'sliders-horizontal');
        searchToggle.toggleClass('is-active', this.searchCtrlOpen);
        const pin = head.createEl('button', { cls: 'lsv-icon-btn', title: this.isPinned ? t('ui.unpin') : t('ui.pin') });
        setIcon(pin, this.isPinned ? 'pin-off' : 'pin');
        pin.toggleClass('is-active', this.isPinned);
        pin.onclick = () => {
            this.isPinned = !this.isPinned;
            setIcon(pin, this.isPinned ? 'pin-off' : 'pin');
            pin.toggleClass('is-active', this.isPinned);
            pin.setAttribute('title', this.isPinned ? t('ui.unpin') : t('ui.pin'));
            if (!this.isPinned) {
                const af = this.app.workspace.getActiveFile();
                if (af && af.extension === 'md' && af !== this.trackedFile) {
                    this.trackedFile = af;
                }
                void this.rebuild();
            }
        };

        const searchCtrl = root.createDiv({ cls: 'lsv-search-ctrl' + (this.searchCtrlOpen ? ' is-open' : '') });
        searchToggle.onclick = () => {
            this.searchCtrlOpen = !this.searchCtrlOpen;
            searchCtrl.toggleClass('is-open', this.searchCtrlOpen);
            searchToggle.toggleClass('is-active', this.searchCtrlOpen);
        };

        if (this.trackedFile) {
            searchCtrl.createDiv({ text: this.trackedFile.basename, cls: 'lsv-file-name' });
        }

        this.aliases = this.trackedFile
            ? this.plugin.getSearchTerms(this.trackedFile)
            : [];
        this.lastAliasSig = this.aliases.join('\u0001');

        const aliasRow = searchCtrl.createDiv('lsv-aliases-row');
        aliasRow.createSpan({ text: t('ui.aliases'), cls: 'lsv-label' });
        if (this.aliases.length === 0) {
            aliasRow.createSpan({ text: t('ui.none'), cls: 'lsv-muted' });
        } else {
            this.aliases.forEach(a => aliasRow.createSpan({ text: a, cls: 'lsv-tag lsv-tag--alias' }));
        }

        const extraRow = searchCtrl.createDiv('lsv-extra-row');
        extraRow.createSpan({ text: t('ui.extra'), cls: 'lsv-label' });
        const input = extraRow.createEl('input', { type: 'text', cls: 'lsv-input' });
        input.placeholder = t('ui.extraTerms');
        input.value = this.extraFilterRaw;
        const btn = extraRow.createEl('button', { text: t('ui.search'), cls: 'lsv-btn' });

        // The extra-terms box filters the results already on screen (AND, all
        // tokens must be present) — it never re-queries the vault.
        const applyNow = () => {
            if (this.aliases.length === 0) return;
            const wrap = root.querySelector<HTMLElement>('.lsv-results');
            if (wrap) this.renderFiltered(wrap);
        };
        const applyDebounced = debounce(applyNow, 120, true);

        input.addEventListener('input', () => {
            this.extraFilterRaw = input.value;
            applyDebounced();
        });
        input.onkeydown = e => { if (e.key === 'Enter') { applyDebounced.cancel(); applyNow(); } };
        btn.onclick = () => { applyDebounced.cancel(); applyNow(); };

        await this.doSearch(root);
    }

    /** Runs the alias-based vault search and caches the result set. */
    private async doSearch(root: HTMLElement) {
        root.querySelector('.lsv-results')?.remove();
        if (this.renderComp) { this.removeChild(this.renderComp); this.renderComp = null; }
        const wrap = root.createDiv('lsv-results');

        if (this.aliases.length === 0) {
            this.baseResults = [];
            wrap.createDiv({ text: t('ui.openNote'), cls: 'lsv-muted' });
            return;
        }

        const loadEl = wrap.createDiv({ text: t('ui.searching'), cls: 'lsv-loading' });
        const gen     = ++this.searchGen;
        const results = await this.plugin.searchLibrary(this.aliases);
        if (gen !== this.searchGen) return;   // stale — a newer search superseded this one
        loadEl.remove();

        this.baseResults = results;
        this.renderFiltered(wrap);
    }

    /** Re-renders `wrap` with `baseResults` narrowed by the extra-terms filter. */
    private renderFiltered(wrap: HTMLElement) {
        wrap.empty();
        if (this.renderComp) { this.removeChild(this.renderComp); this.renderComp = null; }
        const comp = new Component();
        this.addChild(comp);
        this.renderComp = comp;

        const tokens = filterTokens(this.extraFilterRaw, this.plugin.settings.behavior.caseSensitive);
        const filtered = this.baseResults.filter(r => resultMatchesTokens(r, tokens, this.plugin.settings.behavior.caseSensitive));
        renderResults(wrap, filtered, this.plugin.settings.display, this.plugin.settings.groups, this.app, comp);
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
INLINE CODE BLOCK  `library-search`
═══════════════════════════════════════════════════════════════════════════ */

class LibrarySearchBlock extends MarkdownRenderChild {
    constructor(
        containerEl: HTMLElement,
        private ctx: MarkdownPostProcessorContext,
        private source: string,
        private plugin: LibrarySearchPlugin,
    ) { super(containerEl); }

    onload() {
        void this._loadContent();
    }

    private async _loadContent() {
        const el = this.containerEl;
        el.addClass('lsv-block');

        const file = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
        if (!(file instanceof TFile)) {
            el.createDiv({ text: t('ui.couldNotResolveFile'), cls: 'lsv-muted' });
            return;
        }

        const aliases    = this.plugin.getSearchTerms(file);
        const extraTerms = this.source.split('\n').map(l => l.trim()).filter(Boolean);
        const allTerms   = [...aliases, ...extraTerms];

        if (aliases.length > 0 || extraTerms.length > 0) {
            const badges = el.createDiv('lsv-badge-row');
            aliases.forEach(a    => badges.createSpan({ text: a,    cls: 'lsv-tag lsv-tag--alias' }));
            extraTerms.forEach(t => badges.createSpan({ text: `+${t}`, cls: 'lsv-tag lsv-tag--extra' }));
            el.createEl('hr', { cls: 'lsv-divider' });
        }

        if (allTerms.length === 0) {
            el.createDiv({ text: t('ui.noResults'), cls: 'lsv-muted' });
            return;
        }

        const loadEl = el.createDiv({ text: t('ui.searching'), cls: 'lsv-loading' });
        const results = await this.plugin.searchLibrary(allTerms);
        loadEl.remove();

        const wrap = el.createDiv('lsv-results');
        renderResults(wrap, results, this.plugin.settings.display, this.plugin.settings.groups, this.plugin.app, this);
    }
}