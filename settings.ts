/* ════════════════════════════════════════════════════════════════════════════
SETTINGS — types, defaults, icon picker, and the settings tab.

Overhaul increment 1 — information architecture:
  • Three top-level bands that follow the pipeline, not the data model:
      Sources  →  Matching  →  Presentation   (+ General at the end)
  • The PDF index moves up into "Sources" — it CREATES the card notes whose
    Contents headings are later searched, so it belongs at the start.
  • Panel visibility is now a rule (all / only-in / except), no longer tied to
    the library folder.
  • Group editor is a card with labelled fields and a collapsible "where to
    search" block.
Search-target shape, per-group term source, and per-target options are handled
in later increments — DisplaySettings / BehaviorSettings / SearchTargets are
left unchanged here so main.ts keeps compiling.
═══════════════════════════════════════════════════════════════════════════ */

import { App, Modal, PluginSettingTab, Setting, setIcon, setTooltip, debounce } from 'obsidian';
import type LibrarySearchPlugin from './main';
import {
    PdfOutlineSettings,
    DEFAULT_PDF_OUTLINE_SETTINGS,
    renderPdfOutlineSettings,
} from './pdf-outline';
import { t, setLanguage, Lang } from './i18n';
import { LUCIDE_ICONS, LucideIconEntry } from './icons';

/* ─── Settings types & defaults ─────────────────────────────────────────── */

export type HeadingOutputMode = 'heading-only' | 'with-excerpt' | 'with-section';

/** Headings target — output mode and its size limits live here, per group. */
export interface HeadingTarget {
    enabled: boolean;
    output: HeadingOutputMode;
    excerptMaxLines: number;
    sectionMaxChars: number;
}
/** Callouts target — search titles and/or bodies, optionally limited to types. */
export interface CalloutTarget {
    titles: boolean;
    bodies: boolean;
    types: string[];            // restrict to these callout types (lowercase); empty = any
    showSnippet: boolean;
    snippetContextChars: number;
}
/** Full note body target. */
export interface BodyTarget {
    enabled: boolean;
    showSnippet: boolean;
    snippetContextChars: number;
}
/** List items / tasks target. */
export interface ListTarget {
    enabled: boolean;
    includeTasks: boolean;      // also match checkbox/task items
    onlyUnchecked: boolean;     // among tasks, only unchecked ones
    showSnippet: boolean;
    snippetContextChars: number;
}

export interface SearchTargets {
    headings: HeadingTarget;
    callouts: CalloutTarget;
    frontmatterFields: string[];
    body: BodyTarget;
    filename: boolean;
    lists: ListTarget;
}

/** A fresh target set with sensible defaults. Used for new groups, the
 *  built-in defaults, and as the migration base for legacy boolean targets. */
export function defaultTargets(): SearchTargets {
    return {
        headings: { enabled: true, output: 'heading-only', excerptMaxLines: 3, sectionMaxChars: 400 },
        callouts: { titles: true, bodies: false, types: [], showSnippet: true, snippetContextChars: 90 },
        frontmatterFields: [],
        body: { enabled: false, showSnippet: true, snippetContextChars: 90 },
        filename: false,
        lists: { enabled: false, includeTasks: true, onlyUnchecked: false, showSnippet: true, snippetContextChars: 90 },
    };
}

/** Global result-display options. Per-match formatting (heading output mode,
 *  snippets) now lives inside each group's SearchTargets. */
export interface DisplaySettings {
    showTags: boolean;
    showFilePath: boolean;
    groupByType: boolean;
}

export interface BehaviorSettings {
    caseSensitive: boolean;
    wholeWord: boolean;
    maxMatchesPerFile: number;
}

/** Where the inline panel may appear.
 *  'all'    — every note (default)
 *  'only'   — only inside the listed folders
 *  'except' — everywhere except the listed folders */
export type PanelScope = 'all' | 'only' | 'except';

export interface PanelSettings {
    enabled: boolean;
    position: 'top' | 'bottom';
    readingMode: boolean;
    collapsedByDefault: boolean;
    title: string;
    scope: PanelScope;
    folders: string[];   // used by 'only' / 'except'; ignored for 'all'
}

export interface GroupRule {
    name: string;
    property: string;
    values: string[];
    icon: string;
    /** Per-group term source. Undefined → use the global `settings.terms`. */
    terms?: TermSourceSettings;
    targets: SearchTargets;
}

export interface TermSourceSettings {
    source: 'aliases' | 'property';
    property: string;
}

export interface LibrarySearchSettings {
    language: 'en' | 'ru';
    libraryFolder: string;
    terms: TermSourceSettings;
    groups: GroupRule[];
    display: DisplaySettings;
    behavior: BehaviorSettings;
    panel: PanelSettings;
    pdfOutline: PdfOutlineSettings;
}

export const DEFAULT_SETTINGS: LibrarySearchSettings = {
    language: 'en',
    libraryFolder: '',
    terms: { source: 'aliases', property: '' },
    groups: [
        { name: 'Books', property: 'type', values: ['book'], icon: 'book-open',
          targets: { ...defaultTargets(), frontmatterFields: ['description'] } },
        { name: 'Articles', property: 'type', values: ['article'], icon: 'file-text',
          targets: { ...defaultTargets(), frontmatterFields: ['abstract'] } },
    ],
    display: {
        showTags: true,
        showFilePath: false,
        groupByType: true,
    },
    behavior: {
        caseSensitive: false,
        wholeWord: false,
        maxMatchesPerFile: 0,
    },
    panel: {
        enabled: true,
        position: 'top',
        readingMode: true,
        collapsedByDefault: false,
        title: 'Library',
        scope: 'all',
        folders: [],
    },
    pdfOutline: DEFAULT_PDF_OUTLINE_SETTINGS,
};

/* ─── Icon picker ───────────────────────────────────────────────────────── */

class IconPickerModal extends Modal {
    private onSelect: (iconId: string) => void;
    private current: string;
    private filter = '';

    constructor(app: App, currentIcon: string, onSelect: (iconId: string) => void) {
        super(app);
        this.current = currentIcon;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lsv-icon-picker');

        const searchInput = contentEl.createEl('input', {
            type: 'text',
            cls: 'lsv-icon-picker-search',
            placeholder: t('settings.pickIcon') + '…',
        });

        const gridContainer = contentEl.createDiv();

        searchInput.addEventListener('input', () => {
            this.filter = searchInput.value.trim().toLowerCase();
            this.renderGrid(contentEl, gridContainer);
        });

        this.renderGrid(contentEl, gridContainer);
    }

    private renderGrid(contentEl: HTMLElement, container: HTMLElement) {
        container.empty();
        const filtered = this.filter
            ? LUCIDE_ICONS.filter(ic => ic.label.toLowerCase().includes(this.filter) || ic.category.toLowerCase().includes(this.filter))
            : LUCIDE_ICONS;

        if (filtered.length === 0) {
            container.createDiv({ cls: 'lsv-icon-picker-empty', text: t('ui.noResults') });
            return;
        }

        const categories = new Map<string, LucideIconEntry[]>();
        for (const ic of filtered) {
            let arr = categories.get(ic.category);
            if (!arr) { arr = []; categories.set(ic.category, arr); }
            arr.push(ic);
        }

        for (const [cat, icons] of categories) {
            container.createDiv({ cls: 'lsv-icon-picker-category', text: cat });
            const grid = container.createDiv({ cls: 'lsv-icon-picker-grid' });
            for (const ic of icons) {
                const cell = grid.createDiv({ cls: 'lsv-icon-picker-cell' });
                if (ic.value === this.current) {
                    cell.addClass('lsv-icon-picker-cell--selected');
                }
                const iconSpan = cell.createSpan();
                setIcon(iconSpan, ic.value);
                cell.createDiv({ cls: 'lsv-icon-picker-cell-name', text: ic.label });
                cell.addEventListener('click', () => {
                    this.onSelect(ic.value);
                    this.close();
                });
            }
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

/* ─── Settings tab ──────────────────────────────────────────────────────── */

export class LibrarySearchSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: LibrarySearchPlugin) { super(app, plugin); }

    private saveDebounced    = debounce(() => { void this.plugin.saveSettings(); }, 400, false);
    private refreshDebounced = debounce(() => { this.plugin.refreshPanels(true); }, 400, false);

    /** Cancel any pending debounced save then save synchronously — prevents toggle
     *  firing before a text-input debounce and writing a stale value. */
    private async saveFlushed(): Promise<void> {
        this.saveDebounced.cancel();
        await this.plugin.saveSettings();
    }

    hide() {
        this.saveDebounced.cancel();
        this.refreshDebounced.cancel();
        void this.plugin.saveSettings();
        this.plugin.refreshPanels(true);
    }

    /** Top-level band header (custom styled, the larger of the two levels). */
    private band(el: HTMLElement, title: string, desc?: string) {
        el.createDiv({ text: title, cls: 'lsv-settings-section' });
        if (desc) el.createDiv({ text: desc, cls: 'setting-item-description' });
    }

    /** Hybrid description strategy: primary settings keep a visible
     *  `.setDesc()` line; the dense per-target sub-settings revealed inside a
     *  group's "Where to search" block (output mode, char/line limits,
     *  callout types, snippet toggles…) instead get a small (i) icon next to
     *  their name, with the explanation as a hover tooltip. Those rows are
     *  already nested under a toggle the user deliberately turned on, so the
     *  reclaimed vertical space matters more there than the visible-by-default
     *  guarantee that primary settings need. */
    private infoTip(setting: Setting, text: string) {
        const icon = setting.nameEl.createSpan({ cls: 'lsv-info-icon' });
        setIcon(icon, 'info');
        setTooltip(icon, text);
    }

    display() {
        const { containerEl: el } = this;
        const s = this.plugin.settings;
        el.empty();

        /* ── Intro: how it works ───────────────────────────────────────── */
        const guide = el.createDiv({ cls: 'pdfo-guide setting-item-description' });
        guide.createDiv({ text: t('settings.guideTitle'), cls: 'pdfo-guide-title' });
        ['settings.guideStep1', 'settings.guideStep2', 'settings.guideStep3']
            .forEach(k => guide.createDiv({ text: t(k), cls: 'pdfo-guide-step' }));

        /* ════════════════════════════════════════════════════════════════
           BAND 1 — SOURCES: where the searchable notes come from
        ═══════════════════════════════════════════════════════════════════ */
        this.band(el, t('settings.sources'), t('settings.sourcesDesc'));

        new Setting(el)
            .setName(t('settings.libraryFolder'))
            .setDesc(t('settings.libraryFolderDesc'))
            .addText(text => text.setValue(s.libraryFolder).onChange(v => {
                s.libraryFolder = v.trim();
                this.saveDebounced();
            }));

        // The PDF index lives here: it produces the card notes (with their
        // Contents headings) that the search below indexes.
        new Setting(el).setName(t('settings.pdfSection')).setHeading();
        el.createDiv({ text: t('settings.pdfIntro'), cls: 'setting-item-description' });
        renderPdfOutlineSettings(el, s.pdfOutline, () => this.saveFlushed());

        /* ════════════════════════════════════════════════════════════════
           BAND 2 — MATCHING: terms, groups, and search behaviour
        ═══════════════════════════════════════════════════════════════════ */
        this.band(el, t('settings.matching'), t('settings.matchingDesc'));

        /* ── Search-term source (global default) ───────────────────────── */
        let termPropSetting: Setting;
        new Setting(el)
            .setName(t('settings.termSource'))
            .setDesc(t('settings.termSourceDesc'))
            .addDropdown(d => d
                .addOption('aliases', t('settings.termSourceAliases'))
                .addOption('property', t('settings.termSourceProperty'))
                .setValue(s.terms.source)
                .onChange(async v => {
                    s.terms.source = v as 'aliases' | 'property';
                    await this.saveFlushed();
                    termPropSetting.settingEl.style.display = s.terms.source === 'property' ? '' : 'none';
                    this.plugin.refreshPanels(true);
                }));

        termPropSetting = new Setting(el)
            .setName(t('settings.termProperty'))
            .setDesc(t('settings.termPropertyDesc'))
            .addText(text => text.setValue(s.terms.property).onChange(v => {
                s.terms.property = v.trim();
                this.saveDebounced();
                this.refreshDebounced();
            }));
        termPropSetting.settingEl.style.display = s.terms.source === 'property' ? '' : 'none';

        /* ── Result groups ─────────────────────────────────────────────── */
        new Setting(el).setName(t('settings.resultGroups')).setHeading();
        el.createDiv({ text: t('settings.resultGroupsDesc'), cls: 'setting-item-description' });

        // "Split results by group" sits right next to the groups it controls.
        new Setting(el).setName(t('settings.groupByType')).setDesc(t('settings.groupByTypeDesc'))
            .addToggle(toggle => toggle.setValue(s.display.groupByType)
                .onChange(async v => { s.display.groupByType = v; await this.saveFlushed(); }));

        const groupsWrap = el.createDiv({ cls: 'lsv-groups-editor' });

        const renderGroups = () => {
            groupsWrap.empty();
            s.groups.forEach((g, i) => {
                if (!g.targets || typeof (g.targets as unknown as Record<string, unknown>).headings !== 'object') g.targets = defaultTargets();
                if (typeof g.property !== 'string') g.property = 'type';
                if (!Array.isArray(g.values)) g.values = [];

                const card = groupsWrap.createDiv({ cls: 'lsv-group-card' });

                /* Identity row: icon · name · delete */
                const idRow = new Setting(card).setClass('lsv-group-id-row');
                idRow.addButton(b => {
                    b.setClass('lsv-icon-picker-btn');
                    const iconSpan = b.buttonEl.createSpan({ cls: 'lsv-icon-picker-btn-icon' });
                    setIcon(iconSpan, g.icon);
                    b.setTooltip(t('settings.pickIcon'));
                    b.onClick(() => {
                        new IconPickerModal(this.app, g.icon, (iconId) => {
                            void (async () => {
                                g.icon = iconId;
                                await this.saveFlushed();
                                renderGroups();
                            })();
                        }).open();
                    });
                });
                idRow.addText(txt => txt.setPlaceholder(t('settings.groupNamePh')).setValue(g.name).onChange(v => {
                    g.name = v; this.saveDebounced();
                }));
                idRow.addExtraButton(b => b.setIcon('trash-2').setTooltip(t('settings.deleteGroup')).onClick(async () => {
                    s.groups.splice(i, 1); await this.saveFlushed(); renderGroups();
                }));

                /* Membership rule — each field on its own labelled row */
                new Setting(card)
                    .setName(t('settings.groupProperty'))
                    .setDesc(t('settings.groupPropertyDesc'))
                    .addText(txt => txt.setPlaceholder(t('settings.groupPropertyPh')).setValue(g.property).onChange(v => {
                        g.property = v.trim() || 'type'; this.saveDebounced();
                    }));
                new Setting(card)
                    .setName(t('settings.groupValues'))
                    .setDesc(t('settings.groupValuesDesc'))
                    .addText(txt => txt.setPlaceholder(t('settings.groupValuesPh')).setValue(g.values.join(', ')).onChange(v => {
                        g.values = v.split(',').map(x => x.trim()).filter(Boolean); this.saveDebounced();
                    }));

                /* Collapsible per-group term-source override (default = global) */
                const effSrc = (): TermSourceSettings => g.terms ?? s.terms;
                const termsSummaryText = () => {
                    if (!g.terms) return t('settings.groupTermsDefault');
                    return g.terms.source === 'property'
                        ? `${t('settings.termSourceProperty')}: ${g.terms.property || '—'}`
                        : t('settings.termSourceAliases');
                };
                const termsDetails = card.createEl('details', { cls: 'lsv-group-terms-details' });
                const termsSummary = termsDetails.createEl('summary', { cls: 'lsv-group-targets-summary' });
                termsSummary.createSpan({ text: t('settings.groupTermsSummary') + ': ' });
                const termsVal = termsSummary.createSpan({ cls: 'lsv-group-targets-summary-val', text: termsSummaryText() });
                const refreshTermsSummary = () => termsVal.setText(termsSummaryText());

                const termsBody = termsDetails.createDiv({ cls: 'lsv-group-targets' });
                let grpSrcSetting: Setting;
                let grpPropSetting: Setting;
                const updateTermsVis = () => {
                    const own = !!g.terms;
                    grpSrcSetting.settingEl.style.display = own ? '' : 'none';
                    grpPropSetting.settingEl.style.display = own && g.terms?.source === 'property' ? '' : 'none';
                };

                new Setting(termsBody)
                    .setName(t('settings.groupTermsOwn'))
                    .setDesc(t('settings.groupTermsOwnDesc'))
                    .addToggle(tg => tg.setValue(!!g.terms).onChange(async val => {
                        g.terms = val ? { source: s.terms.source, property: s.terms.property } : undefined;
                        refreshTermsSummary(); updateTermsVis();
                        await this.saveFlushed(); this.plugin.refreshPanels(true);
                    }));

                grpSrcSetting = new Setting(termsBody)
                    .setName(t('settings.termSource'))
                    .addDropdown(d => d
                        .addOption('aliases', t('settings.termSourceAliases'))
                        .addOption('property', t('settings.termSourceProperty'))
                        .setValue(effSrc().source)
                        .onChange(async v => {
                            if (!g.terms) g.terms = { source: 'aliases', property: '' };
                            g.terms.source = v as 'aliases' | 'property';
                            refreshTermsSummary(); updateTermsVis();
                            await this.saveFlushed(); this.plugin.refreshPanels(true);
                        }));

                grpPropSetting = new Setting(termsBody)
                    .setName(t('settings.termProperty'))
                    .setDesc(t('settings.termPropertyDesc'))
                    .addText(tx => tx.setValue(effSrc().property).onChange(v => {
                        if (!g.terms) g.terms = { source: 'property', property: '' };
                        g.terms.property = v.trim();
                        refreshTermsSummary();
                        this.saveDebounced(); this.refreshDebounced();
                    }));

                updateTermsVis();

                /* Collapsible "where to search" block with a live summary */
                const T = g.targets;
                const summaryOf = () => {
                    const names: string[] = [];
                    if (T.headings.enabled) names.push(t('settings.headings'));
                    if (T.callouts.titles || T.callouts.bodies) names.push(t('settings.callouts'));
                    if (T.frontmatterFields.length) names.push(t('settings.frontmatterFields'));
                    if (T.body.enabled) names.push(t('settings.noteBody'));
                    if (T.lists.enabled) names.push(t('settings.lists'));
                    if (T.filename) names.push(t('settings.filename'));
                    return names.join(', ') || '—';
                };

                const details = card.createEl('details', { cls: 'lsv-group-targets-details' });
                const summary = details.createEl('summary', { cls: 'lsv-group-targets-summary' });
                summary.createSpan({ text: t('settings.whereToSearch') + ': ' });
                const summaryVal = summary.createSpan({ cls: 'lsv-group-targets-summary-val', text: summaryOf() });
                const refreshSummary = () => summaryVal.setText(summaryOf());

                const tgt = details.createDiv({ cls: 'lsv-group-targets' });
                const save = async () => { refreshSummary(); await this.saveFlushed(); };

                /* — Headings (fast) — */
                let hOut: Setting, hExcerpt: Setting, hSection: Setting;
                const hVis = () => {
                    const on = T.headings.enabled;
                    hOut.settingEl.style.display = on ? '' : 'none';
                    hExcerpt.settingEl.style.display = on && T.headings.output === 'with-excerpt' ? '' : 'none';
                    hSection.settingEl.style.display = on && T.headings.output !== 'heading-only' ? '' : 'none';
                };
                new Setting(tgt).setName(t('settings.headings')).setDesc(t('settings.headingsDesc'))
                    .addToggle(tg => tg.setValue(T.headings.enabled).onChange(async v => { T.headings.enabled = v; hVis(); await save(); }));
                hOut = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.headingOutputMode'))
                    .addDropdown(d => d
                        .addOption('heading-only', t('settings.headingOnly'))
                        .addOption('with-excerpt', t('settings.withExcerpt'))
                        .addOption('with-section', t('settings.withSection'))
                        .setValue(T.headings.output)
                        .onChange(async v => { T.headings.output = v as HeadingOutputMode; hVis(); await this.saveFlushed(); }));
                this.infoTip(hOut, t('settings.headingOutputModeDesc'));
                hExcerpt = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.excerptMaxLines'))
                    .addText(tx => tx.setValue(String(T.headings.excerptMaxLines)).onChange(v => {
                        const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) { T.headings.excerptMaxLines = n; this.saveDebounced(); }
                    }));
                this.infoTip(hExcerpt, t('settings.excerptMaxLinesDesc'));
                hSection = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.sectionMaxChars'))
                    .addText(tx => tx.setValue(String(T.headings.sectionMaxChars)).onChange(v => {
                        const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) { T.headings.sectionMaxChars = n; this.saveDebounced(); }
                    }));
                this.infoTip(hSection, t('settings.sectionMaxCharsDesc'));
                hVis();

                /* — Callouts — */
                let cTypes: Setting, cSnip: Setting, cSnipChars: Setting;
                const cVis = () => {
                    const any = T.callouts.titles || T.callouts.bodies;
                    cTypes.settingEl.style.display = any ? '' : 'none';
                    cSnip.settingEl.style.display = T.callouts.bodies ? '' : 'none';
                    cSnipChars.settingEl.style.display = T.callouts.bodies && T.callouts.showSnippet ? '' : 'none';
                };
                new Setting(tgt).setName(t('settings.calloutTitles')).setDesc(t('settings.calloutTitlesDesc'))
                    .addToggle(tg => tg.setValue(T.callouts.titles).onChange(async v => { T.callouts.titles = v; cVis(); await save(); }));
                new Setting(tgt).setName(t('settings.calloutBodies')).setDesc(t('settings.calloutBodiesDesc'))
                    .addToggle(tg => tg.setValue(T.callouts.bodies).onChange(async v => { T.callouts.bodies = v; cVis(); await save(); }));
                cTypes = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.calloutTypes'))
                    .addText(tx => tx.setValue(T.callouts.types.join(', ')).onChange(v => {
                        T.callouts.types = v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean); this.saveDebounced();
                    }));
                this.infoTip(cTypes, t('settings.calloutTypesDesc'));
                cSnip = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.showBodySnippet'))
                    .addToggle(tg => tg.setValue(T.callouts.showSnippet).onChange(async v => { T.callouts.showSnippet = v; cVis(); await this.saveFlushed(); }));
                this.infoTip(cSnip, t('settings.showBodySnippetDesc'));
                cSnipChars = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.snippetContextChars'))
                    .addText(tx => tx.setValue(String(T.callouts.snippetContextChars)).onChange(v => {
                        const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { T.callouts.snippetContextChars = n; this.saveDebounced(); }
                    }));
                this.infoTip(cSnipChars, t('settings.snippetContextCharsDesc'));
                cVis();

                /* — Frontmatter fields — */
                new Setting(tgt).setName(t('settings.frontmatterFields')).setDesc(t('settings.frontmatterFieldsDesc'))
                    .addText(tx => tx.setValue(T.frontmatterFields.join(', ')).onChange(v => {
                        T.frontmatterFields = v.split(',').map(x => x.trim()).filter(Boolean); refreshSummary(); this.saveDebounced();
                    }));

                /* — Full note text (slow) — */
                let bSnip: Setting, bSnipChars: Setting;
                const bVis = () => {
                    bSnip.settingEl.style.display = T.body.enabled ? '' : 'none';
                    bSnipChars.settingEl.style.display = T.body.enabled && T.body.showSnippet ? '' : 'none';
                };
                new Setting(tgt).setName(t('settings.noteBody')).setDesc(t('settings.noteBodyDesc'))
                    .addToggle(tg => tg.setValue(T.body.enabled).onChange(async v => { T.body.enabled = v; bVis(); await save(); }));
                bSnip = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.showBodySnippet'))
                    .addToggle(tg => tg.setValue(T.body.showSnippet).onChange(async v => { T.body.showSnippet = v; bVis(); await this.saveFlushed(); }));
                this.infoTip(bSnip, t('settings.showBodySnippetDesc'));
                bSnipChars = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.snippetContextChars'))
                    .addText(tx => tx.setValue(String(T.body.snippetContextChars)).onChange(v => {
                        const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { T.body.snippetContextChars = n; this.saveDebounced(); }
                    }));
                this.infoTip(bSnipChars, t('settings.snippetContextCharsDesc'));
                bVis();

                /* — Lists & tasks — */
                let lTasks: Setting, lUnchecked: Setting;
                const lVis = () => {
                    lTasks.settingEl.style.display = T.lists.enabled ? '' : 'none';
                    lUnchecked.settingEl.style.display = T.lists.enabled && T.lists.includeTasks ? '' : 'none';
                };
                new Setting(tgt).setName(t('settings.lists')).setDesc(t('settings.listsDesc'))
                    .addToggle(tg => tg.setValue(T.lists.enabled).onChange(async v => { T.lists.enabled = v; lVis(); await save(); }));
                lTasks = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.includeTasks'))
                    .addToggle(tg => tg.setValue(T.lists.includeTasks).onChange(async v => { T.lists.includeTasks = v; lVis(); await this.saveFlushed(); }));
                this.infoTip(lTasks, t('settings.includeTasksDesc'));
                lUnchecked = new Setting(tgt).setClass('lsv-target-sub').setName(t('settings.onlyUnchecked'))
                    .addToggle(tg => tg.setValue(T.lists.onlyUnchecked).onChange(async v => { T.lists.onlyUnchecked = v; await this.saveFlushed(); }));
                this.infoTip(lUnchecked, t('settings.onlyUncheckedDesc'));
                lVis();

                /* — Filename — */
                new Setting(tgt).setName(t('settings.filename')).setDesc(t('settings.filenameDesc'))
                    .addToggle(tg => tg.setValue(T.filename).onChange(async v => { T.filename = v; await save(); }));
            });

            new Setting(groupsWrap).addButton(b => b.setButtonText(t('settings.addGroup')).onClick(async () => {
                s.groups.push({
                    name: t('settings.newGroup'), property: 'type', values: [], icon: 'folder',
                    targets: defaultTargets()
                });
                await this.saveFlushed(); renderGroups();
            }));
        };
        renderGroups();

        /* ── Search behaviour (applies to all groups) ──────────────────── */
        new Setting(el).setName(t('settings.searchBehavior')).setHeading();

        new Setting(el).setName(t('settings.caseSensitive')).setDesc(t('settings.caseSensitiveDesc'))
            .addToggle(toggle => toggle.setValue(s.behavior.caseSensitive).onChange(async v => { s.behavior.caseSensitive = v; await this.saveFlushed(); }));

        new Setting(el).setName(t('settings.wholeWord')).setDesc(t('settings.wholeWordDesc'))
            .addToggle(toggle => toggle.setValue(s.behavior.wholeWord).onChange(async v => { s.behavior.wholeWord = v; await this.saveFlushed(); }));

        new Setting(el).setName(t('settings.maxMatchesPerFile')).setDesc(t('settings.maxMatchesPerFileDesc'))
            .addText(text => text.setValue(String(s.behavior.maxMatchesPerFile)).onChange(v => {
                const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) { s.behavior.maxMatchesPerFile = n; this.saveDebounced(); }
            }));

        /* ════════════════════════════════════════════════════════════════
           BAND 3 — PRESENTATION: where & how results appear
        ═══════════════════════════════════════════════════════════════════ */
        this.band(el, t('settings.presentation'), t('settings.presentationDesc'));

        /* ── Inline note panel ─────────────────────────────────────────── */
        new Setting(el).setName(t('settings.inlinePanel')).setHeading();

        new Setting(el).setName(t('settings.enablePanel')).setDesc(t('settings.enablePanelDesc'))
            .addToggle(toggle => toggle.setValue(s.panel.enabled).onChange(async v => { s.panel.enabled = v; await this.saveFlushed(); this.plugin.refreshPanels(true); }));

        new Setting(el).setName(t('settings.panelPosition')).setDesc(t('settings.panelPositionDesc'))
            .addDropdown(d => d.addOption('top', t('settings.top')).addOption('bottom', t('settings.bottom'))
                .setValue(s.panel.position).onChange(async v => { s.panel.position = v as 'top' | 'bottom'; await this.saveFlushed(); this.plugin.refreshPanels(true); }));

        new Setting(el).setName(t('settings.readingMode')).setDesc(t('settings.readingModeDesc'))
            .addToggle(toggle => toggle.setValue(s.panel.readingMode).onChange(async v => { s.panel.readingMode = v; await this.saveFlushed(); this.plugin.refreshPanels(true); }));

        new Setting(el).setName(t('settings.collapsedDefault')).setDesc(t('settings.collapsedDefaultDesc'))
            .addToggle(toggle => toggle.setValue(s.panel.collapsedByDefault).onChange(async v => { s.panel.collapsedByDefault = v; await this.saveFlushed(); }));

        new Setting(el).setName(t('settings.panelTitle')).setDesc(t('settings.panelTitleDesc'))
            .addText(text => text.setValue(s.panel.title).onChange(v => { s.panel.title = v; this.saveDebounced(); this.refreshDebounced(); }));

        // Visibility rule: all notes / only-in / except. Replaces the old
        // "trigger folders default to the library folder" behaviour.
        let panelFoldersSetting: Setting;
        new Setting(el).setName(t('settings.panelScope')).setDesc(t('settings.panelScopeDesc'))
            .addDropdown(d => d
                .addOption('all', t('settings.scopeAll'))
                .addOption('only', t('settings.scopeOnly'))
                .addOption('except', t('settings.scopeExcept'))
                .setValue(s.panel.scope)
                .onChange(async v => {
                    s.panel.scope = v as PanelScope;
                    await this.saveFlushed();
                    panelFoldersSetting.settingEl.style.display = s.panel.scope === 'all' ? 'none' : '';
                    this.plugin.refreshPanels(true);
                }));

        panelFoldersSetting = new Setting(el).setName(t('settings.panelFolders')).setDesc(t('settings.panelFoldersDesc'))
            .addText(text => text.setValue(s.panel.folders.join(', ')).onChange(v => {
                s.panel.folders = v.split(',').map(x => x.trim()).filter(Boolean);
                this.saveDebounced();
                this.refreshDebounced();
            }));
        panelFoldersSetting.settingEl.style.display = s.panel.scope === 'all' ? 'none' : '';

        /* ── Result display ────────────────────────────────────────────── */
        new Setting(el).setName(t('settings.displayResults')).setHeading();
        el.createDiv({ text: t('settings.perTargetNote'), cls: 'setting-item-description' });

        new Setting(el).setName(t('settings.showTags')).setDesc(t('settings.showTagsDesc'))
            .addToggle(toggle => toggle.setValue(s.display.showTags).onChange(async v => { s.display.showTags = v; await this.saveFlushed(); }));

        new Setting(el).setName(t('settings.showFilePath')).setDesc(t('settings.showFilePathDesc'))
            .addToggle(toggle => toggle.setValue(s.display.showFilePath).onChange(async v => { s.display.showFilePath = v; await this.saveFlushed(); }));

        /* ════════════════════════════════════════════════════════════════
           GENERAL
        ═══════════════════════════════════════════════════════════════════ */
        this.band(el, t('settings.general'));

        new Setting(el)
            .setName(t('settings.language'))
            .setDesc(t('settings.languageDesc'))
            .addDropdown(d => d
                .addOption('en', 'English')
                .addOption('ru', 'Русский')
                .setValue(s.language)
                .onChange(async v => {
                    s.language = v as Lang;
                    setLanguage(s.language);
                    await this.saveFlushed();
                    this.display();
                    this.plugin.refreshPanels(true);
                }));
    }
}