export interface LucideIconEntry {
    value: string;
    label: string;
    category: string;
}

/**
 * Curated list of Lucide icons available in Obsidian, grouped by category.
 * Each entry has a value (icon-id for setIcon()), label (display name), and category.
 */
export const LUCIDE_ICONS: LucideIconEntry[] = [
    // ── Books & documents ──────────────────────────────
    { value: 'book-open',       label: 'book-open',       category: 'Books & documents' },
    { value: 'book-open-check', label: 'book-open-check', category: 'Books & documents' },
    { value: 'book-marked',     label: 'book-marked',     category: 'Books & documents' },
    { value: 'book-copy',       label: 'book-copy',       category: 'Books & documents' },
    { value: 'book-heart',      label: 'book-heart',      category: 'Books & documents' },
    { value: 'book-lock',       label: 'book-lock',       category: 'Books & documents' },
    { value: 'book-type',       label: 'book-type',       category: 'Books & documents' },
    { value: 'notebook-pen',    label: 'notebook-pen',    category: 'Books & documents' },
    { value: 'notebook-tabs',   label: 'notebook-tabs',   category: 'Books & documents' },
    
    // ── Files & text ───────────────────────────────────
    { value: 'file-text',       label: 'file-text',       category: 'Files & text' },
    { value: 'file',            label: 'file',            category: 'Files & text' },
    { value: 'file-check',      label: 'file-check',      category: 'Files & text' },
    { value: 'file-code',       label: 'file-code',       category: 'Files & text' },
    { value: 'file-heart',      label: 'file-heart',      category: 'Files & text' },
    { value: 'file-search',     label: 'file-search',     category: 'Files & text' },
    { value: 'files',           label: 'files',           category: 'Files & text' },
    { value: 'scroll-text',     label: 'scroll-text',     category: 'Files & text' },
    { value: 'text',            label: 'text',            category: 'Files & text' },
    { value: 'text-search',     label: 'text-search',     category: 'Files & text' },
    
    // ── Academic & research ────────────────────────────
    { value: 'graduation-cap',  label: 'graduation-cap',  category: 'Academic & research' },
    { value: 'school',          label: 'school',          category: 'Academic & research' },
    { value: 'microscope',      label: 'microscope',      category: 'Academic & research' },
    { value: 'flask-conical',   label: 'flask-conical',   category: 'Academic & research' },
    { value: 'atom',            label: 'atom',            category: 'Academic & research' },
    { value: 'brain',           label: 'brain',           category: 'Academic & research' },
    { value: 'lightbulb',       label: 'lightbulb',       category: 'Academic & research' },
    
    // ── Media & creative ───────────────────────────────
    { value: 'palette',         label: 'palette',         category: 'Media & creative' },
    { value: 'music',           label: 'music',           category: 'Media & creative' },
    { value: 'camera',          label: 'camera',          category: 'Media & creative' },
    { value: 'video',           label: 'video',           category: 'Media & creative' },
    { value: 'image',           label: 'image',           category: 'Media & creative' },
    { value: 'pen-tool',        label: 'pen-tool',        category: 'Media & creative' },
    
    // ── Folders & organization ─────────────────────────
    { value: 'folder',          label: 'folder',          category: 'Folders & organization' },
    { value: 'folder-open',     label: 'folder-open',     category: 'Folders & organization' },
    { value: 'folder-search',   label: 'folder-search',   category: 'Folders & organization' },
    { value: 'folder-lock',     label: 'folder-lock',     category: 'Folders & organization' },
    { value: 'archive',         label: 'archive',         category: 'Folders & organization' },
    { value: 'database',        label: 'database',        category: 'Folders & organization' },
    { value: 'package',         label: 'package',         category: 'Folders & organization' },
    
    // ── People & communication ─────────────────────────
    { value: 'users',           label: 'users',           category: 'People & communication' },
    { value: 'user',            label: 'user',            category: 'People & communication' },
    { value: 'message-circle',  label: 'message-circle',  category: 'People & communication' },
    { value: 'mail',            label: 'mail',            category: 'People & communication' },
    
    // ── Navigation & interface ─────────────────────────
    { value: 'globe',           label: 'globe',           category: 'Navigation & interface' },
    { value: 'map',             label: 'map',             category: 'Navigation & interface' },
    { value: 'compass',         label: 'compass',         category: 'Navigation & interface' },
    { value: 'search',          label: 'search',          category: 'Navigation & interface' },
    { value: 'list',            label: 'list',            category: 'Navigation & interface' },
    { value: 'list-tree',       label: 'list-tree',       category: 'Navigation & interface' },
    { value: 'layout-grid',     label: 'layout-grid',     category: 'Navigation & interface' },
    { value: 'layers',          label: 'layers',          category: 'Navigation & interface' },
    { value: 'bookmark',        label: 'bookmark',        category: 'Navigation & interface' },
    { value: 'star',            label: 'star',            category: 'Navigation & interface' },
    { value: 'heart',           label: 'heart',           category: 'Navigation & interface' },
    { value: 'hash',            label: 'hash',            category: 'Navigation & interface' },
    { value: 'tag',             label: 'tag',             category: 'Navigation & interface' },
    
    // ── Tech & tools ───────────────────────────────────
    { value: 'code',            label: 'code',            category: 'Tech & tools' },
    { value: 'terminal',        label: 'terminal',        category: 'Tech & tools' },
    { value: 'wrench',          label: 'wrench',          category: 'Tech & tools' },
    { value: 'settings',        label: 'settings',        category: 'Tech & tools' },
    { value: 'plug',            label: 'plug',            category: 'Tech & tools' },
    { value: 'cpu',             label: 'cpu',             category: 'Tech & tools' },
];