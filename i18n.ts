/* ════════════════════════════════════════════════════════════════════════════
I18N — TRANSLATIONS (EN + RU)
Single source of truth for all UI/setting strings. `t()` reads the module-
global language, which the plugin sets on load and on settings change.
═══════════════════════════════════════════════════════════════════════════ */

export type Lang = 'en' | 'ru';

export const TRANSLATIONS: Record<string, { en: string; ru: string }> = {
    // ── Settings: Language ────────────────────────────────────────
    'settings.language':               { en: 'Language',                ru: 'Язык' },
    'settings.languageDesc':           { en: 'Choose interface language for the plugin settings and UI.', ru: 'Выберите язык интерфейса настроек плагина.' },

    // ── Settings: Library ────────────────────────────────────────
    'settings.library':                { en: 'Library',                 ru: 'Библиотека' },
    'settings.libraryFolder':          { en: 'Library folder',          ru: 'Папка библиотеки' },
    'settings.libraryFolderDesc':      { en: 'Root folder where the plugin searches for notes. If empty, the PDF index folder is used. All notes inside this folder and its subfolders are checked for group matches.', ru: 'Корневая папка, в которой плагин ищет заметки. Если оставить пустым, будет использована папка индекса PDF (настраивается ниже в секции PDF). Все заметки внутри этой папки и её подпапок проверяются на совпадение с группами.' },
    'settings.termSource':             { en: 'Search terms source',     ru: 'Источник терминов поиска' },
    'settings.termSourceDesc':         { en: 'Where to read the search terms for the current note: its aliases (default) or another frontmatter property. The chosen property should contain a list (array) of values.', ru: 'Откуда брать термины поиска для текущей заметки: из её алиасов (по умолчанию) или из другого свойства frontmatter. Выбранное свойство должно содержать список (массив) значений.' },
    'settings.termSourceAliases':      { en: 'Aliases (default)',       ru: 'Алиасы (по умолчанию)' },
    'settings.termSourceProperty':     { en: 'Custom property',         ru: 'Другое свойство' },
    'settings.termProperty':           { en: 'Terms property',          ru: 'Свойство с терминами' },
    'settings.termPropertyDesc':       { en: 'Frontmatter property to read the search terms from. It should hold a list/array, e.g. terms: [foo, bar].', ru: 'Свойство frontmatter, из которого берутся термины поиска. Должно содержать список/массив, например terms: [foo, bar].' },

    // ── Settings: Result groups ──────────────────────────────────
    'settings.resultGroups':           { en: 'Result groups',           ru: 'Группы результатов' },
    'settings.resultGroupsDesc':       { en: 'Each group shows files whose chosen frontmatter property matches one of the listed values. Pick the property name and the accepted values per group. Rules apply top-down; a file not matching any group is hidden from results.', ru: 'Каждая группа показывает файлы, у которых значение выбранного свойства frontmatter совпадает с одним из указанных. Имя свойства и допустимые значения задаются для каждой группы. Правила применяются сверху вниз; файл, не попавший ни в одну группу, скрыт из результатов.' },
    'settings.groupName':              { en: 'Name',                    ru: 'Название' },
    'settings.groupNamePh':            { en: 'Name',                    ru: 'Название' },
    'settings.groupTypesPh':           { en: 'type values, comma-separated', ru: 'значения тип, через запятую' },
    'settings.groupProperty':          { en: 'Property',                ru: 'Свойство' },
    'settings.groupPropertyPh':        { en: 'frontmatter key (e.g. type)', ru: 'ключ frontmatter (напр. type)' },
    'settings.groupValuesPh':          { en: 'values, comma-separated (empty = any)', ru: 'значения через запятую (пусто = любое)' },
    'settings.groupIcon':              { en: 'Icon',                    ru: 'Иконка' },
    'settings.pickIcon':               { en: 'Pick icon',               ru: 'Выбрать иконку' },
    'settings.deleteGroup':            { en: 'Delete group',            ru: 'Удалить группу' },
    'settings.addGroup':               { en: '+ Add group',             ru: '+ Добавить группу' },
    'settings.newGroup':               { en: 'New group',               ru: 'Новая группа' },

    // ── Settings: Search targets per group ───────────────────────
    'settings.whereToSearch':          { en: 'Where to search in files of this group', ru: 'Где искать совпадения в файлах этой группы' },
    'settings.headings':               { en: 'Headings',                ru: 'Заголовки' },
    'settings.headingsDesc':           { en: 'Search in heading text (# ## ### etc.). Fastest — data comes from cache, file is not read.', ru: 'Искать совпадения в тексте заголовков (# ## ### и т.д.). Это самый быстрый способ — данные берутся из кэша, файл не читается.' },
    'settings.calloutTitles':          { en: 'Callout titles',          ru: 'Заголовки выносов' },
    'settings.calloutTitlesDesc':      { en: 'Search in callout block titles (> [!note]- Title). Useful for structured notes.', ru: 'Искать в заголовках callout-блоков (> [!Note]- Заголовок). Полезно для поиска по структурированным заметкам.' },
    'settings.calloutBodies':          { en: 'Callout bodies',          ru: 'Тело выносов' },
    'settings.calloutBodiesDesc':      { en: 'Search inside callout block bodies (lines after the title). May slow search if many callouts.', ru: 'Искать внутри тела callout-блоков (строки после заголовка выноса). Может замедлить поиск, если выносов много.' },
    'settings.noteBody':               { en: 'Full note text',          ru: 'Полный текст заметки' },
    'settings.noteBodyDesc':           { en: 'Search the entire note text (excluding frontmatter). Slowest — every file is read fully.', ru: 'Искать по всему тексту заметки (без frontmatter). Самый медленный режим — читается каждый файл целиком.' },
    'settings.filename':               { en: 'Filename',                ru: 'Имя файла' },
    'settings.filenameDesc':           { en: 'Match against filename (without .md extension). Fast, no file read needed.', ru: 'Искать совпадения в имени файла (без расширения .md). Быстро, не требует чтения файла.' },
    'settings.frontmatterFields':      { en: 'Frontmatter fields',      ru: 'Поля frontmatter' },
    'settings.frontmatterFieldsDesc':  { en: 'Frontmatter field names, comma-separated, whose values are checked for matches.', ru: 'Имена полей frontmatter через запятую, чьи значения проверяются на совпадение.' },

    // ── Settings: Inline note panel ──────────────────────────────
    'settings.inlinePanel':            { en: 'Inline note panel',       ru: 'Встроенная панель заметок' },
    'settings.enablePanel':            { en: 'Enable panel',            ru: 'Включить панель' },
    'settings.enablePanelDesc':        { en: 'Show a "virtual" panel with search results at the top or bottom of a note. The panel is never written to the file — it exists only in the UI. The plugin automatically searches by the current note\'s aliases and shows matches from the library.', ru: 'Показывать «виртуальную» панель с результатами поиска в верхней или нижней части заметки. Панель не записывается в файл — она существует только в интерфейсе. Плагин автоматически ищет по алиасам текущей заметки и показывает совпадения из библиотеки.' },
    'settings.panelPosition':          { en: 'Panel position',            ru: 'Расположение панели' },
    'settings.panelPositionDesc':      { en: 'Dock the panel at top or bottom of the page.', ru: 'Закрепить панель вверху или внизу страницы. При выборе «Вверху» панель появляется над текстом, при «Внизу» — под ним.' },
    'settings.top':                    { en: 'Top',                     ru: 'Вверху страницы' },
    'settings.bottom':                 { en: 'Bottom',                  ru: 'Внизу страницы' },
    'settings.readingMode':            { en: 'Show in reading mode',    ru: 'Показывать в режиме чтения' },
    'settings.readingModeDesc':        { en: 'Display panel as banner in reading/preview mode. Without this, the panel is only visible in edit mode.', ru: 'Отображать панель как баннер в режиме чтения/предпросмотра. Без этой опции панель видна только в режиме редактирования.' },
    'settings.collapsedDefault':       { en: 'Collapsed by default',    ru: 'Свернуть по умолчанию' },
    'settings.collapsedDefaultDesc':   { en: 'Panel starts collapsed — only the title bar is visible. Click the header to expand.', ru: 'Панель будет показываться свёрнутой — видна только полоса заголовка. Чтобы увидеть результаты, нужно кликнуть по заголовку и раскрыть панель.' },
    'settings.panelTitle':             { en: 'Panel title',             ru: 'Заголовок панели' },
    'settings.panelTitleDesc':         { en: 'Header text shown in the panel. You can set any name, e.g. "Library" or "Book search".', ru: 'Текст, отображаемый в заголовке панели. Можно задать любое название, например «Библиотека» или «Поиск по книгам».' },
    'settings.triggerFolders':         { en: 'Trigger folders',         ru: 'Папки-триггеры' },
    'settings.triggerFoldersDesc':     { en: 'List of folders where the panel appears, comma-separated. If empty, the library folder is used. Panel is only visible for files in these folders.', ru: 'Список папок через запятую, в которых панель появляется. Если оставить пустым, используется папка библиотеки (указана выше). Панель будет видна только для файлов из этих папок.' },

    // ── Settings: Display results ────────────────────────────────
    'settings.displayResults':         { en: 'Display results',         ru: 'Отображение результатов' },
    'settings.headingOutputMode':      { en: 'Heading output mode',     ru: 'Режим вывода заголовков' },
    'settings.headingOutputModeDesc':  { en: 'How much text to show under a matched heading. "Heading only" is fastest. "With excerpt" adds first N lines. "With full section" includes everything until the next equal/higher heading.', ru: 'Сколько текста показывать под совпавшим заголовком. «Только заголовок» — самый быстрый и чистый вариант. «С отрывком» — заголовок + первые N строк ниже. «С полным разделом» — заголовок и весь текст до следующего заголовка того же или более высокого уровня.' },
    'settings.headingOnly':            { en: 'Heading only',            ru: 'Только заголовок' },
    'settings.withExcerpt':            { en: 'Heading + first N lines', ru: 'Заголовок + первые N строк' },
    'settings.withSection':            { en: 'Heading + full section',  ru: 'Заголовок + полный раздел' },
    'settings.excerptMaxLines':        { en: 'Excerpt — max lines',     ru: 'Отрывок — макс. строк' },
    'settings.excerptMaxLinesDesc':    { en: 'Number of text lines displayed under heading. 0 = no limit. Only for "Heading + first N lines" mode.', ru: 'Количество строк текста, отображаемых под заголовком. 0 = без ограничения. Работает только при режиме «Заголовок + первые N строк».' },
    'settings.sectionMaxChars':        { en: 'Section content — max chars', ru: 'Содержимое раздела — макс. символов' },
    'settings.sectionMaxCharsDesc':    { en: 'Trim section content to this many characters. 0 = no limit. Prevents huge text blocks in "Heading + full section" mode.', ru: 'Обрезать извлечённый текст раздела до этого количества символов. 0 = без ограничения. Предотвращает появление огромных блоков текста при использовании режима «Заголовок + полный раздел».' },
    'settings.showBodySnippet':        { en: 'Show text snippets',      ru: 'Показывать фрагменты текста' },
    'settings.showBodySnippetDesc':    { en: 'Show a short text snippet around a match found in note body or callout body. Helps understand context without opening the file.', ru: 'Показывать короткий фрагмент текста вокруг совпадения, найденного в теле заметки или теле callout-блока. Это помогает понять контекст совпадения без открытия файла.' },
    'settings.snippetContextChars':    { en: 'Snippet context chars',   ru: 'Символы контекста фрагмента' },
    'settings.snippetContextCharsDesc': { en: 'Characters of text shown on each side of the match in a snippet. Larger value = wider context.', ru: 'Количество символов текста, отображаемых по обе стороны от совпадения в фрагменте. Чем больше значение, тем шире контекст, но тем длиннее результат.' },
    'settings.showTags':               { en: 'Show tags',               ru: 'Показывать теги' },
    'settings.showTagsDesc':           { en: 'Display tags from frontmatter of each found note.', ru: 'Отображать теги из frontmatter каждой найденной заметки. Теги помогают быстро оценить тематику файла.' },
    'settings.showFilePath':           { en: 'Show file path',          ru: 'Показывать путь к файлу' },
    'settings.showFilePathDesc':       { en: 'Show relative file path under the note name. Useful for same-name files in different folders.', ru: 'Показывать относительный путь файла внутри хранилища под именем заметки. Полезно, если у вас одноимённые файлы в разных папках.' },
    'settings.groupByType':            { en: 'Group by type',           ru: 'Группировать по типу' },
    'settings.groupByTypeDesc':        { en: 'Split results into sections by group (Books, Articles, etc.). When off, a flat list sorted by filename is shown.', ru: 'Разделять результаты на секции по группам (Книги, Статьи и т.д.). При отключении отображается единый плоский список, отсортированный по имени файла.' },

    // ── Settings: Search behavior ────────────────────────────────
    'settings.searchBehavior':         { en: 'Search behavior',         ru: 'Поведение поиска' },
    'settings.caseSensitive':          { en: 'Case sensitive',          ru: 'Учитывать регистр' },
    'settings.caseSensitiveDesc':      { en: 'Search with exact letter case. When off, "cat" also matches "Cat" or "CAT".', ru: 'Искать с учётом точного регистра букв. Если выключено, «кот» также совпадёт с «Кот» или «КОТ». Рекомендуется оставить выключенным для русского языка.' },
    'settings.wholeWord':              { en: 'Whole words only',        ru: 'Только целые слова' },
    'settings.wholeWordDesc':          { en: 'Match only complete words. When on, "cat" will NOT match inside "catfish".', ru: 'Совпадение только с полными словами. При включении «кот» НЕ будет найден внутри слова «котёнок». Работает через границы слов (\\b).' },
    'settings.maxMatchesPerFile':      { en: 'Max matches per file',    ru: 'Макс. совпадений на файл' },
    'settings.maxMatchesPerFileDesc':  { en: 'Stop collecting matches from one file after this count. 0 = collect all. Limiting speeds up search in large files with many repetitions.', ru: 'Прекратить сбор совпадений из одного файла после достижения этого количества. 0 = собирать все совпадения. Ограничение ускоряет поиск в больших файлах с множеством повторений.' },

    // ── UI strings ───────────────────────────────────────────────
    'ui.noResults':                    { en: 'No results found.',       ru: 'Нет результатов.' },
    'ui.searching':                    { en: 'Searching…',              ru: 'Поиск…' },
    'ui.aliases':                      { en: 'Aliases:',                ru: 'Алиасы:' },
    'ui.none':                         { en: 'none',                    ru: 'нет' },
    'ui.extraTerms':                   { en: 'extra terms, comma-separated…', ru: 'доп. термины через запятую…' },
    'ui.search':                       { en: 'Search',                  ru: 'Поиск' },
    'ui.noAliases':                    { en: 'No aliases — add extra terms above.', ru: 'Нет алиасов — добавьте термины выше.' },
    'ui.openNote':                     { en: 'Open a note with aliases or add extra terms.', ru: 'Откройте заметку с алиасами или добавьте термины.' },
    'ui.pin':                          { en: 'Pin',                     ru: 'Закрепить' },
    'ui.unpin':                        { en: 'Unpin',                   ru: 'Открепить' },
    'ui.searchTerms':                  { en: 'Search terms',            ru: 'Термины поиска' },
    'ui.expand':                       { en: 'expand',                  ru: 'развернуть' },
    'ui.collapse':                     { en: 'collapse',                ru: 'свернуть' },
    'ui.results':                      { en: 'Results',                 ru: 'Результаты' },
    'ui.librarySearch':                { en: 'Library Search',          ru: 'Поиск по библиотеке' },
    'ui.extra':                        { en: 'Extra:',                  ru: 'Доп.:' },

    // ── PDF Outline settings ─────────────────────────────────────
    'pdf.title':                       { en: 'PDF Outline Extraction',  ru: 'Извлечение оглавления PDF' },
    'pdf.cardIndexHeading':            { en: 'Card index (folder A → folder B)', ru: 'Картотека (папка A → папка B)' },
    'pdf.cardIndexDesc':               { en: 'One card note per PDF. The plugin reads a PDF\'s bookmarks and writes them as a clickable table of contents into a matching card note.', ru: 'Одна заметка-карточка на каждый PDF. Плагин читает закладки PDF и записывает их в виде кликабельного оглавления в соответствующую заметку-карточку.' },
    'pdf.pdfFolder':                   { en: 'PDF folder (A)',          ru: 'Папка PDF (A)' },
    'pdf.pdfFolderDesc':               { en: 'Folder the plugin watches for PDF files. If empty, the entire vault is searched.', ru: 'Папка, за которой плагин следит и где ищет PDF-файлы. Если оставить пустым — поиск по всему хранилищу.' },
    'pdf.indexFolder':                 { en: 'Index folder (B)',        ru: 'Папка индекса (B)' },
    'pdf.indexFolderDesc':             { en: 'Folder where card notes are stored and created (one note per PDF). Each card is linked to a PDF via a frontmatter property.', ru: 'Папка, в которой хранятся и создаются карточки (по одной заметке на каждый PDF). Каждая карточка связана с PDF через свойство в frontmatter.' },
    'pdf.pdfLinkProperty':             { en: 'PDF link property',       ru: 'Свойство ссылки на PDF' },
    'pdf.pdfLinkPropertyDesc':         { en: 'Frontmatter key in the card that contains the PDF file link (e.g. pdf: [[file.pdf]]). The plugin uses this property to find the card when updating the outline.', ru: 'Ключ в frontmatter карточки, который содержит ссылку на PDF-файл (например: pdf: [[файл.pdf]]). Плагин использует это свойство для поиска карточки при обновлении оглавления.' },
    'pdf.targetHeading':               { en: 'Target heading',          ru: 'Целевой заголовок' },
    'pdf.targetHeadingDesc':           { en: 'Heading inside the card under which the outline is written. On re-run, the content under this heading is fully replaced with a new outline.', ru: 'Заголовок внутри карточки, под которым записывается оглавление. При повторном запуске содержимое под этим заголовком полностью заменяется на новое оглавление.' },
    'pdf.defaultTargetHeadingLevel':   { en: 'Heading level (if created)', ru: 'Уровень заголовка (если создаётся)' },
    'pdf.defaultTargetHeadingLevelDesc': { en: 'Heading level (1–6) used only if the target heading is absent and needs to be created at the end of the file.', ru: 'Уровень заголовка (1–6), который используется только если целевой заголовок отсутствует и его нужно создать в конце файла.' },
    'pdf.templatePath':                { en: 'Card template',           ru: 'Шаблон для новых карточек' },
    'pdf.templatePathDesc':            { en: 'Path to a template note used for the body of newly created cards. Supports {{...}} placeholders — see the placeholder reference below. Most useful here: {{file.basename}}, {{file.name}}, {{file.path}}, {{pdf_link}}, {{pageCount}}, {{date}}.', ru: 'Путь к заметке-шаблону, используемой для тела новых карточек. Поддерживает плейсхолдеры {{...}} — см. справку по плейсхолдерам ниже. Здесь полезнее всего: {{file.basename}}, {{file.name}}, {{file.path}}, {{pdf_link}}, {{pageCount}}, {{date}}.' },
    'pdf.cardNamePrefixStrip':         { en: 'Strip prefix from card name', ru: 'Удалить префикс из имени карточки' },
    'pdf.cardNamePrefixStripDesc':     { en: 'String removed from the beginning of the PDF name when creating the card name. Example: if PDF is "pdf-Book" and prefix is "pdf-", the card gets name "Book".', ru: 'Строка, которая удаляется из начала имени PDF при создании имени карточки. Пример: если PDF называется «pdf-Книга», а префикс «pdf-», карточка получит имя «Книга».' },
    'pdf.cardNameTemplate':            { en: 'Card filename template',  ru: 'Шаблон имени файла карточки' },
    'pdf.cardNameTemplateDesc':        { en: 'Filename for new cards. {{pdf_name}} = the PDF name after prefix stripping; {{file.basename}} = the raw PDF name; also {{file.path}}, {{date}}, etc. (see the placeholder reference below). Characters not allowed in filenames are replaced with "-".', ru: 'Имя файла для новых карточек. {{pdf_name}} — имя PDF после удаления префикса; {{file.basename}} — исходное имя PDF; также {{file.path}}, {{date}} и др. (см. справку по плейсхолдерам ниже). Недопустимые в имени символы заменяются на «-».' },
    'pdf.autoCreateOnAdd':             { en: 'Auto-create on PDF add',  ru: 'Автосоздание при добавлении PDF' },
    'pdf.autoCreateOnAddDesc':         { en: 'Watch folder A and automatically create/update a card when a new PDF is added. Without this, cards are only created manually via commands.', ru: 'Следить за папкой A и автоматически создавать/обновлять карточку, когда в неё добавляется новый PDF-файл. Без этой опции карточки создаются только вручную через команды.' },
    'pdf.headingsAndLists':            { en: 'Headings and lists',      ru: 'Заголовки и списки' },
    'pdf.baseHeadingLevel':            { en: 'Base heading level',      ru: 'Базовый уровень заголовков' },
    'pdf.baseHeadingLevelDesc':        { en: 'Heading level (# = 1, ## = 2 etc.) for the topmost outline items. 0 = auto (target heading level + 1). If the outline has deep nesting, lower levels may exceed H6.', ru: 'Уровень (# = 1, ## = 2 и т.д.) для самых верхних элементов оглавления. 0 = автоматически (уровень целевого заголовка + 1). Если оглавление имеет большую глубину вложенности, нижние уровни могут выйти за H6.' },
    'pdf.overflowAsList':              { en: 'Overflow past H6 as nested lists', ru: 'Переполнение за H6 как вложенные списки' },
    'pdf.overflowAsListDesc':          { en: 'When outline depth exceeds H6 (######), render deeper items as nested list items (- item). When off, everything past H6 is clamped to H6.', ru: 'Когда глубина оглавления превышает уровень ###### (H6), отображать более глубокие элементы как вложенные элементы списка (- элемент). При выключении всё, что глубже H6, прижимается к уровню H6.' },
    'pdf.listIndentUnit':              { en: 'List indent',             ru: 'Отступ в списках' },
    'pdf.listIndentUnitDesc':          { en: 'Indent per list nesting level. Used when H6 overflow as nested lists is enabled.', ru: 'Величина отступа на каждый уровень вложенности списка. Используется когда включено переполнение за H6.' },
    'pdf.indent4spaces':               { en: '4 spaces',                ru: '4 пробела' },
    'pdf.indent2spaces':               { en: '2 spaces',                ru: '2 пробела' },
    'pdf.indentTab':                   { en: 'Tab',                     ru: 'Табуляция' },
    'pdf.includeLinklessHeadings':     { en: 'Headings without links',  ru: 'Заголовки без ссылок' },
    'pdf.includeLinklessHeadingsDesc': { en: 'Include outline bookmarks that have no destination (page link) in the output. They appear as regular headings or list items without a link.', ru: 'Включать в оглавление элементы закладок, у которых нет назначения (ссылки на страницу). Они отображаются как обычные заголовки или элементы списка без ссылки.' },
    'pdf.pageNumbersAndLinks':         { en: 'Page numbers and links',  ru: 'Номера страниц и ссылки' },
    'pdf.usePageLabels':               { en: 'Use PDF page labels',     ru: 'Использовать метки страниц PDF' },
    'pdf.usePageLabelsDesc':           { en: 'Read page numbers from the PDF\'s built-in page labels (e.g. p.8 instead of physical p.32). This matches the numbering printed in the book itself. If labels are absent, offset is used.', ru: 'Брать номер страницы из встроенных в PDF меток (например, p.8 вместо физического p.32). Это соответствует нумерации, напечатанной в самой книге. Если метки отсутствуют, используется смещение.' },
    'pdf.pageOffset':                  { en: 'Page offset',             ru: 'Смещение страниц' },
    'pdf.pageOffsetDesc':              { en: 'Used when page labels are absent: displayed number = physical number − offset. Example: physical 32 with offset 24 → displays p.8.', ru: 'Используется, когда метки страниц отсутствуют: отображаемый номер = физический номер − смещение. Пример: физический 32 при смещении 24 → отображается p.8.' },
    'pdf.displayTemplate':             { en: 'Link display template',   ru: 'Шаблон отображения ссылки' },
    'pdf.displayTemplateDesc':         { en: 'The visible text of each page link. Use {{pageLabel}} for the book page number, {{page}} for the physical page, {{pageCount}} for the total. Example: p.{{pageLabel}} → p.8', ru: 'Видимый текст каждой ссылки на страницу. Используйте {{pageLabel}} — книжный номер страницы, {{page}} — физический номер, {{pageCount}} — всего страниц. Пример: p.{{pageLabel}} → p.8' },
    'pdf.manualInsertOutput':          { en: 'Manual insert output',    ru: 'Вывод при ручной вставке' },
    'pdf.manualInsertOutputDesc':      { en: 'Where to put the outline when using the "Pick PDF" command, if no editor is open.', ru: 'Куда помещать оглавление при использовании команды «Выбрать PDF», если ни один редактор не открыт.' },
    'pdf.outputCursor':                { en: 'At cursor position',      ru: 'В позицию курсора' },
    'pdf.outputClipboard':             { en: 'To clipboard',            ru: 'В буфер обмена' },

    // ── PDF Outline: guided settings (added) ─────────────────────
    'pdf.quickStartTitle':             { en: 'How it works',            ru: 'Как это работает' },
    'pdf.quickStartStep1':             { en: '1. Point "PDF folder" at where your PDFs live, and "Index folder" at where the card notes should go.', ru: '1. Укажите в «Папке PDF», где лежат ваши PDF, а в «Папке индекса» — куда складывать заметки-карточки.' },
    'pdf.quickStartStep2':             { en: '2. Each card is linked to its PDF through one frontmatter property (default: pdf). The plugin uses it to find the card again on updates.', ru: '2. Каждая карточка связана со своим PDF через одно свойство frontmatter (по умолчанию pdf). По нему плагин снова находит карточку при обновлении.' },
    'pdf.quickStartStep3':             { en: '3. Run the command "Rebuild cards for all PDFs in folder", or right-click a PDF → "Extract outline → card".', ru: '3. Выполните команду «Перестроить карточки для всех PDF в папке» или ПКМ по PDF → «Извлечь оглавление → карточку».' },
    'pdf.quickStartStep4':             { en: '4. (Optional) Turn on auto-create to do this automatically whenever a new PDF lands in the folder.', ru: '4. (Необязательно) Включите автосоздание, чтобы это происходило автоматически при появлении нового PDF в папке.' },

    'pdf.sectionFolders':              { en: 'Step 1 · Folders',        ru: 'Шаг 1 · Папки' },
    'pdf.sectionCards':                { en: 'Step 2 · How cards are linked & named', ru: 'Шаг 2 · Как карточки связываются и именуются' },
    'pdf.sectionOutput':               { en: 'Step 3 · Where the outline is written', ru: 'Шаг 3 · Куда записывается оглавление' },
    'pdf.sectionAutomation':           { en: 'Step 4 · Automation',     ru: 'Шаг 4 · Автоматизация' },

    'pdf.autoCreateOnAddWarn':         { en: 'Note: only affects PDFs added after this is enabled. Use "Rebuild cards for all PDFs in folder" for existing PDFs.', ru: 'Примечание: действует только на PDF, добавленные после включения. Для существующих PDF используйте «Перестроить карточки для всех PDF в папке».' },
    'pdf.displayTemplateHint':         { en: 'Tip: {{pageLabel}} = book page (e.g. 8), {{page}} = physical page (e.g. 32).', ru: 'Подсказка: {{pageLabel}} = книжная страница (напр. 8), {{page}} = физическая (напр. 32).' },

    'pdf.placeholderRef':              { en: 'Available placeholders',  ru: 'Доступные плейсхолдеры' },
    'pdf.placeholderRefIntro':         { en: 'Use these inside the card filename, card template and link templates:', ru: 'Используйте внутри имени файла карточки, шаблона карточки и шаблонов ссылок:' },
    'pdf.phPage':                      { en: 'Physical page number (from 1)', ru: 'Физический номер страницы (с 1)' },
    'pdf.phPageLabel':                 { en: 'Displayed number (from PDF labels or offset)', ru: 'Отображаемый номер (из меток PDF или со смещением)' },
    'pdf.phFileName':                  { en: 'PDF filename with extension', ru: 'Имя PDF-файла с расширением' },
    'pdf.phFileBasename':              { en: 'PDF name without extension', ru: 'Имя PDF без расширения' },
    'pdf.phFilePath':                  { en: 'Full path relative to the vault', ru: 'Полный путь относительно хранилища' },
    'pdf.phDate':                      { en: 'Current date (DD-MM-YYYY)', ru: 'Текущая дата (DD-MM-YYYY)' },
    'pdf.phPageCount':                 { en: 'Total number of pages',   ru: 'Общее число страниц' },

    // ── PDF Outline: unprocessed files modal ─────────────────────
    'pdf.unprocessed.title':           { en: 'Unprocessed PDFs',        ru: 'Необработанные PDF' },
    'pdf.unprocessed.desc':            { en: '{{total}} PDF(s) need attention: {{noCard}} without a card note, {{empty}} with an empty outline section. Select which to process, then Rebuild selected. PDFs without embedded bookmarks will be reported during processing.', ru: '{{total}} PDF требуют внимания: {{noCard}} без карточки, {{empty}} с пустым оглавлением. Выберите, какие обработать, затем нажмите «Перестроить выбранные». PDF без встроенных закладок будут отмечены при обработке.' },
    'pdf.unprocessed.filterAll':       { en: 'All',                     ru: 'Все' },
    'pdf.unprocessed.filterNoCard':    { en: 'No card',                 ru: 'Нет карточки' },
    'pdf.unprocessed.filterEmpty':     { en: 'Empty section',           ru: 'Пустое оглавление' },
    'pdf.unprocessed.selectAll':       { en: 'Select all',              ru: 'Выбрать все' },
    'pdf.unprocessed.selected':        { en: 'selected',                ru: 'выбрано' },
    'pdf.unprocessed.selectNoCard':    { en: 'Select only "No card"',   ru: 'Только «Нет карточки»' },
    'pdf.unprocessed.selectEmpty':     { en: 'Select only "Empty section"', ru: 'Только «Пустое оглавление»' },
    'pdf.unprocessed.noCardLabel':     { en: 'No card note exists',     ru: 'Карточка не создана' },
    'pdf.unprocessed.emptySectionLabel': { en: 'Card exists, outline section empty', ru: 'Карточка есть, оглавление пусто' },
    'pdf.unprocessed.noCardBadge':     { en: 'no card',                 ru: 'нет карточки' },
    'pdf.unprocessed.emptySectionBadge': { en: 'empty',                 ru: 'пусто' },
    'pdf.unprocessed.rebuildSelected': { en: 'Rebuild selected',        ru: 'Перестроить выбранные' },
    'pdf.unprocessed.cancel':          { en: 'Cancel',                  ru: 'Отмена' },
    'pdf.unprocessed.nothingSelected': { en: 'Nothing selected.',       ru: 'Ничего не выбрано.' },
    'pdf.unprocessed.noResultsInFilter': { en: 'No PDFs in this category.', ru: 'Нет PDF в этой категории.' },

    // ── PDF notices & commands ────────────────────────────────────────────
    'pdf.notice.noPdfsInVault':       { en: 'No PDF files found in the vault.',                ru: 'PDF-файлы в хранилище не найдены.' },
    'pdf.notice.noOutline':           { en: 'This PDF has no embedded outline.',                ru: 'В этом PDF нет встроенного оглавления.' },
    'pdf.notice.outlineInserted':     { en: 'Outline inserted into the note.',                 ru: 'Оглавление вставлено в заметку.' },
    'pdf.notice.outlineCopied':       { en: 'Outline copied to clipboard.',                    ru: 'Оглавление скопировано в буфер обмена.' },
    'pdf.notice.noOutlineBookmarks':  { en: 'This PDF has no embedded outline (bookmarks).',   ru: 'В этом PDF нет встроенных закладок (оглавления).' },
    'pdf.notice.noLinkedPdf':         { en: 'No linked PDF in the \"{{prop}}\" property.',   ru: 'Нет ссылки на PDF в свойстве «{{prop}}».' },
    'pdf.notice.updatedOutline':      { en: 'Updated outline: {{name}}',                       ru: 'Оглавление обновлено: {{name}}' },
    'pdf.notice.createdAndInserted':  { en: 'Created card and inserted outline: {{name}}',     ru: 'Создана карточка и вставлено оглавление: {{name}}' },
    'pdf.notice.failed':              { en: 'PDF outline failed (see console).',                ru: 'Ошибка оглавления PDF (подробности в консоли).' },
    'pdf.notice.noPdfsInFolder':      { en: 'No PDFs found in the configured folder.',         ru: 'PDF не найдены в настроенной папке.' },
    'pdf.notice.configureFirst':      { en: 'Configure the index folder (or a template) first.', ru: 'Сначала укажите папку индекса или шаблон.' },
    'pdf.notice.rebuilding':          { en: 'Rebuilding {{count}} card(s) …',             ru: 'Перестройка {{count}} карточек…' },
    'pdf.notice.processed':           { en: 'PDF outline: {{ok}}/{{total}} card(s) processed.', ru: 'Оглавление PDF: обработано {{ok}}/{{total}} карточек.' },
    'pdf.notice.scanning':            { en: 'Scanning for unprocessed PDFs …',            ru: 'Поиск необработанных PDF…' },
    'pdf.notice.allProcessed':        { en: 'All PDFs already have an outline.',               ru: 'Все PDF уже имеют оглавление.' },
    'pdf.notice.skippedHuge':         { en: 'Skipped huge PDF: {{name}} (>250 MB)',            ru: 'Пропущен слишком большой PDF: {{name}} (>250 МБ)' },
    'pdf.notice.noOutlineEntry':      { en: '{{name}} — no embedded outline (bookmarks)', ru: '{{name}} — нет встроенных закладок (оглавления)' },
    'pdf.batchProcessed':             { en: '{{ok}} processed',                                ru: 'обработано: {{ok}}' },
    'pdf.batchNoOutline':             { en: '{{count}} have no outline',                       ru: 'без оглавления: {{count}}' },
    'pdf.batchFailed':                { en: '{{count}} failed',                                ru: 'ошибок: {{count}}' },
    'pdf.pickerPlaceholder':          { en: 'Select a PDF file …',                        ru: 'Выберите PDF-файл…' },
    'pdf.cmd.pick':                   { en: 'PDF outline: insert into active note (pick PDF)', ru: 'Оглавление PDF: вставить в активную заметку (выбрать PDF)' },
    'pdf.cmd.current':                { en: 'PDF outline: extract from current PDF → card', ru: 'Оглавление PDF: извлечь из текущего PDF → карточка' },
    'pdf.cmd.updateCard':             { en: 'PDF outline: update outline in current card',     ru: 'Оглавление PDF: обновить оглавление в текущей карточке' },
    'pdf.cmd.rebuildFolder':          { en: 'PDF outline: rebuild cards for all PDFs in folder', ru: 'Оглавление PDF: перестроить карточки для всех PDF в папке' },
    'pdf.cmd.showUnprocessed':        { en: 'PDF outline: show unprocessed files',             ru: 'Оглавление PDF: показать необработанные файлы' },
    'pdf.menu.extractToCard':         { en: 'Extract outline → card',                     ru: 'Извлечь оглавление → карточка' },
    'pdf.menu.copyToClipboard':       { en: 'Copy outline to clipboard',                       ru: 'Скопировать оглавление в буфер' },

    // ── main.ts ───────────────────────────────────────────────────────────
    'ui.couldNotResolveFile':         { en: 'Could not resolve source file.',                  ru: 'Не удалось найти исходный файл.' },

};

/** Current language — set by the plugin on load / settings change. */
// 🔥 FIX: Default language MUST be 'en' for open-source plugins.
// If data.json is corrupted or missing, an English user shouldn't see Cyrillic.
let _lang: Lang = 'en';

export function setLanguage(lang: Lang) { _lang = lang; }
export function getLanguage(): Lang { return _lang; }

/** Translation lookup. Falls back to English, then to the key itself. */
export function t(key: string): string {
    const entry = TRANSLATIONS[key];
    if (!entry) return key;
    return entry[_lang] ?? entry.en ?? key;
}