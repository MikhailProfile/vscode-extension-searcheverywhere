import * as vscode from 'vscode';

/**
 * Database object type
 */
export type DatabaseObjectType =
	| 'Table'
	| 'View'
	| 'StoredProcedure'
	| 'ScalarValuedFunction'
	| 'TableValuedFunction'
	| 'Synonym';

/**
 * Action on object selection
 */
export type ObjectAction =
	| 'Select'       // SELECT script (tables, views, functions)
	| 'Create'       // CREATE script from DB metadata
	| 'Delete'       // DELETE template
	| 'Execute'      // EXEC script (procedures)
	| 'Alter'        // ALTER script (views, procedures, functions)
	| 'Insert Name'; // Insert object name

/**
 * Database object with extended information
 */
export interface DatabaseObjectItem {
	/** Object name */
	name: string;
	/** Object schema */
	schema: string;
	/** Object type */
	type: DatabaseObjectType;
	/** Database name the object belongs to */
	database?: string;
	/** Column list (for tables and views) */
	columns?: string;
	/** Object definition (for procedures and functions) */
	definition?: string;
}

/**
 * QuickPick item for displaying an object
 */
export interface DatabaseObjectQuickPickItem extends vscode.QuickPickItem {
	/** Source database object */
	object: DatabaseObjectItem;
}
