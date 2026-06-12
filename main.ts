import {
    App,
    CachedMetadata,
    Component,
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

/* ═══════════════════════════════════════════════════════════════════════════
STYLES
═══════════════════════════════════════════════════════════════════════════ */

const STYLES = `
:root { --xp-btn-size: 24px; --xp-btn-icon: 13px; --xp-gap: 6px; --xp-btn-radius: var(--radius-s); }
.lsv-container {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
}
.lsv-title {
    margin: 0;
    font-size: 1.05em;
    color: var(--text-accent);
    font-weight: 600;
}
.lsv-file-name { font-size: 0.78em; color: var(--text-muted); }
.lsv-label { font-size: 0.8em; color: var(--text-muted); white-space: nowrap; }
.lsv-muted  { color: var(--text-muted); font-size: 0.85em; font-style: italic; }
.lsv-loading {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.85em;
    animation: lsv-pulse 1.2s ease-in-out infinite;
}
@keyframes lsv-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.lsv-aliases-row, .lsv-extra-row, .lsv-badge-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
}
.lsv-input {
    flex: 1;
    min-width: 100px;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.85em;
    outline: none;
}
.lsv-input:focus {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 25%, transparent);
}
.lsv-btn {
    padding: 3px 12px;
    border-radius: 5px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    cursor: pointer;
    font-size: 0.85em;
    white-space: nowrap;
}
.lsv-btn:hover { filter: brightness(1.1); }
/* Collapsible search controls in side panel */
.lsv-search-ctrl { display: none; flex-direction: column; gap: 6px; padding: 4px 0 2px; border-top: 1px solid var(--background-modifier-border); margin-top: 2px; }
.lsv-search-ctrl.is-open { display: flex; }
/* Tags / badges */
.lsv-tag {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.75em;
    font-weight: 500;
    line-height: 1.6;
}
.lsv-tag--alias  { background: var(--tag-background); color: var(--tag-color); border: 1px solid var(--tag-border-color, var(--background-modifier-border)); }
.lsv-tag--extra  { background: color-mix(in srgb, var(--color-green) 15%, transparent); color: var(--color-green); border: 1px solid color-mix(in srgb, var(--color-green) 40%, transparent); }
.lsv-tag--meta   { background: var(--background-secondary); color: var(--text-muted); border: 1px solid var(--background-modifier-border); }
/* Results */
.lsv-results { display: flex; flex-direction: column; gap: 14px; }
.lsv-section-title {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78em;
    font-weight: 600;
    color: var(--h4-color, var(--text-accent));
    text-transform: uppercase;
    letter-spacing: .06em;
    margin: 0 0 6px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--background-modifier-border);
}
.lsv-sec-icon .svg-icon { width: 12px; height: 12px; }
.lsv-item {
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    margin-bottom: 4px;
    transition: border-color .15s;
    cursor: pointer;
}
.lsv-item:hover { border-color: var(--interactive-accent); }
.lsv-item-title  { margin-bottom: 4px; }
.lsv-link {
    font-weight: 600;
    color: var(--link-color);
    cursor: pointer;
    text-decoration: none;
    font-size: .9em;
}
.lsv-link:hover { text-decoration: underline; }
.lsv-item-tags  { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 4px; }
.lsv-item-path  { font-size: .72em; color: var(--text-faint); font-family: var(--font-monospace); margin-bottom: 4px; }
/* Match rows */
.lsv-matches { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.lsv-match   { font-size: .82em; display: flex; align-items: flex-start; gap: 5px; }
.lsv-match-icon  { flex-shrink: 0; color: var(--text-accent); width: 14px; height: 14px; margin-top: 1px; display: inline-flex; align-items: center; justify-content: center; }
.lsv-match-icon .svg-icon { width: 12px; height: 12px; }
.lsv-match-body  { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.lsv-match-label { color: var(--text-normal); font-weight: 500; word-break: break-word; }
.lsv-match-field { color: var(--text-muted); font-style: italic; font-size: .9em; }
.lsv-snippet {
    font-size: .85em;
    color: var(--text-muted);
    font-style: italic;
    white-space: pre-wrap;
    word-break: break-word;
    padding: 2px 0 0 2px;
    border-left: 2px solid var(--background-modifier-border);
}
/* Section content (heading modes: with-excerpt / with-section) */
.lsv-section-wrap { display: flex; flex-direction: column; gap: 2px; }
.lsv-section-content {
    font-size: .82em;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-break: break-word;
    padding: 4px 8px;
    border-left: 2px solid var(--background-modifier-border);
    max-height: 5.5em;
    overflow: hidden;
    transition: max-height .2s ease;
}
.lsv-section-content.lsv-expanded { max-height: 600px; }
.lsv-section-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: .72em;
    color: var(--text-accent);
    cursor: pointer;
    user-select: none;
    align-self: flex-start;
}
.lsv-section-toggle .svg-icon { width: 10px; height: 10px; }
.lsv-section-toggle:hover { text-decoration: underline; }
/* Inline block */
.lsv-block {
    border: 1px solid var(--background-modifier-border);
    border-radius: 7px;
    padding: 10px 12px;
    background: var(--background-secondary);
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.lsv-divider { border: none; border-top: 1px solid var(--background-modifier-border); margin: 0; }
/* Settings */
.lsv-settings-section {
    margin: 18px 0 4px 0;
    font-size: .78em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--background-modifier-border);
    padding-bottom: 4px;
}
/* ── Inline note panel (CM6 panel + reading-mode banner) ───────────────── */
.lsv-cm-panel,
.lsv-reading-banner {
    box-sizing: border-box;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    font-size: var(--font-ui-small, .85em);
}
.lsv-cm-panel {
    border-left: none;
    border-right: none;
    max-height: 40vh;
    overflow-y: auto;
}
.lsv-reading-banner {
    border-radius: 8px;
    margin: 0 auto 14px auto;
    max-width: var(--file-line-width, 100%);
    max-height: 45vh;
    overflow-y: auto;
}
.lsv-panel-header {
    display: flex;
    align-items: center;
    gap: var(--xp-gap);
    padding: 6px 12px;
    position: sticky;
    top: 0;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    cursor: pointer;
    user-select: none;
}
.lsv-panel-title-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
.lsv-panel-title-icon .svg-icon { width: 13px; height: 13px; }
.lsv-panel-title { font-weight: 600; color: var(--text-accent); flex: 1; }
.lsv-panel-count { color: var(--text-muted); font-size: .8em; }
.lsv-panel-collapse { color: var(--text-muted); width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; }
.lsv-panel-collapse .svg-icon { width: 13px; height: 13px; }
.lsv-panel-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px 12px 12px;
}
.lsv-panel-aliases { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
/* Expandable search controls inside the panel */
.lsv-search-details { border: 1px solid var(--background-modifier-border); border-radius: 6px; }
.lsv-search-summary {
    cursor: pointer;
    user-select: none;
    padding: 5px 8px;
    font-size: .82em;
    color: var(--text-muted);
    display: flex;
    gap: 6px;
    align-items: center;
}
.lsv-search-summary::-webkit-details-marker { color: var(--text-faint); }
.lsv-search-details[open] .lsv-search-summary { border-bottom: 1px solid var(--background-modifier-border); }
.lsv-search-details > .lsv-panel-aliases,
.lsv-search-details > .lsv-extra-row { padding: 6px 8px; }
/* Markdown-rendered match content: flatten block spacing so it reads inline */
.lsv-md p { margin: 0; }
.lsv-md ul, .lsv-md ol { margin: 2px 0; padding-left: 1.2em; }
.lsv-md > :first-child { margin-top: 0; }
.lsv-md > :last-child  { margin-bottom: 0; }
.lsv-match-label .lsv-md p, .lsv-match-label p { display: inline; }
.lsv-match-label-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; }
.lsv-head-row { display: flex; align-items: center; gap: var(--xp-gap); }
.lsv-head-row .lsv-title { flex: 1; margin: 0; }
.lsv-icon-btn { width: var(--xp-btn-size); height: var(--xp-btn-size); padding: 3px; min-width: unset; flex-shrink: 0; background: transparent; border: none; cursor: pointer; color: var(--text-muted); border-radius: var(--xp-btn-radius); display: inline-flex; align-items: center; justify-content: center; }
.lsv-icon-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.lsv-icon-btn.is-active { background: var(--interactive-accent); color: var(--text-on-accent); }
.lsv-icon-btn .svg-icon { width: var(--xp-btn-icon); height: var(--xp-btn-icon); }
/* Inline-panel header buttons (smaller than side-panel icon buttons) */
.lsv-panel-btn { width: 20px; height: 20px; padding: 2px; flex-shrink: 0; color: var(--text-muted); border-radius: var(--xp-btn-radius); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.lsv-panel-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.lsv-panel-btn.is-active { background: var(--interactive-accent); color: var(--text-on-accent); }
.lsv-panel-btn .svg-icon { width: 12px; height: 12px; }
/* Groups editor in settings */
.lsv-group-row .setting-item-info { display: none; }
.lsv-group-row .setting-item-control { flex-wrap: wrap; gap: 4px; justify-content: flex-start; }
.lsv-groups-editor .setting-item { border-top: none; padding: 4px 0; }
.lsv-group-targets { margin: 2px 0 14px 16px; padding-left: 10px; border-left: 2px solid var(--background-modifier-border); }
.lsv-group-targets .setting-item-description { margin-bottom: 4px; }
/* ── Icon picker button in group row ─────────────────────── */
.lsv-icon-picker-btn { display: inline-flex; align-items: center; gap: 4px; font-size: .85em; }
.lsv-icon-picker-btn-icon { display: inline-flex; align-items: center; }
.lsv-icon-picker-btn-icon .svg-icon { width: 16px; height: 16px; }
/* ── Icon Picker Modal ──────────────────────────────────────────── */
.lsv-icon-picker { padding: 16px; }
.lsv-icon-picker-search {
    width: 100%;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: .9em;
    margin-bottom: 12px;
    outline: none;
}
.lsv-icon-picker-search:focus {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 25%, transparent);
}
.lsv-icon-picker-category {
    font-size: .82em;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: .06em;
    margin: 10px 0 6px 0;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--background-modifier-border);
}
.lsv-icon-picker-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
}
.lsv-icon-picker-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 6px 2px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: border-color .15s, background .15s;
}
.lsv-icon-picker-cell:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
}
.lsv-icon-picker-cell .svg-icon { width: 20px; height: 20px; }
.lsv-icon-picker-cell-name {
    font-size: .6em;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
}
.lsv-icon-picker-empty {
    color: var(--text-muted);
    font-style: italic;
    font-size: .85em;
    padding: 16px 0;
    text-align: center;
}
`;

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
    if (f instanceof TFile) app.workspace.getLeaf(false).openFile(f);
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
    const dom = document.createElement('div');
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

    // ── Body — always built; collapse just hides it (no re-search on expand) ─────
    const body = container.createDiv('lsv-panel-body');
    if (collapsed) body.style.display = 'none';
    header.onclick = () => {
        const nowCollapsed = container.dataset.collapsed !== '1';
        container.dataset.collapsed = nowCollapsed ? '1' : '0';
        setIcon(collapseBtn, nowCollapsed ? 'chevron-right' : 'chevron-down');
        body.style.display = nowCollapsed ? 'none' : '';
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

    const run = async () => {
        container.dataset.extra = input.value;
        const extra = input.value.split(',').map(x => x.trim()).filter(Boolean);
        const terms = [...aliases, ...extra];
        resultsWrap.empty();

        unloadPanelComponent(container);
        const comp = new Component();
        comp.load();
        panelComponents.set(container, comp);

        if (terms.length === 0) {
            resultsWrap.createDiv({ text: t('ui.noAliases'), cls: 'lsv-muted' });
            countEl.setText('');
            return;
        }

        const load = resultsWrap.createDiv({ text: t('ui.searching'), cls: 'lsv-loading' });
        const results = await plugin.searchLibrary(terms);
        load.remove();
        countEl.setText(results.length ? `${results.length}` : '');
        renderResults(resultsWrap, results, plugin.settings.display, plugin.settings.groups, plugin.app, comp);
    };

    btn.onclick = run;
    input.onkeydown = e => { if (e.key === 'Enter') void run(); };
    void run();
}

/* ═══════════════════════════════════════════════════════════════════════════
PLUGIN
═══════════════════════════════════════════════════════════════════════════ */

export default class LibrarySearchPlugin extends Plugin {
    settings: LibrarySearchSettings;
    panelField: StateField<PanelPayload>;
    private styleEl: HTMLStyleElement | null = null;
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
        this.injectStyles();

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
            id: 'open-library-search',
            name: 'Open Library Search panel',
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
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
        for (const v of [...this.readingBanners.keys()]) this.removeReadingBanner(v);
        this.viewSig.clear();
        this.retryViews.clear();
        if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
        if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
        this.styleEl?.remove();
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
                        filePath: shouldHaveEditorPanel ? file!.path : null,
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
            el = document.createElement('div');
            el.className = 'lsv-reading-banner';
            this.readingBanners.set(view, el);
        }
        const atTop = this.settings.panel.position === 'top';
        const placed = atTop ? host.firstChild === el : host.lastChild === el;
        if (el.parentElement !== host || !placed) {
            el.remove();
            atTop ? host.prepend(el) : host.append(el);
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
        if (leaves.length > 0) { workspace.revealLeaf(leaves[0]); return; }
        const leaf = workspace.getLeaf('tab');
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
        workspace.revealLeaf(leaf);
    }

    getSearchTerms(file: TFile): string[] {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm) return [];
        const cfg = this.settings.terms;

        if (cfg.source === 'property' && cfg.property) {
            const raw = fm[cfg.property];
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
                const raw = fm[g.property];
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
                            const titleMatch = firstLine.match(/^\s*>\s*\[!([^\]]+)\][+\-]?\s*(.*)$/);

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

            // Yield to the UI thread every 50 files to prevent freezing on large vaults
            if (++fileIndex % 20 === 0) await new Promise(r => setTimeout(r, 0));
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

    private injectStyles() {
        if (document.getElementById('library-search-styles')) return;
        this.styleEl = document.createElement('style');
        this.styleEl.id = 'library-search-styles';
        this.styleEl.textContent = STYLES;
        document.head.appendChild(this.styleEl);
    }

    async loadSettings() {
        const loaded = (await this.loadData()) as any;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

        const DEFAULT_TARGETS: SearchTargets = { headings: true, calloutTitles: true, calloutBodies: false, frontmatterFields: [], noteBody: false, filename: false };
        const seedTargets: SearchTargets = Object.assign({}, DEFAULT_TARGETS, (loaded && loaded.targets) || {});
        this.settings.display  = Object.assign({}, DEFAULT_SETTINGS.display,  this.settings.display);
        this.settings.behavior = Object.assign({}, DEFAULT_SETTINGS.behavior, this.settings.behavior);
        this.settings.panel    = Object.assign({}, DEFAULT_SETTINGS.panel,    this.settings.panel);
        this.settings.terms    = Object.assign({}, DEFAULT_SETTINGS.terms,    this.settings.terms);
        this.settings.pdfOutline = Object.assign({}, DEFAULT_PDF_OUTLINE_SETTINGS, this.settings.pdfOutline);

        if (!this.settings.language) this.settings.language = 'en';

        if (loaded && !loaded.groups && (loaded.bookTypes || loaded.articleTypes)) {
            this.settings.groups = [
                { name: 'Books',    property: 'type', values: loaded.bookTypes ?? [],    icon: 'book-open', targets: { ...seedTargets } },
                { name: 'Articles', property: 'type', values: loaded.articleTypes ?? [], icon: 'file-text', targets: { ...seedTargets } },
            ];
        }
        if (!Array.isArray(this.settings.groups) || this.settings.groups.length === 0) {
            this.settings.groups = DEFAULT_SETTINGS.groups.map(g => ({ ...g, values: [...g.values], targets: { ...g.targets } }));
        }

        for (const g of this.settings.groups as any[]) {
            if (typeof g.property !== 'string' || g.property === '') {
                g.property = 'type';
            }
            if (!Array.isArray(g.values)) {
                g.values = Array.isArray(g.types) ? g.types : [];
            }
            delete g.types;
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
            const item = (evt.target as HTMLElement).closest('.lsv-item') as HTMLElement | null;
            if (!item) return;
            const filePath = item.dataset.filePath;
            if (!filePath) return;

            const a = (evt.target as HTMLElement).closest('a.internal-link') as HTMLElement | null;
            if (a) {
                if (a.classList.contains('lsv-link')) {
                    // Title link: open the note itself
                    evt.preventDefault();
                    openFile(app, filePath);
                } else {
                    // Internal link inside matches: resolve relative to the note
                    evt.preventDefault();
                    const href = a.getAttribute('data-href') ?? a.getAttribute('href') ?? a.textContent ?? '';
                    if (href) app.workspace.openLinkText(href, filePath, false);
                }
                return;
            }
            // Click outside any link: open the note
            openFile(app, filePath);
        });

        component.registerDomEvent(section, 'mouseover', (evt: MouseEvent) => {
            const a = (evt.target as HTMLElement).closest('a.internal-link') as HTMLElement | null;
            if (!a) return;
            const item = a.closest('.lsv-item') as HTMLElement | null;
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
    private extraTerms: string[] = [];
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
                        this.rebuild();
                    }
                }
            }),
        );
        this.registerEvent(
            this.app.metadataCache.on('changed', file => {
                if (file !== this.trackedFile) return;
                const sig = this.plugin.getSearchTerms(file).join('\u0001');
                if (sig === this.lastAliasSig) return;
                this.rebuild();
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

        const aliases = this.trackedFile
            ? this.plugin.getSearchTerms(this.trackedFile)
            : [];
        this.lastAliasSig = aliases.join('\u0001');

        const aliasRow = searchCtrl.createDiv('lsv-aliases-row');
        aliasRow.createSpan({ text: t('ui.aliases'), cls: 'lsv-label' });
        if (aliases.length === 0) {
            aliasRow.createSpan({ text: t('ui.none'), cls: 'lsv-muted' });
        } else {
            aliases.forEach(a => aliasRow.createSpan({ text: a, cls: 'lsv-tag lsv-tag--alias' }));
        }

        const extraRow = searchCtrl.createDiv('lsv-extra-row');
        extraRow.createSpan({ text: t('ui.extra'), cls: 'lsv-label' });
        const input = extraRow.createEl('input', { type: 'text', cls: 'lsv-input' });
        input.placeholder = t('ui.extraTerms');
        input.value = this.extraTerms.join(', ');
        const btn = extraRow.createEl('button', { text: t('ui.search'), cls: 'lsv-btn' });

        const run = async () => {
            this.extraTerms = input.value.split(',').map(x => x.trim()).filter(Boolean);
            await this.doSearch(root, [...aliases, ...this.extraTerms]);
        };
        btn.onclick = run;
        input.onkeydown = e => { if (e.key === 'Enter') run(); };

        await this.doSearch(root, [...aliases, ...this.extraTerms]);
    }

    private async doSearch(root: HTMLElement, terms: string[]) {
        root.querySelector('.lsv-results')?.remove();
        if (this.renderComp) { this.removeChild(this.renderComp); this.renderComp = null; }
        const wrap = root.createDiv('lsv-results');

        if (terms.length === 0) {
            wrap.createDiv({ text: t('ui.openNote'), cls: 'lsv-muted' });
            return;
        }

        const comp = new Component();
        this.addChild(comp);
        this.renderComp = comp;

        const loadEl = wrap.createDiv({ text: t('ui.searching'), cls: 'lsv-loading' });
        const gen     = ++this.searchGen;
        const results = await this.plugin.searchLibrary(terms);
        if (gen !== this.searchGen) return;   // stale — a newer search superseded this one
        loadEl.remove();

        renderResults(wrap, results, this.plugin.settings.display, this.plugin.settings.groups, this.app, comp);
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

    async onload() {
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