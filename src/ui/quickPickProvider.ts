import * as vscode from 'vscode';
import { DatabaseObjectItem, DatabaseObjectQuickPickItem } from '../models/databaseObject';
import { ConfigurationService } from '../models/configuration';
import { ScriptingService } from '../services/scriptingService';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errorHandler';
import { getObjectIcon } from '../constants/icons';

/**
 * Provider for displaying QuickPick with search results
 */
export class QuickPickProvider {
	constructor(
		private scriptingService: ScriptingService,
		private configService: ConfigurationService
	) {}

	/**
	 * Shows QuickPick with search results
	 */
	async show(items: DatabaseObjectItem[]): Promise<void> {
		if (items.length === 0) {
			vscode.window.showInformationMessage('No database objects found');
			return;
		}

		const quickPick = vscode.window.createQuickPick<DatabaseObjectQuickPickItem>();

		quickPick.placeholder = 'Search database objects...';
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.items = this.createQuickPickItems(items);

		quickPick.onDidChangeSelection(async selection => {
			if (selection[0]) {
				quickPick.hide();
				await this.handleSelection(selection[0]);
			}
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		quickPick.show();
	}

	/**
	 * Creates QuickPick items from database objects
	 */
	private createQuickPickItems(objects: DatabaseObjectItem[]): DatabaseObjectQuickPickItem[] {
		return objects.map(obj => ({
			label: `$(${getObjectIcon(obj.type)}) ${obj.name}`,
			description: `${obj.schema} • ${this.formatObjectType(obj.type)}`,
			detail: obj.columns ? `Columns: ${obj.columns}` : undefined,
			object: obj
		}));
	}

	/**
	 * Formats the object type for display
	 */
	private formatObjectType(type: string): string {
		switch (type) {
			case 'Table':
				return 'Table';
			case 'View':
				return 'View';
			case 'StoredProcedure':
				return 'Stored Procedure';
			case 'ScalarValuedFunction':
				return 'Scalar Function';
			case 'TableValuedFunction':
				return 'Table-valued Function';
			case 'Synonym':
				return 'Synonym';
			default:
				return type;
		}
	}

	/**
	 * Handles user object selection
	 */
	private async handleSelection(item: DatabaseObjectQuickPickItem): Promise<void> {
		try {
			const action = this.configService.getActionForType(item.object.type);
			Logger.debug(`Handling selection: ${item.object.name}, action: ${action}`);

			switch (action) {
				case 'Select':
				case 'Create':
				case 'Delete':
				case 'Execute':
				case 'Alter':
					await this.insertScript(item.object);
					break;
				case 'Insert Name':
					await this.insertName(item.object);
					break;
			}
		} catch (error) {
			ErrorHandler.handle(error, 'Failed to handle object selection');
		}
	}

	/**
	 * Inserts a script into the editor
	 */
	private async insertScript(object: DatabaseObjectItem): Promise<void> {
		const script = await this.scriptingService.generateScript(object);
		await this.insertTextIntoEditor(script);
	}

	/**
	 * Inserts the qualified object name into the editor
	 */
	private async insertName(object: DatabaseObjectItem): Promise<void> {
		const qualifiedName = `[${object.schema}].[${object.name}]`;

		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor');
			return;
		}

		// Always insert at cursor position, don't create a new file
		const position = editor.selection.active;
		await editor.edit(editBuilder => {
			editBuilder.insert(position, qualifiedName);
		});
	}

	/**
	 * Inserts text into the active editor or creates a new document
	 */
	private async insertTextIntoEditor(text: string): Promise<void> {
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			// Check if the document contains text
			const documentText = editor.document.getText();
			const hasContent = documentText.trim().length > 0;

			if (hasContent) {
				// Open in a new file if the document contains text
				const doc = await vscode.workspace.openTextDocument({
					language: 'sql',
					content: text
				});
				await vscode.window.showTextDocument(doc);
			} else {
				// Insert into the empty document at cursor position
				const position = editor.selection.active;
				await editor.edit(editBuilder => {
					editBuilder.insert(position, text);
				});
			}
		} else {
			// Create a new SQL document
			const doc = await vscode.workspace.openTextDocument({
				language: 'sql',
				content: text
			});
			await vscode.window.showTextDocument(doc);
		}
	}
}
