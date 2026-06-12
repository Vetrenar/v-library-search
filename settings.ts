/* ════════════════════════════════════════════════════════════════════════════
SETTINGS — types, defaults, icon picker, and the settings tab.
═══════════════════════════════════════════════════════════════════════════ */

import { App, Modal, PluginSettingTab, Setting, setIcon, debounce } from 'obsidian';
import type LibrarySearchPlugin from './main';
import {
    PdfOutlineSettings,
    DEFAULT_PDF_OUTLINE_SETTINGS,
    renderPdfOutlineSettings,
} from './pdf-outline';
import { t, setLanguage, Lang } from './i18n';
import { LUCIDE_ICONS, LucideIconEntry } from './icons';

/* ─── Settings types & defaults ─────────────────────────────────────────── */

export interface SearchTargets {
    headings: boolean;
    calloutTitles: boolean;
    calloutBodies: boolean;
    frontmatterFields: string[];
    noteBody: boolean;
    filename: boolean;
}

export type HeadingOutputMode = 'heading-only' | 'with-excerpt' | 'with-section';

export interface DisplaySettings {
    headingOutputMode: HeadingOutputMode;
    excerptMaxLines: number;
    sectionMaxChars: number;
    showBodySnippet: boolean;
    snippetContextChars: number;
    showTags: boolean;
    showFilePath: boolean;
    groupByType: boolean;
}

export interface BehaviorSettings {
    caseSensitive: boolean;
    wholeWord: boolean;
    maxMatchesPerFile: number;
}

export interface PanelSettings {
    enabled: boolean;
    position: 'top' | 'bottom';
    readingMode: boolean;
    collapsedByDefault: boolean;
    title: string;
    triggerFolders: string[];
}

export interface GroupRule {
    name: string;
    property: string;
    values: string[];
    icon: string;
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
          targets: { headings: true, calloutTitles: true, calloutBodies: false, frontmatterFields: ['description'], noteBody: false, filename: false } },
        { name: 'Articles', property: 'type', values: ['article'], icon: 'file-text',
          targets: { headings: true, calloutTitles: true, calloutBodies: false, frontmatterFields: ['abstract'], noteBody: false, filename: false } },
    ],
    display: {
        headingOutputMode: 'heading-only',
        excerptMaxLines: 3,
        sectionMaxChars: 400,
        showBodySnippet: true,
        snippetContextChars: 90,
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
        triggerFolders: [],
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

    display() {
        const { containerEl: el } = this;
        const s = this.plugin.settings;
        el.empty();

        /* ── Language ──────────────────────────────────────────────────── */
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

        /* ── Library & Types ───────────────────────────────────────────── */
        el.createDiv({ text: t('settings.library'), cls: 'lsv-settings-section' });

        new Setting(el)
            .setName(t('settings.libraryFolder'))
            .setDesc(t('settings.libraryFolderDesc'))
            .addText(text => text.setValue(s.libraryFolder).onChange(v => {
                s.libraryFolder = v.trim();
                this.saveDebounced();
            }));

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

        el.createDiv({ text: t('settings.resultGroups'), cls: 'lsv-settings-section' });
        el.createDiv({ text: t('settings.resultGroupsDesc'), cls: 'setting-item-description' });
        
        const groupsWrap = el.createDiv({ cls: 'lsv-groups-editor' });
        
        const renderGroups = () => {
            groupsWrap.empty();
            s.groups.forEach((g, i) => {
                if (!g.targets) g.targets = { headings: true, calloutTitles: true, calloutBodies: false, frontmatterFields: [], noteBody: false, filename: false };
                if (typeof g.property !== 'string') g.property = 'type';
                if (!Array.isArray(g.values)) g.values = [];

                const row = new Setting(groupsWrap);
                row.addText(txt => txt.setPlaceholder(t('settings.groupNamePh')).setValue(g.name).onChange(v => {
                    g.name = v; this.saveDebounced();
                }));
                row.addText(txt => txt.setPlaceholder(t('settings.groupPropertyPh')).setValue(g.property).onChange(v => {
                    g.property = v.trim() || 'type'; this.saveDebounced();
                }));
                row.addText(txt => txt.setPlaceholder(t('settings.groupValuesPh')).setValue(g.values.join(', ')).onChange(v => {
                    g.values = v.split(',').map(x => x.trim()).filter(Boolean); this.saveDebounced();
                }));
                
                row.addButton(b => {
                    b.setClass('lsv-icon-picker-btn');
                    const iconSpan = b.buttonEl.createSpan({ cls: 'lsv-icon-picker-btn-icon' });
                    setIcon(iconSpan, g.icon);
                    b.buttonEl.createSpan({ text: ' ' + g.icon });
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
                
                row.addExtraButton(b => b.setIcon('trash-2').setTooltip(t('settings.deleteGroup')).onClick(async () => {
                    s.groups.splice(i, 1); await this.saveFlushed(); renderGroups();
                }));
                row.settingEl.addClass('lsv-group-row');

                const tgt = groupsWrap.createDiv({ cls: 'lsv-group-targets' });
                tgt.createDiv({ text: t('settings.whereToSearch'), cls: 'setting-item-description' });
                
                const mkToggle = (label: string, desc: string, get: () => boolean, set: (val: boolean) => void) =>
                    new Setting(tgt).setName(label).setDesc(desc).addToggle(tg => tg.setValue(get())
                        .onChange(async val => { set(val); await this.saveFlushed(); }));
                        
                mkToggle(t('settings.headings'),       t('settings.headingsDesc'),       () => g.targets.headings,       val => g.targets.headings = val);
                mkToggle(t('settings.calloutTitles'),  t('settings.calloutTitlesDesc'),  () => g.targets.calloutTitles,  val => g.targets.calloutTitles = val);
                mkToggle(t('settings.calloutBodies'),  t('settings.calloutBodiesDesc'),  () => g.targets.calloutBodies,  val => g.targets.calloutBodies = val);
                mkToggle(t('settings.noteBody'),       t('settings.noteBodyDesc'),       () => g.targets.noteBody,       val => g.targets.noteBody = val);
                mkToggle(t('settings.filename'),       t('settings.filenameDesc'),       () => g.targets.filename,       val => g.targets.filename = val);
                
                new Setting(tgt).setName(t('settings.frontmatterFields'))
                    .setDesc(t('settings.frontmatterFieldsDesc'))
                    .addText(tx => tx.setValue(g.targets.frontmatterFields.join(', '))
                        .onChange(val => {
                            g.targets.frontmatterFields = val.split(',').map(x => x.trim()).filter(Boolean);
                            this.saveDebounced();
                        }));
            });
            
            new Setting(groupsWrap).addButton(b => b.setButtonText(t('settings.addGroup')).onClick(async () => {
                s.groups.push({ 
                    name: t('settings.newGroup'), property: 'type', values: [], icon: 'folder', 
                    targets: { headings: true, calloutTitles: true, calloutBodies: false, frontmatterFields: [], noteBody: false, filename: false } 
                });
                await this.saveFlushed(); renderGroups();
            }));
        };
        renderGroups();

        /* ── Inline note panel ─────────────────────────────────────────── */
        el.createDiv({ text: t('settings.inlinePanel'), cls: 'lsv-settings-section' });

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
            
        new Setting(el).setName(t('settings.triggerFolders')).setDesc(t('settings.triggerFoldersDesc'))
            .addText(text => text.setValue(s.panel.triggerFolders.join(', ')).onChange(v => { s.panel.triggerFolders = v.split(',').map(x => x.trim()).filter(Boolean); this.saveDebounced(); this.refreshDebounced(); }));

        /* ── Display ───────────────────────────────────────────────────── */
        el.createDiv({ text: t('settings.displayResults'), cls: 'lsv-settings-section' });

        let excerptLinesSetting: Setting;
        let sectionCharsSetting: Setting;

        new Setting(el).setName(t('settings.headingOutputMode')).setDesc(t('settings.headingOutputModeDesc'))
            .addDropdown(d => d
                .addOption('heading-only', t('settings.headingOnly'))
                .addOption('with-excerpt', t('settings.withExcerpt'))
                .addOption('with-section', t('settings.withSection'))
                .setValue(s.display.headingOutputMode)
                .onChange(async v => {
                    s.display.headingOutputMode = v as HeadingOutputMode;
                    await this.saveFlushed();
                    const mode = s.display.headingOutputMode;
                    excerptLinesSetting.settingEl.style.display = mode === 'with-excerpt' ? '' : 'none';
                    sectionCharsSetting.settingEl.style.display = mode !== 'heading-only' ? '' : 'none';
                }));

        excerptLinesSetting = new Setting(el).setName(t('settings.excerptMaxLines')).setDesc(t('settings.excerptMaxLinesDesc'))
            .addText(text => text.setValue(String(s.display.excerptMaxLines)).onChange(v => {
                const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) { s.display.excerptMaxLines = n; this.saveDebounced(); }
            }));
        excerptLinesSetting.settingEl.style.display = s.display.headingOutputMode === 'with-excerpt' ? '' : 'none';

        sectionCharsSetting = new Setting(el).setName(t('settings.sectionMaxChars')).setDesc(t('settings.sectionMaxCharsDesc'))
            .addText(text => text.setValue(String(s.display.sectionMaxChars)).onChange(v => {
                const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) { s.display.sectionMaxChars = n; this.saveDebounced(); }
            }));
        sectionCharsSetting.settingEl.style.display = s.display.headingOutputMode !== 'heading-only' ? '' : 'none';

        let snippetCharsSetting: Setting;
        new Setting(el).setName(t('settings.showBodySnippet')).setDesc(t('settings.showBodySnippetDesc'))
            .addToggle(toggle => toggle.setValue(s.display.showBodySnippet).onChange(async v => {
                s.display.showBodySnippet = v; await this.saveFlushed();
                snippetCharsSetting.settingEl.style.display = v ? '' : 'none';
            }));

        snippetCharsSetting = new Setting(el).setName(t('settings.snippetContextChars')).setDesc(t('settings.snippetContextCharsDesc'))
            .addText(text => text.setValue(String(s.display.snippetContextChars)).onChange(v => {
                const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { s.display.snippetContextChars = n; this.saveDebounced(); }
            }));
        snippetCharsSetting.settingEl.style.display = s.display.showBodySnippet ? '' : 'none';

        new Setting(el).setName(t('settings.showTags')).setDesc(t('settings.showTagsDesc'))
            .addToggle(toggle => toggle.setValue(s.display.showTags).onChange(async v => { s.display.showTags = v; await this.saveFlushed(); }));
            
        new Setting(el).setName(t('settings.showFilePath')).setDesc(t('settings.showFilePathDesc'))
            .addToggle(toggle => toggle.setValue(s.display.showFilePath).onChange(async v => { s.display.showFilePath = v; await this.saveFlushed(); }));
            
        new Setting(el).setName(t('settings.groupByType')).setDesc(t('settings.groupByTypeDesc'))
            .addToggle(toggle => toggle.setValue(s.display.groupByType).onChange(async v => { s.display.groupByType = v; await this.saveFlushed(); }));

        /* ── Behavior ──────────────────────────────────────────────────── */
        el.createDiv({ text: t('settings.searchBehavior'), cls: 'lsv-settings-section' });

        new Setting(el).setName(t('settings.caseSensitive')).setDesc(t('settings.caseSensitiveDesc'))
            .addToggle(toggle => toggle.setValue(s.behavior.caseSensitive).onChange(async v => { s.behavior.caseSensitive = v; await this.saveFlushed(); }));
            
        new Setting(el).setName(t('settings.wholeWord')).setDesc(t('settings.wholeWordDesc'))
            .addToggle(toggle => toggle.setValue(s.behavior.wholeWord).onChange(async v => { s.behavior.wholeWord = v; await this.saveFlushed(); }));
            
        new Setting(el).setName(t('settings.maxMatchesPerFile')).setDesc(t('settings.maxMatchesPerFileDesc'))
            .addText(text => text.setValue(String(s.behavior.maxMatchesPerFile)).onChange(v => {
                const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) { s.behavior.maxMatchesPerFile = n; this.saveDebounced(); }
            }));

        renderPdfOutlineSettings(el, s.pdfOutline, () => this.saveFlushed());
    }
}
