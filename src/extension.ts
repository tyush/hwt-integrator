// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as child from 'child_process';
import { assert } from 'console';
import { TreeItem } from 'vscode';
import path = require('path');

let globalFileCache: Map<string, PluginOutput[]> = new Map();
var scanning = false;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// verify the correct version of clang is installed
	try {
		console.log(child.execSync(clang() + " --version"));
	} catch (e) {
		vscode.window.showErrorMessage("This plugin requires Clang/LLVM version 13 to operate.\nPlease ensure clang-13 is installed.");
	}

	// verify plugin path
	if (!vscode.workspace.getConfiguration("hwt-integrator").get("pluginPath")) {
		vscode.window.showErrorMessage("Path to your libChallenge1Lib.so/dylib is unknown.", "Set Path").then(_ => {
			vscode.window.showInputBox({
				ignoreFocusOut: true,
				prompt: "Specify path to libChallenge1Lib.so/dylib",
				placeHolder: "/usr/lib/libChallenge1Lib.so",
				title: "Set Path",
			}).then(v => {
				vscode.workspace.getConfiguration("hwt-integrator").update("pluginPath", v);
			});
		});
	}

	const pluginArgs = getPluginArgs();

	let flags = vscode.workspace.getConfiguration("hwt-integrator.pluginFlags");
	for (const arg of pluginArgs) {
		if (!flags.has(arg.flag)) {
			flags.update(arg.flag, false);
		}
	}

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('hwt-integrator.runCompilerPlugin', (maybeFile: string, enabledArgs: string[]) => {
		scanning = true;
		const file = maybeFile ?? vscode.window.activeTextEditor?.document.uri.fsPath;

		const flags = vscode.workspace.getConfiguration("hwt-integrator").get<any>("pluginFlags");
		console.debug(Object.keys(flags));
		let enabledFlags = [];
		for (const flag in flags) {
			if (flags[flag]) {
				enabledFlags.push(flag);
			}
		}

		const smooshedFlags = enabledFlags.map(f => "-plugin-arg-Challenge1 " + f).join(" ");
		console.debug(clang() + " -cc1 -load \"" + pluginPath() + "\" -plugin Challenge1 " + smooshedFlags + " " + file);
		child.exec(clang() + " -cc1 -load \"" + pluginPath() + "\" -plugin Challenge1 " + smooshedFlags + " " + file,
			(error, stdout, stderr) => {
				console.debug("error: " + error);
				console.debug("stdout: " + stdout);
				console.debug("stderr: " + stderr);
				if (error || stderr.length > 3) {
					vscode.window.showErrorMessage("error: " + error ?? stderr);
					return;
				}
				scanning = false;
				vscode.commands.executeCommand("hwt-integrator.interpretResults", stdout).then(() => { }, e => console.log("rejected: " + e));
			});

	});

	context.subscriptions.push(disposable);

	context.subscriptions.push(
		vscode.commands.registerCommand('hwt-integrator.interpretResults', (stdout: string) => {
			console.log("stdout: stdout " + stdout);
			const results = stdout
				.split("\n")
				.map(parseOutputLine)
				.filter((x, _1, _2) => x !== undefined)
				.map(x => x!);

			globalFileCache = new Map();

			for (const result of results) {
				console.debug("pluginoutput: ", JSON.stringify(result));
				if (globalFileCache.has(path.basename(result.file))) {
					let withChanges = globalFileCache.get(path.basename(result.file));
					if (withChanges) {
						globalFileCache.set(path.basename(result.file), [result, ...withChanges]);
					} else {
						globalFileCache.set(path.basename(result.file), [result]);
					}
				} else {
					globalFileCache.set(path.basename(result.file), [result]);
				}
			}
			requestUpdate();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hwt-integrator.setArgState', (arg) => {
			let flags = vscode.workspace.getConfiguration("hwt-integrator.pluginFlags");
			if (flags.has(arg)) {
				flags.update(arg, !flags.get(arg));
				vscode.window.showInformationMessage("Updated flag " + arg + " to value " + flags.get(arg) ?? " none");
			} else {
				flags.update(arg, true);
				vscode.window.showInformationMessage("Created flag " + arg + " to value " + flags.get(arg) ?? " none");
			}
			requestUpdate();
		})
	);

	vscode.window.createTreeView('hwt-plugin', {
		treeDataProvider: new PluginOutputTreeProvider()
	});
}

const clang = () =>
	vscode.workspace.getConfiguration("hwt-integrator").get("clang");

function pluginPath(): string {
	const path = vscode.workspace.getConfiguration("hwt-integrator").get<string>("pluginPath");
	if (path === undefined) {
		vscode.window.showErrorMessage("Path to your libChallenge1Lib.so/dylib is unknown.");
	}
	return path ?? "";
}

function getPluginArgs(): PluginArg[] {
	// EVAL: yes, this takes user input and executes it, 
	//       unfiltered. im sorry. im running out of time.
	const help = child.execSync(clang() + " -cc1 -load \"" + pluginPath() + "\" -plugin Challenge1 -plugin-arg-Challenge1 -help");
	const lines = String.fromCharCode(...help).split("\n");
	let args: PluginArg[] = [];

	for (const line of lines) {
		if (line.startsWith("*") || line === "") { continue; }
		let [arg, desc] = line.split("\w+\:\w+");
		args.push({
			flag: arg,
			desc: desc
		});
	}

	return args;
}

type PluginArg = {
	flag: string,
	desc: string
};

// This method is called when your extension is deactivated
export function deactivate() { }

type PluginOutput = {
	typ: "VarDecl" | "FunctionDecl" | string,
	name: string,
	file: string,
	line: number,
	col: number,
};

function parseOutputLine(line: string): PluginOutput | undefined {
	try {

		// first 3 chars are useless
		let noFluff = line.slice(3);

		// next term is either VarDecl or FunctionDecl
		let [typ, nameAndPos] = noFluff.split(" = ");
		let [name, pos] = nameAndPos.split(" @ ");
		let [file, row, col] = pos.split(":");

		return {
			typ: typ,
			name: name,
			file: file,
			line: parseInt(row),
			col: parseInt(col)
		};
	} catch (e) {
		console.warn(e);
	}
}

function currentFile(): string {
	return path.basename(vscode.window.activeTextEditor!.document.uri.fsPath);
}

class PluginOutputTreeItem extends TreeItem {
	constructor(public output: PluginOutput) {
		super(output.name, vscode.TreeItemCollapsibleState.Collapsed);
	}
}

class PluginOutputTreeProvider implements vscode.TreeDataProvider<TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	constructor() {
		requestUpdate = () => {
			this._onDidChangeTreeData.fire(undefined);
		};
	}

	getChildren(element?: vscode.TreeItem | undefined): vscode.ProviderResult<vscode.TreeItem[]> {
		if (element === undefined) {
			let cacheEntry = globalFileCache.get(currentFile());

			if (cacheEntry !== undefined) {
				return [...cacheEntry.map(treeItemOfPluginOut), ...pluginSettingTreeItems()];
			} else {
				if (!scanning) {
					vscode.commands.executeCommand("hwt-integrator.runCompilerPlugin");
				}
				return [new TextTreeItem("loading..."), ...pluginSettingTreeItems()];
			}
		} else {
			if (element instanceof GotoTreeItem) {
				return [];
			}
			if (element instanceof TextTreeItem) {
				return [];
			}
			if (element instanceof PluginOutputTreeItem) {
				return [
					new TextTreeItem(element.output.name),
					new TextTreeItem(element.output.typ),
					new TextTreeItem(element.output.file),
					new TextTreeItem((element.output.line - 1) + ":" + element.output.col),
					new GotoTreeItem(element.output.file, element.output.line, element.output.col)
				];
			}
		}
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
		//return new TextTreeItem("don't really know how you got here...");
	}
}

let requestUpdate = () => { };

class GotoTreeItem extends TreeItem {
	constructor(public file: string, public line: number, public col: number) {
		super("Navigate >", vscode.TreeItemCollapsibleState.None);
		this.command = {
			command: "editor.action.goToLocations",
			title: "goto",
			arguments: [
				vscode.Uri.file(file),
				new vscode.Position(line, col),
				[new vscode.Location(vscode.Uri.file(file), new vscode.Position(line - 1, col))]
			]
		};
		console.log("args: "); console.log(this.command.arguments);
	}
}

class ToggleTreeItem extends TreeItem {
	constructor(public label: string, public state: boolean, public onClick: vscode.Command) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.checkboxState = state ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
		this.command = onClick;
	}
}

class TextTreeItem extends TreeItem {
	constructor(public text: string) {
		super(text, vscode.TreeItemCollapsibleState.None);
	}
}

const treeItemOfPluginOut = (out: PluginOutput) => new PluginOutputTreeItem(out);

function pluginSettingTreeItems() {
	let flags = vscode.workspace.getConfiguration("hwt-integrator.pluginFlags");
	return Object.keys(flags).filter(k => ["has", "update", "get", "inspect"].indexOf(k) === -1).map(k => new ToggleTreeItem(k, flags.get(k)!, {
		command: "hwt-integrator.setArgState",
		title: "set state",
		arguments: [
			k
		],
		tooltip: ""
	}));
}