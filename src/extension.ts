import * as vscode from 'vscode';
import { ConnectionService } from './services/connectionService';
import { SearchService } from './services/searchService';
import { ColumnService } from './services/columnService';
import { ScriptingService } from './services/scriptingService';
import { ScriptingDiagnostic } from './services/scriptingDiagnostic';
import { QuickPickProvider } from './ui/quickPickProvider';
import { ConfigurationService } from './models/configuration';
import { Logger } from './utils/logger';
import { ErrorHandler } from './utils/errorHandler';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	Logger.info('SQL Search Everywhere extension activating...');

	try {
		// Initialize services
		const configService = new ConfigurationService();
		const connectionService = new ConnectionService();

		// Initialize connection to vscode-mssql
		await connectionService.initialize();

		const columnService = new ColumnService(connectionService, configService);
		const scriptingService = new ScriptingService(connectionService, configService);
		const searchService = new SearchService(
			connectionService,
			columnService,
			configService
		);
		const quickPickProvider = new QuickPickProvider(
			scriptingService,
			configService
		);

		// Shared search handler
		const executeSearch = async (title: string, clearCache: boolean) => {
			try {
				Logger.debug(`Search command invoked (clearCache: ${clearCache})`);

				if (!connectionService.isInitialized()) {
					ErrorHandler.handleMissingMssqlExtension();
					return;
				}

				const items = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title,
						cancellable: false
					},
					async () => searchService.search('', clearCache)
				);

				await quickPickProvider.show(items);
			} catch (error) {
				ErrorHandler.handle(error, 'Search command failed');
			}
		};

		// Register search command
		const searchCommand = vscode.commands.registerCommand(
			'sql-searcheverywhere.search',
			() => executeSearch('Searching database objects...', false)
		);

		// Register search with cache clear command
		const searchClearCacheCommand = vscode.commands.registerCommand(
			'sql-searcheverywhere.searchClearCache',
			() => executeSearch('Refreshing and searching database objects...', true)
		);

		// Register scripting API diagnostic command (dev mode only)
		if (context.extensionMode === vscode.ExtensionMode.Development) {
			const diagnosticCommand = vscode.commands.registerCommand(
				'sql-searcheverywhere.runScriptingDiagnostic',
				async () => {
					try {
						Logger.debug('Scripting diagnostic command invoked');

						if (!connectionService.isInitialized()) {
							ErrorHandler.handleMissingMssqlExtension();
							return;
						}

						const diagnostic = new ScriptingDiagnostic(connectionService);
						await diagnostic.runDiagnostic();
					} catch (error) {
						ErrorHandler.handle(error, 'Scripting diagnostic failed');
					}
				}
			);
			context.subscriptions.push(diagnosticCommand);
		}

		// Add commands to context subscriptions
		context.subscriptions.push(searchCommand, searchClearCacheCommand);

		Logger.info('SQL Search Everywhere extension activated successfully');
	} catch (error) {
		Logger.error('Extension activation failed', error);
		ErrorHandler.handle(error, 'SQL Search Everywhere activation failed');
	}
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
	Logger.info('SQL Search Everywhere extension deactivated');
}
