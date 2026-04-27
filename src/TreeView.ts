import { ItemView, Notice, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type TreeGenPlugin from "./main";

export const TREEGEN_VIEW_TYPE = "treegen-view";

type CopyFormat = "tree" | "paths" | "json";

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const EXPAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>`;
const COLLAPSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>`;

export class TreeGenView extends ItemView {
	private plugin: TreeGenPlugin;
	private expandedFolders: Set<string> = new Set();
	private filterQuery = "";
	private copyFormat: CopyFormat = "tree";
	private treeContainer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TreeGenPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return TREEGEN_VIEW_TYPE; }
	getDisplayText(): string { return "TreeGen"; }
	getIcon(): string { return "list-tree"; }

	async onOpen(): Promise<void> {
		this.buildShell();
		this.renderTree();

		this.registerEvent(this.app.vault.on("create", () => this.renderTree()));
		this.registerEvent(this.app.vault.on("delete", () => this.renderTree()));
		this.registerEvent(this.app.vault.on("rename", () => this.renderTree()));
	}

	private buildShell(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("treegen-view");

		const header = container.createDiv("treegen-header");

		// Row 1: title + expand/collapse + copy all
		const titleRow = header.createDiv("treegen-title-row");
		titleRow.createEl("span", { text: "TreeGen", cls: "treegen-title" });

		const actions = titleRow.createDiv("treegen-actions");

		const expandBtn = actions.createEl("button", { cls: "treegen-icon-btn", attr: { "aria-label": "Expand all" } });
		expandBtn.innerHTML = EXPAND_ICON;
		expandBtn.addEventListener("click", () => this.expandAll());

		const collapseBtn = actions.createEl("button", { cls: "treegen-icon-btn", attr: { "aria-label": "Collapse all" } });
		collapseBtn.innerHTML = COLLAPSE_ICON;
		collapseBtn.addEventListener("click", () => this.collapseAll());

		// Row 2: format switcher + copy all
		const formatRow = header.createDiv("treegen-format-row");
		const switcher = formatRow.createDiv("treegen-format-switcher");

		const formats: { key: CopyFormat; label: string }[] = [
			{ key: "tree", label: "Tree" },
			{ key: "paths", label: "Paths" },
			{ key: "json", label: "JSON" },
		];
		formats.forEach(({ key, label }) => {
			const btn = switcher.createEl("button", {
				text: label,
				cls: "treegen-format-btn" + (this.copyFormat === key ? " is-active" : ""),
			});
			btn.addEventListener("click", () => {
				this.copyFormat = key;
				switcher.querySelectorAll(".treegen-format-btn").forEach((b) =>
					b.classList.toggle("is-active", b === btn)
				);
			});
		});

		const copyAllBtn = formatRow.createEl("button", { cls: "treegen-copy-all", attr: { "aria-label": "Copy vault tree" } });
		copyAllBtn.innerHTML = COPY_ICON + " Copy all";
		copyAllBtn.addEventListener("click", async () => {
			const root = this.app.vault.getRoot();
			await navigator.clipboard.writeText(this.getFormatted(root));
			new Notice("Vault tree copied!");
		});

		// Row 3: search
		const searchRow = header.createDiv("treegen-search-row");
		const searchInput = searchRow.createEl("input", {
			type: "text",
			placeholder: "Filter...",
			cls: "treegen-search",
		});
		searchInput.addEventListener("input", (e) => {
			this.filterQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
			this.renderTree();
		});

		this.treeContainer = container.createDiv("treegen-tree");
	}

	private renderTree(): void {
		if (!this.treeContainer) return;
		this.treeContainer.empty();
		const root = this.app.vault.getRoot();
		this.renderFolder(root, this.treeContainer, 0, true);
	}

	private expandAll(): void {
		this.collectFolderPaths(this.app.vault.getRoot(), this.expandedFolders);
		this.renderTree();
	}

	private collapseAll(): void {
		this.expandedFolders.clear();
		this.renderTree();
	}

	private collectFolderPaths(folder: TFolder, set: Set<string>): void {
		const excludeSet = this.plugin.getExcludeSet();
		for (const child of folder.children) {
			if (child instanceof TFolder && !excludeSet.has(child.name)) {
				set.add(child.path);
				this.collectFolderPaths(child, set);
			}
		}
	}

	private hasMatch(item: TAbstractFile, query: string): boolean {
		if (!query) return true;
		if (item.name.toLowerCase().includes(query)) return true;
		if (item instanceof TFolder) {
			return item.children.some((c) => this.hasMatch(c, query));
		}
		return false;
	}

	private countFiles(folder: TFolder, excludeSet: Set<string>): number {
		let count = 0;
		for (const child of folder.children) {
			if (excludeSet.has(child.name)) continue;
			if (child instanceof TFile) count++;
			else if (child instanceof TFolder) count += this.countFiles(child, excludeSet);
		}
		return count;
	}

	private getFormatted(folder: TFolder): string {
		switch (this.copyFormat) {
			case "paths": return this.plugin.generateFlatPaths(folder);
			case "json": return this.plugin.generateJSON(folder);
			default: return this.plugin.generateTree(folder);
		}
	}

	private renderFolder(folder: TFolder, parent: HTMLElement, depth: number, isRoot: boolean): void {
		const excludeSet = this.plugin.getExcludeSet();
		const { showFiles, maxDepth } = this.plugin.settings;
		const query = this.filterQuery;

		const children = this.sortChildren(folder.children)
			.filter((c) => !excludeSet.has(c.name))
			.filter((c) => this.hasMatch(c, query));

		const visible = showFiles ? children : children.filter((c) => c instanceof TFolder);

		if (isRoot) {
			visible.forEach((child) => this.renderItem(child, parent, depth));
			return;
		}

		// When filter is active, always expand folders that have matching children
		const isExpanded = query.length > 0 || this.expandedFolders.has(folder.path);
		const fileCount = this.countFiles(folder, excludeSet);

		const row = parent.createDiv("treegen-row treegen-folder-row");
		row.style.paddingLeft = `${depth * 16}px`;

		const toggle = row.createSpan("treegen-toggle");
		toggle.setText(isExpanded ? "▾" : "▸");

		row.createSpan({ text: folder.name, cls: "treegen-folder-name" });

		if (fileCount > 0) {
			row.createSpan({ text: String(fileCount), cls: "treegen-badge" });
		}

		const copyBtn = row.createEl("button", { cls: "treegen-copy-btn", attr: { "aria-label": "Copy" } });
		copyBtn.innerHTML = COPY_ICON;
		copyBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			await navigator.clipboard.writeText(this.getFormatted(folder));
			new Notice(`"${folder.name}" copied!`);
		});

		const childContainer = parent.createDiv("treegen-children");
		childContainer.style.display = isExpanded ? "block" : "none";

		if (depth < maxDepth) {
			visible.forEach((child) => this.renderItem(child, childContainer, depth + 1));
		}

		row.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest(".treegen-copy-btn")) return;
			if (query.length > 0) return; // no toggling while filter is active
			const expanded = this.expandedFolders.has(folder.path);
			if (expanded) {
				this.expandedFolders.delete(folder.path);
				toggle.setText("▸");
				childContainer.style.display = "none";
			} else {
				this.expandedFolders.add(folder.path);
				toggle.setText("▾");
				childContainer.style.display = "block";
			}
		});
	}

	private renderItem(item: TAbstractFile, parent: HTMLElement, depth: number): void {
		if (item instanceof TFolder) {
			this.renderFolder(item, parent, depth, false);
		} else if (item instanceof TFile && this.plugin.settings.showFiles) {
			const query = this.filterQuery;
			const isMatch = !query || item.name.toLowerCase().includes(query);
			const row = parent.createDiv("treegen-row treegen-file-row" + (isMatch && query ? " treegen-match" : ""));
			row.style.paddingLeft = `${depth * 16 + 18}px`;
			row.createSpan({ text: item.name, cls: "treegen-file-name" });

			const copyBtn = row.createEl("button", { cls: "treegen-copy-btn", attr: { "aria-label": "Copy path" } });
			copyBtn.innerHTML = COPY_ICON;
			copyBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				await navigator.clipboard.writeText(item.path);
				new Notice(`Path copied!`);
			});

			row.addEventListener("click", (e) => {
				if ((e.target as HTMLElement).closest(".treegen-copy-btn")) return;
				this.app.workspace.getLeaf(e.ctrlKey || e.metaKey).openFile(item);
			});
		}
	}

	private sortChildren(children: TAbstractFile[]): TAbstractFile[] {
		return [...children].sort((a, b) => {
			const aIsFolder = a instanceof TFolder;
			const bIsFolder = b instanceof TFolder;
			if (aIsFolder && !bIsFolder) return -1;
			if (!aIsFolder && bIsFolder) return 1;
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
		});
	}

	async onClose(): Promise<void> {
		// nothing to clean up
	}
}
