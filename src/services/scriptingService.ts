import { DatabaseObjectItem } from '../models/databaseObject';
import { ConfigurationService } from '../models/configuration';
import { ConnectionService } from './connectionService';
import { Logger } from '../utils/logger';

/**
 * Service for generating SQL scripts
 */
export class ScriptingService {
	constructor(
		private connectionService: ConnectionService,
		private configService: ConfigurationService
	) {}

	/**
	 * Generates a script for a database object
	 */
	async generateScript(object: DatabaseObjectItem): Promise<string> {
		const action = this.configService.getActionForType(object.type);

		switch (action) {
			case 'Select':
				return await this.generateSelectScript(object);
			case 'Create':
				return await this.generateCreateScript(object);
			case 'Delete':
				return await this.generateDeleteScript(object);
			case 'Execute':
				return await this.generateExecuteScript(object);
			case 'Alter':
				return await this.generateAlterScriptViaApi(object);
			case 'Insert Name':
				return this.getQualifiedName(object);
		}
	}

	/**
	 * Generates a SELECT script via vscode-mssql API
	 */
	private async generateSelectScript(object: DatabaseObjectItem): Promise<string> {
		try {
			const script = await this.connectionService.scriptObject(
				0, // ScriptOperation.Select
				object.schema,
				object.name,
				object.type
			);

			if (script)
				return this.ensureTopClause(script, this.configService.getScriptRowLimit());

			Logger.warn(`scriptObject returned undefined for SELECT on ${this.getQualifiedName(object)}`);
			return `-- Could not generate SELECT script for ${this.getQualifiedName(object)}\nSELECT * FROM ${this.getQualifiedName(object)};\n`;
		} catch (error) {
			Logger.error('Failed to generate SELECT script via API', error);
			const rowLimit = this.configService.getScriptRowLimit();
			return `SELECT TOP ${rowLimit} *\nFROM ${this.getQualifiedName(object)};\n`;
		}
	}

	/**
	 * Generates an EXEC script via vscode-mssql API
	 */
	private async generateExecuteScript(object: DatabaseObjectItem): Promise<string> {
		try {
			const script = await this.connectionService.scriptObject(
				5, // ScriptOperation.Execute
				object.schema,
				object.name,
				object.type
			);

			if (script)
				return script;

			Logger.warn(`scriptObject returned undefined for EXECUTE on ${this.getQualifiedName(object)}`);
			const qualifiedName = this.getQualifiedName(object);
			return `EXEC ${qualifiedName};\n-- Specify parameters if required\n`;
		} catch (error) {
			Logger.error('Failed to generate EXECUTE script via API', error);
			const qualifiedName = this.getQualifiedName(object);
			return `EXEC ${qualifiedName};\n-- Specify parameters if required\n`;
		}
	}

	/**
	 * Gets the fully qualified object name
	 */
	private getQualifiedName(object: DatabaseObjectItem): string {
		return `[${object.schema}].[${object.name}]`;
	}

	/**
	 * Ensures a TOP N clause is present in the SELECT script
	 */
	private ensureTopClause(script: string, rowLimit: number): string {
		// Replace existing TOP clause with the specified limit
		if (/SELECT\s+TOP\s*(\(\s*\d+\s*\)|\d+)/i.test(script))
			return script.replace(/(SELECT\s+)TOP\s*(\(\s*\d+\s*\)|\d+)/i, `$1TOP ${rowLimit}`);

		// Add TOP clause after SELECT
		return script.replace(/^(\s*SELECT\s+)/i, `$1TOP ${rowLimit} `);
	}

	/**
	 * Generates a CREATE script via vscode-mssql API
	 */
	private async generateCreateScript(object: DatabaseObjectItem): Promise<string> {
		try {
			const script = await this.connectionService.scriptObject(
				1, // ScriptOperation.Create
				object.schema,
				object.name,
				object.type
			);

			if (script)
				return script;
			Logger.warn(`scriptObject returned undefined for CREATE on ${this.getQualifiedName(object)}`);
			return `-- Could not generate CREATE script for ${this.getQualifiedName(object)}\n`;
		} catch (error) {
			Logger.error('Failed to generate CREATE script', error);
			return `-- Error generating CREATE script for ${this.getQualifiedName(object)}\n`;
		}
	}

	/**
	 * Generates a DELETE template via API
	 */
	private async generateDeleteScript(object: DatabaseObjectItem): Promise<string> {
		try {
			const script = await this.connectionService.scriptObject(
				4, // ScriptOperation.Delete
				object.schema,
				object.name,
				object.type
			);

			if (script)
				return script;

			// Fallback: simple template
			Logger.warn(`scriptObject returned undefined for DELETE on ${this.getQualifiedName(object)}`);
			return `-- Could not generate DELETE script for ${this.getQualifiedName(object)}\n`;
		} catch (error) {
			Logger.error('Failed to generate DELETE script', error);
			const qualifiedName = this.getQualifiedName(object);
			return `DELETE FROM ${qualifiedName}\nWHERE\n  -- Specify condition;\n`;
		}
	}

	/**
	 * Generates an ALTER script via vscode-mssql API
	 */
	private async generateAlterScriptViaApi(object: DatabaseObjectItem): Promise<string> {
		try {
			const script = await this.connectionService.scriptObject(
				6, // ScriptOperation.Alter
				object.schema,
				object.name,
				object.type
			);

			if (script)
				return script;

			Logger.warn(`scriptObject returned undefined for ALTER on ${this.getQualifiedName(object)}`);
			return `-- Could not generate ALTER script for ${this.getQualifiedName(object)}\n`;			
		} catch (error) {
			Logger.error('Failed to generate ALTER script via API', error);
			return `-- Could not generate ALTER script for ${this.getQualifiedName(object)}\n`;
		}
	}

}
