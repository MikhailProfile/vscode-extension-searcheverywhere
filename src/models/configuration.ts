import * as vscode from 'vscode';
import { DatabaseObjectType, ObjectAction } from './databaseObject';

/**
 * Extension configuration
 */
export interface SearchEverywhereConfiguration {
	/** Include column information in search results */
	includeTableColumns: boolean;

	/** Action for tables */
	tableAction: ObjectAction;

	/** Action for views */
	viewAction: ObjectAction;

	/** Action for stored procedures */
	storedProcedureAction: ObjectAction;

	/** Action for functions */
	functionAction: ObjectAction;

	/** Row limit for SELECT scripts */
	scriptRowLimit: number;
}

/**
 * Service for managing extension configuration
 */
export class ConfigurationService {
	private readonly configSection = 'sqlSearchEverywhere';

	/**
	 * Gets the current configuration
	 */
	getConfiguration(): SearchEverywhereConfiguration {
		const config = vscode.workspace.getConfiguration(this.configSection);

		return {
			includeTableColumns: config.get('includeTableColumns', false),
			tableAction: config.get('actions.table', 'Select') as ObjectAction,
			viewAction: config.get('actions.view', 'Select') as ObjectAction,
			storedProcedureAction: config.get('actions.storedProcedure', 'Alter') as ObjectAction,
			functionAction: config.get('actions.function', 'Alter') as ObjectAction,
			scriptRowLimit: config.get('scriptRowLimit', 1000)
		};
	}

	/**
	 * Checks if the column display option is enabled
	 */
	includeTableColumns(): boolean {
		return this.getConfiguration().includeTableColumns;
	}

	/**
	 * Gets the action for an object type
	 */
	getActionForType(type: DatabaseObjectType): ObjectAction {
		const config = this.getConfiguration();

		switch (type) {
			case 'Table':
				return config.tableAction;
			case 'View':
				return config.viewAction;
			case 'StoredProcedure':
				return config.storedProcedureAction;
			case 'ScalarValuedFunction':
			case 'TableValuedFunction':
				return config.functionAction;
			default:
				return 'Select';
		}
	}

	/**
	 * Gets the row limit for SELECT scripts
	 */
	getScriptRowLimit(): number {
		return this.getConfiguration().scriptRowLimit;
	}
}
