import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
} from "obsidian";
import { TREEGEN_VIEW_TYPE, TreeGenView } from "./TreeView";

export type IndentStyle = "lines" | "rounded" | "ascii" | "minimal" | "compact";

interface StyleDef {
	branch: string;
	last: string;
	pipe: string;
	indent: string;
}

export const INDENT_STYLES: Record<IndentStyle, StyleDef> = {
	lines:   { branch: "├── ", last: "└── ", pipe: "│   ", indent: "    " },
	rounded: { branch: "├── ", last: "╰── ", pipe: "│   ", indent: "    " },
	ascii:   { branch: "+-- ", last: "\\-- ", pipe: "|   ", indent: "    " },
	minimal: { branch: "· ",   last: "· ",   pipe: "  ",   indent: "  "   },
	compact: { branch: "",     last: "",      pipe: "  ",   indent: "  "   },
};

interface TreeGenSettings {
	maxDepth: number;
	showFiles: boolean;
	excludePatterns: string;
	indentStyle: IndentStyle;
	rootName: "folder" | "path" | "none";
}

const DEFAULT_SETTINGS: TreeGenSettings = {
	maxDepth: 10,
	showFiles: true,
	excludePatterns: ".obsidian,.git",
	indentStyle: "lines",
	rootName: "folder",
};

export default class TreeGenPlugin extends Plugin {
	settings: TreeGenSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(TREEGEN_VIEW_TYPE, (leaf) => new TreeGenView(leaf, this));

		this.addRibbonIcon("list-tree", "TreeGen", () => {
			this.activateView();
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) return;

				menu.addItem((item) => {
					item
						.setTitle("Copy as tree")
						.setIcon("list-tree")
						.onClick(async () => {
							const tree = this.generateTree(file);
							await navigator.clipboard.writeText(tree);
							new Notice("Tree copied to clipboard!");
						});
				});
			})
		);

		this.addCommand({
			id: "copy-vault-tree",
			name: "Copy vault root as tree",
			callback: async () => {
				const root = this.app.vault.getRoot();
				const tree = this.generateTree(root);
				await navigator.clipboard.writeText(tree);
				new Notice("Vault tree copied to clipboard!");
			},
		});

		this.addCommand({
			id: "open-treegen-view",
			name: "Open TreeGen panel",
			callback: () => this.activateView(),
		});

		this.addSettingTab(new TreeGenSettingTab(this.app, this));
	}

	async onunload() {
		this.app.workspace.detachLeavesOfType(TREEGEN_VIEW_TYPE);
	}

	async activateView() {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TREEGEN_VIEW_TYPE);

		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		await leaf?.setViewState({ type: TREEGEN_VIEW_TYPE, active: true });
		if (leaf) workspace.revealLeaf(leaf);
	}

	getExcludeSet(): Set<string> {
		return new Set(
			this.settings.excludePatterns
				.split(",")
				.map((p) => p.trim())
				.filter((p) => p.length > 0)
		);
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

	generateTree(folder: TFolder): string {
		const excludeSet = this.getExcludeSet();
		const lines: string[] = [];

		const rootLabel =
			this.settings.rootName === "none"
				? null
				: this.settings.rootName === "path"
				? folder.path || folder.name
				: folder.name || this.app.vault.getName();

		if (rootLabel !== null) {
			lines.push(rootLabel + "/");
		}

		this.buildLines(folder, "", lines, excludeSet, 0);

		return lines.join("\n");
	}

	private buildLines(
		folder: TFolder,
		prefix: string,
		lines: string[],
		excludeSet: Set<string>,
		depth: number
	): void {
		if (depth >= this.settings.maxDepth) return;

		const children = this.sortChildren(folder.children).filter(
			(child) => !excludeSet.has(child.name)
		);

		const visible = this.settings.showFiles
			? children
			: children.filter((c) => c instanceof TFolder);

		const style = INDENT_STYLES[this.settings.indentStyle];

		visible.forEach((child, index) => {
			const isLast = index === visible.length - 1;
			const connector = isLast ? style.last : style.branch;
			const childPrefix = prefix + (isLast ? style.indent : style.pipe);

			if (child instanceof TFolder) {
				lines.push(prefix + connector + child.name + "/");
				this.buildLines(child, childPrefix, lines, excludeSet, depth + 1);
			} else if (child instanceof TFile) {
				lines.push(prefix + connector + child.name);
			}
		});
	}

	generateFlatPaths(folder: TFolder): string {
		const excludeSet = this.getExcludeSet();
		const paths: string[] = [];
		this.collectPaths(folder, paths, excludeSet);
		return paths.join("\n");
	}

	private collectPaths(folder: TFolder, paths: string[], excludeSet: Set<string>): void {
		const children = this.sortChildren(folder.children).filter(
			(c) => !excludeSet.has(c.name)
		);
		for (const child of children) {
			if (child instanceof TFile && this.settings.showFiles) {
				paths.push(child.path);
			} else if (child instanceof TFolder) {
				this.collectPaths(child, paths, excludeSet);
			}
		}
	}

	generateJSON(folder: TFolder): string {
		const excludeSet = this.getExcludeSet();
		return JSON.stringify(this.buildJSON(folder, excludeSet), null, 2);
	}

	private buildJSON(folder: TFolder, excludeSet: Set<string>): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		const children = this.sortChildren(folder.children).filter(
			(c) => !excludeSet.has(c.name)
		);
		for (const child of children) {
			if (child instanceof TFolder) {
				result[child.name + "/"] = this.buildJSON(child, excludeSet);
			} else if (child instanceof TFile && this.settings.showFiles) {
				result[child.name] = null;
			}
		}
		return result;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TreeGenSettingTab extends PluginSettingTab {
	plugin: TreeGenPlugin;

	constructor(app: App, plugin: TreeGenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Max depth")
			.setDesc("How many folder levels deep to traverse (1–20).")
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.maxDepth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxDepth = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show files")
			.setDesc("Include files in the tree. Disable to show folders only.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showFiles)
					.onChange(async (value) => {
						this.plugin.settings.showFiles = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Exclude patterns")
			.setDesc(
				"Comma-separated list of folder/file names to exclude (e.g. .obsidian,.git,node_modules)."
			)
			.addText((text) =>
				text
					.setPlaceholder(".obsidian,.git,node_modules")
					.setValue(this.plugin.settings.excludePatterns)
					.onChange(async (value) => {
						this.plugin.settings.excludePatterns = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Tree style")
			.setDesc("Character style used for tree connectors.")
			.addDropdown((drop) =>
				drop
					.addOption("lines",   "Lines  (├── └── │)")
					.addOption("rounded", "Rounded (├── ╰── │)")
					.addOption("ascii",   "ASCII  (+-- \\-- |)")
					.addOption("minimal", "Minimal (·)")
					.addOption("compact", "Compact (indent only)")
					.setValue(this.plugin.settings.indentStyle)
					.onChange(async (value) => {
						this.plugin.settings.indentStyle = value as IndentStyle;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Root label")
			.setDesc("What to show as the top-level label of the tree.")
			.addDropdown((drop) =>
				drop
					.addOption("folder", "Folder name")
					.addOption("path", "Full path")
					.addOption("none", "None (no root label)")
					.setValue(this.plugin.settings.rootName)
					.onChange(async (value) => {
						this.plugin.settings.rootName = value as "folder" | "path" | "none";
						await this.plugin.saveSettings();
					})
			);
	}
}
