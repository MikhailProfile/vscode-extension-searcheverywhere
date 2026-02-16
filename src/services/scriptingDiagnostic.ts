import * as vscode from 'vscode';
import { ConnectionService } from './connectionService';
import { Logger } from '../utils/logger';

/**
 * Scripting operations enum (from vscode-mssql)
 */
enum ScriptOperation {
	Select = 0,
	Create = 1,
	Insert = 2,
	Update = 3,
	Delete = 4,
	Execute = 5,
	Alter = 6
}

/**
 * Object types for testing
 */
const OBJECT_TYPES = [
	'Table',
	'View',
	'StoredProcedure',
	'ScalarValuedFunction',
	'TableValuedFunction'
] as const;

/**
 * Operations for testing
 */
const OPERATIONS = [
	{ name: 'Select', value: ScriptOperation.Select },
	{ name: 'Create', value: ScriptOperation.Create },
	{ name: 'Insert', value: ScriptOperation.Insert },
	{ name: 'Update', value: ScriptOperation.Update },
	{ name: 'Delete', value: ScriptOperation.Delete },
	{ name: 'Execute', value: ScriptOperation.Execute },
	{ name: 'Alter', value: ScriptOperation.Alter }
] as const;

/**
 * Test result
 */
interface TestResult {
	objectType: string;
	objectName: string;
	schema: string;
	operation: string;
	operationValue: number;
	success: boolean;
	scriptLength?: number;
	error?: string;
}

/**
 * Object search information
 */
interface ObjectSearchInfo {
	type: string;
	found: boolean;
	schema?: string;
	name?: string;
	error?: string;
}

/**
 * Scripting API diagnostic service
 */
export class ScriptingDiagnostic {
	private searchInfo: ObjectSearchInfo[] = [];
	private currentDatabase: string = 'unknown';

	constructor(private connectionService: ConnectionService) {}

	/**
	 * Runs full scripting API diagnostics
	 */
	async runDiagnostic(): Promise<void> {
		Logger.info('Starting scripting API diagnostic...');

		const results: TestResult[] = [];
		this.searchInfo = [];

		// Get the current DB name for the report
		this.currentDatabase = await this.connectionService.getActiveDatabase() || 'unknown';
		Logger.info(`Active database: ${this.currentDatabase}`);

		// Get test objects from the database
		const testObjects = await this.getTestObjects();

		if (testObjects.length === 0) {
			vscode.window.showWarningMessage('No database objects found for testing. Make sure you have an active connection.');
			await this.showResults(results); // Show the report even with no objects
			return;
		}

		// Progress bar
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Testing scriptObject API',
				cancellable: true
			},
			async (progress, token) => {
				const totalTests = testObjects.length * OPERATIONS.length;
				let completedTests = 0;

				for (const obj of testObjects) {
					if (token.isCancellationRequested)
						break;

					for (const op of OPERATIONS) {
						if (token.isCancellationRequested)
							break;

						progress.report({
							message: `${obj.type}: ${op.name} (${completedTests}/${totalTests})`,
							increment: (100 / totalTests)
						});

						const result = await this.testScriptObject(obj, op);
						results.push(result);
						completedTests++;
					}
				}
			}
		);

		// Display results
		await this.showResults(results);
	}

	/**
	 * Gets test objects of each type from the database
	 */
	private async getTestObjects(): Promise<Array<{type: string, schema: string, name: string}>> {
		const objects: Array<{type: string, schema: string, name: string}> = [];

		// Execute separate queries for each object type
		const queries = [
			{
				type: 'Table',
				query: `SELECT TOP 1 s.name AS SchemaName, t.name AS ObjectName
						FROM sys.tables t
						INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
						WHERE t.is_ms_shipped = 0
						ORDER BY t.name`
			},
			{
				type: 'View',
				query: `SELECT TOP 1 s.name AS SchemaName, v.name AS ObjectName
						FROM sys.views v
						INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
						WHERE v.is_ms_shipped = 0
						ORDER BY v.name`
			},
			{
				type: 'StoredProcedure',
				query: `SELECT TOP 1 s.name AS SchemaName, p.name AS ObjectName
						FROM sys.procedures p
						INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
						WHERE p.is_ms_shipped = 0
						ORDER BY p.name`
			},
			{
				type: 'ScalarValuedFunction',
				query: `SELECT TOP 1 s.name AS SchemaName, o.name AS ObjectName
						FROM sys.objects o
						INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
						WHERE o.type = 'FN' AND o.is_ms_shipped = 0
						ORDER BY o.name`
			},
			{
				type: 'TableValuedFunction',
				query: `SELECT TOP 1 s.name AS SchemaName, o.name AS ObjectName
						FROM sys.objects o
						INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
						WHERE o.type IN ('IF', 'TF') AND o.is_ms_shipped = 0
						ORDER BY o.name`
			},
			// Alternative type names for functions (check both variants)
			{
				type: 'UserDefinedFunction',
				query: `SELECT TOP 1 s.name AS SchemaName, o.name AS ObjectName
						FROM sys.objects o
						INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
						WHERE o.type = 'FN' AND o.is_ms_shipped = 0
						ORDER BY o.name`
			},
			{
				type: 'Function',
				query: `SELECT TOP 1 s.name AS SchemaName, o.name AS ObjectName
						FROM sys.objects o
						INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
						WHERE o.type IN ('FN', 'IF', 'TF') AND o.is_ms_shipped = 0
						ORDER BY o.name`
			}
		];

		for (const q of queries) {
			try {
				// Use executeQueryWithDatabase for correct DB context
				const result = await this.connectionService.executeQueryWithDatabase<{
					SchemaName: string,
					ObjectName: string
				}>(q.query);

				if (result && result.length > 0) {
					objects.push({
						type: q.type,
						schema: result[0].SchemaName,
						name: result[0].ObjectName
					});
					this.searchInfo.push({
						type: q.type,
						found: true,
						schema: result[0].SchemaName,
						name: result[0].ObjectName
					});
					Logger.info(`Found ${q.type}: [${result[0].SchemaName}].[${result[0].ObjectName}]`);
				} else {
					this.searchInfo.push({
						type: q.type,
						found: false,
						error: 'No objects found in database'
					});
					Logger.warn(`No ${q.type} objects found in database`);
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				this.searchInfo.push({
					type: q.type,
					found: false,
					error: errorMsg
				});
				Logger.error(`Failed to query ${q.type} objects`, error);
			}
		}

		Logger.info(`Total test objects: ${objects.length}`);
		return objects;
	}

	/**
	 * Tests a single scriptObject call
	 */
	private async testScriptObject(
		obj: {type: string, schema: string, name: string},
		op: {name: string, value: number}
	): Promise<TestResult> {
		const result: TestResult = {
			objectType: obj.type,
			objectName: obj.name,
			schema: obj.schema,
			operation: op.name,
			operationValue: op.value,
			success: false
		};

		try {
			// DO NOT clear cache - reuse a single connection for all tests
			// Cache clearing caused connection recreation, which due to a vscode-mssql bug
			// always created connections in the master DB

			Logger.debug(`Testing scriptObject: ${obj.type} [${obj.schema}].[${obj.name}] - ${op.name}(${op.value})`);

			const script = await this.connectionService.scriptObject(
				op.value,
				obj.schema,
				obj.name,
				obj.type
			);

			if (script) {
				result.success = true;
				result.scriptLength = script.length;
				Logger.debug(`SUCCESS: ${obj.type}/${op.name} - script length: ${script.length}`);
			} else {
				result.success = false;
				result.error = 'Returned undefined';
				Logger.debug(`FAILED: ${obj.type}/${op.name} - returned undefined`);
			}
		} catch (error) {
			result.success = false;
			result.error = error instanceof Error ? error.message : String(error);
			Logger.debug(`ERROR: ${obj.type}/${op.name} - ${result.error}`);
		}

		return result;
	}

	/**
	 * Displays results as a table in a new document
	 */
	private async showResults(results: TestResult[]): Promise<void> {
		// Group results by object type
		const groupedResults = new Map<string, Map<string, TestResult>>();

		for (const result of results) {
			if (!groupedResults.has(result.objectType))
				groupedResults.set(result.objectType, new Map());
			groupedResults.get(result.objectType)!.set(result.operation, result);
		}

		// Build report text
		let report = '-- scriptObject API Diagnostic Report\n';
		report += `-- Generated: ${new Date().toISOString()}\n`;
		report += `-- Database: ${this.currentDatabase}\n`;
		report += '-- \n\n';

		// Object discovery section
		report += '-- OBJECT DISCOVERY\n';
		report += '-- =================\n';
		for (const info of this.searchInfo) {
			if (info.found)
				report += `-- [FOUND] ${info.type}: [${info.schema}].[${info.name}]\n`;
			else
				report += `-- [NOT FOUND] ${info.type}: ${info.error}\n`;
		}
		report += '\n';

		// Summary table
		report += '-- COMPATIBILITY MATRIX\n';
		report += '-- =====================\n';
		report += '-- Legend: OK = works, X = fails/undefined\n\n';

		// Table header
		const ops = OPERATIONS.map(o => o.name.padEnd(8)).join(' | ');
		report += `-- ${'ObjectType'.padEnd(25)} | ${ops}\n`;
		report += `-- ${'-'.repeat(25)}-|-${OPERATIONS.map(() => '-'.repeat(8)).join('-|-')}\n`;

		// Table rows
		for (const [objectType, operationResults] of groupedResults) {
			const cells = OPERATIONS.map(op => {
				const result = operationResults.get(op.name);
				if (!result)
					return '?'.padEnd(8);
				return (result.success ? 'OK' : 'X').padEnd(8);
			}).join(' | ');

			report += `-- ${objectType.padEnd(25)} | ${cells}\n`;
		}

		report += '\n\n';

		// Detailed results
		report += '-- DETAILED RESULTS\n';
		report += '-- ================\n\n';

		for (const result of results) {
			const status = result.success ? 'OK' : 'FAIL';
			const details = result.success
				? `script length: ${result.scriptLength}`
				: `error: ${result.error}`;
			report += `-- [${status}] ${result.objectType}.${result.operation}(${result.operationValue}): [${result.schema}].[${result.objectName}] - ${details}\n`;
		}

		// Statistics
		const successCount = results.filter(r => r.success).length;
		const failCount = results.filter(r => !r.success).length;

		report += '\n\n';
		report += '-- SUMMARY\n';
		report += '-- =======\n';
		report += `-- Total tests: ${results.length}\n`;
		report += `-- Successful: ${successCount} (${Math.round(successCount / results.length * 100)}%)\n`;
		report += `-- Failed: ${failCount} (${Math.round(failCount / results.length * 100)}%)\n`;

		// Open a new document with the results
		const doc = await vscode.workspace.openTextDocument({
			content: report,
			language: 'sql'
		});
		await vscode.window.showTextDocument(doc);

		// Show brief summary
		vscode.window.showInformationMessage(
			`Scripting API Diagnostic: ${successCount}/${results.length} tests passed`
		);
	}
}
