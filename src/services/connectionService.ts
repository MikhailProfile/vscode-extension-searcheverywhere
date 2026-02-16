import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errorHandler';

/**
 * Interface for Connection Sharing Service from vscode-mssql
 */
interface IConnectionSharingService {
	getActiveEditorConnectionId(extensionId: string): Promise<string | undefined>;
	getActiveDatabase(extensionId: string): Promise<string | undefined>;
	connect(extensionId: string, connectionId: string, database?: string): Promise<string | undefined>;
	disconnect(connectionUri: string): void;
	executeSimpleQuery(connectionUri: string, queryString: string): Promise<SimpleExecuteResult>;
	listDatabases(connectionUri: string): Promise<string[]>;
	scriptObject(connectionUri: string, operation: number, scriptingObject: any): Promise<string | undefined>;
}

/**
 * Simple SQL query execution result
 */
interface SimpleExecuteResult {
	rowCount: number;
	columnInfo: IDbColumn[];
	rows: DbCellValue[][];
}

/**
 * Column information
 */
interface IDbColumn {
	columnName: string;
	dataTypeName: string;
}

/**
 * Cell value
 */
interface DbCellValue {
	displayValue: string;
	isNull: boolean;
}

/**
 * SQL Server connection information
 */
interface IConnectionInfo {
	server: string;
	database?: string;
	user?: string;
	password?: string;
	authenticationType?: string;
	encrypt?: string | boolean;
	trustServerCertificate?: boolean;
	connectionString?: string;
	port?: number;
	[key: string]: any;
}

/**
 * Interface for vscode-mssql extension API
 */
interface IMssqlExtension {
	connectionSharing: IConnectionSharingService;
	// Legacy API — used to create connections with the correct DB context
	connect(connectionInfo: IConnectionInfo, saveConnection?: boolean): Promise<string>;
	getConnectionString(connectionUriOrDetails: string, includePassword?: boolean): Promise<string>;
}

/**
 * Service for managing database connections via vscode-mssql
 */
export class ConnectionService {
	private static readonly EXTENSION_ID = 'vscode-sql-searcheverywhere';
	private mssqlExtension: vscode.Extension<IMssqlExtension> | undefined;
	private mssqlApi: IMssqlExtension | undefined;

	// Connection cache - reuse a single connection for all operations
	private cachedConnectionUri: string | undefined;
	private cachedConnectionId: string | undefined;
	private cachedDatabase: string | undefined;

	// Scripting connection cache (URIs with the correct DB context)
	private scriptingUriCache: Map<string, string> = new Map();

	/**
	 * Initializes the connection service
	 */
	async initialize(): Promise<void> {
		Logger.info('Initializing ConnectionService...');

		this.mssqlExtension = vscode.extensions.getExtension('ms-mssql.mssql');

		if (!this.mssqlExtension) {
			ErrorHandler.handleMissingMssqlExtension();
			throw new Error('vscode-mssql extension not found');
		}

		if (!this.mssqlExtension.isActive) {
			Logger.info('Activating vscode-mssql extension...');
			await this.mssqlExtension.activate();
		}

		this.mssqlApi = this.mssqlExtension.exports;
		Logger.info('ConnectionService initialized successfully');
	}

	/**
	 * Gets the URI of the current active connection
	 * Caches the connection for reuse
	 */
	async getCurrentConnectionUri(): Promise<string | undefined> {
		try {
			if (!this.mssqlApi?.connectionSharing)
				return undefined;

			// Get the active connection ID from the editor
			const connectionId = await this.mssqlApi.connectionSharing.getActiveEditorConnectionId(
				ConnectionService.EXTENSION_ID
			);

			if (!connectionId) {
				Logger.debug('No active editor connection');
				this.clearConnectionCache();
				return undefined;
			}

			// Get the active database
			const activeDatabase = await this.mssqlApi.connectionSharing.getActiveDatabase(
				ConnectionService.EXTENSION_ID
			);

			// Check if we can reuse the cached connection
			if (this.cachedConnectionUri &&
				this.cachedConnectionId === connectionId &&
				this.cachedDatabase === activeDatabase) {
				Logger.debug(`Reusing cached connection URI: ${this.cachedConnectionUri}`);
				return this.cachedConnectionUri;
			}

			Logger.debug(`Active connection: ${connectionId}, Database: ${activeDatabase || 'default'}`);

			// Create connection via connectionSharing (DB context may be master,
			// but that's fine — queries use USE [database], scripting uses getScriptingUri)
			const uri = await this.mssqlApi.connectionSharing.connect(
				ConnectionService.EXTENSION_ID,
				connectionId
			);

			if (uri) {
				this.cachedConnectionUri = uri;
				this.cachedConnectionId = connectionId;
				this.cachedDatabase = activeDatabase;
				Logger.info(`Connection established and cached: ${uri}`);
			}

			return uri;
		} catch (error) {
			Logger.error('Could not get connection URI', error);
			this.clearConnectionCache();
			return undefined;
		}
	}

	/**
	 * Clears the connection cache
	 */
	clearConnectionCache(): void {
		this.cachedConnectionUri = undefined;
		this.cachedConnectionId = undefined;
		this.cachedDatabase = undefined;
		this.scriptingUriCache.clear();
		Logger.debug('Connection cache cleared');
	}

	/**
	 * Executes an SQL query
	 * @param query SQL query
	 */
	async executeQuery<T = any>(query: string): Promise<T[]> {
		try {
			Logger.debug('Executing query', { query });

			// Get connection URI
			const uri = await this.getCurrentConnectionUri();
			if (!uri) {
				ErrorHandler.handleNoConnection();
				return [];
			}

			// Execute query via connectionSharing service (mssqlApi is guaranteed by getCurrentConnectionUri)
			const result = await this.mssqlApi!.connectionSharing.executeSimpleQuery(uri, query);

			if (!result || !result.rows)
				return [];

			// Transform result into a more convenient format
			const transformedRows = result.rows.map(row => {
				const obj: any = {};
				row.forEach((cell, index) => {
					const columnName = result.columnInfo[index]?.columnName || `Column${index}`;
					obj[columnName] = cell.isNull ? null : cell.displayValue;
				});
				return obj as T;
			});

			return transformedRows;
		} catch (error) {
			ErrorHandler.handle(error, 'Failed to execute query');
			return [];
		}
	}

	/**
	 * Checks if the service is initialized
	 */
	isInitialized(): boolean {
		return this.mssqlApi !== undefined;
	}

	/**
	 * Checks for an active connection
	 */
	async hasActiveConnection(): Promise<boolean> {
		const uri = await this.getCurrentConnectionUri();
		return uri !== undefined;
	}

	/**
	 * Gets the active database name
	 */
	async getActiveDatabase(): Promise<string | undefined> {
		try {
			if (!this.mssqlApi?.connectionSharing)
				return undefined;

			return await this.mssqlApi.connectionSharing.getActiveDatabase(
				ConnectionService.EXTENSION_ID
			);
		} catch (error) {
			Logger.error('Could not get active database', error);
			return undefined;
		}
	}

	/**
	 * Executes a query with explicit database context
	 */
	async executeQueryWithDatabase<T>(query: string, database?: string): Promise<T[]> {
		const effectiveDatabase = database || await this.getActiveDatabase();

		if (!effectiveDatabase) {
			Logger.warn('No database specified, query may execute against master');
			return this.executeQuery<T>(query);
		}

		// Prepend USE [database] before the query
		const fullQuery = `USE [${effectiveDatabase}];\n${query}`;
		Logger.debug(`Executing query against database: ${effectiveDatabase}`);

		return this.executeQuery<T>(fullQuery);
	}

	/**
	 * Scripts a database object via vscode-mssql API
	 */
	async scriptObject(
		operation: number, // ScriptOperation enum value
		schema: string,
		name: string,
		type: string
	): Promise<string | undefined> {
		try {
			const activeDb = await this.getActiveDatabase();
			// Get URI with the correct DB context for scripting
			const uri = activeDb
				? await this.getScriptingUri(activeDb)
				: await this.getCurrentConnectionUri();

			if (!uri) {
				Logger.error('No scripting connection available');
				return undefined;
			}

			if (!this.mssqlApi?.connectionSharing) {
				Logger.error('Connection sharing service not available');
				return undefined;
			}

			// Map the object type to vscode-mssql format
			const mappedType = this.mapObjectTypeForScripting(type);
			const scriptingObject = {
				type: mappedType,
				schema: schema,
				name: name
			};

			Logger.info(`scriptObject: uri=${uri}, op=${operation}, type=${type}->${mappedType}, obj=[${schema}].[${name}]`);

			const script = await this.mssqlApi.connectionSharing.scriptObject(
				uri,
				operation,
				scriptingObject
			);

			if (script)
				Logger.info(`scriptObject SUCCESS: ${schema}.${name} op=${operation}, length=${script.length}`);
			else
				Logger.warn(`scriptObject UNDEFINED: ${schema}.${name} op=${operation}`);

			return script;
		} catch (error) {
			Logger.error(`scriptObject ERROR: ${schema}.${name} op=${operation}`, error);
			return undefined;
		}
	}

	/**
	 * Parses a connection string into an IConnectionInfo object
	 */
	private parseConnectionString(connectionString: string): IConnectionInfo {
		const connectionInfo: IConnectionInfo = {
			server: '',
			database: '',
			user: '',
			password: '',
			authenticationType: 'SqlLogin',
			encrypt: true,
			trustServerCertificate: false,
			connectionString: connectionString
		};

		const pairs = connectionString.split(';');

		for (const pair of pairs) {
			if (!pair.trim())
				continue;

			const [key, value] = pair.split('=', 2);
			const trimmedKey = key.trim();
			const trimmedValue = value?.trim();

			switch (trimmedKey.toLowerCase()) {
				case 'data source':
				case 'server':
					if (trimmedValue.includes(',')) {
						const [serverName, portStr] = trimmedValue.split(',');
						connectionInfo.server = serverName.trim();
						const portNumber = parseInt(portStr.trim(), 10);
						if (!isNaN(portNumber))
							connectionInfo.port = portNumber;
					} else
						connectionInfo.server = trimmedValue;
					break;
				case 'initial catalog':
				case 'database':
					connectionInfo.database = trimmedValue;
					break;
				case 'user id':
				case 'uid':
					connectionInfo.user = trimmedValue;
					break;
				case 'password':
				case 'pwd':
					connectionInfo.password = trimmedValue;
					break;
				case 'connect timeout':
					connectionInfo.connectTimeout = parseInt(trimmedValue, 10);
					break;
				case 'trust server certificate':
					connectionInfo.trustServerCertificate = trimmedValue.toLowerCase() === 'true';
					break;
				case 'authentication':
					switch (trimmedValue.toLowerCase()) {
						case 'sqlpassword':
							connectionInfo.authenticationType = 'SqlLogin';
							break;
						case 'integrated security':
						case 'windows authentication':
						case 'sspi':
							connectionInfo.authenticationType = 'Integrated';
							break;
						default:
							connectionInfo.authenticationType = 'SqlLogin';
					}
					break;
				case 'integrated security':
					if (trimmedValue.toLowerCase() === 'true' || trimmedValue.toLowerCase() === 'sspi')
						connectionInfo.authenticationType = 'Integrated';
					break;
				case 'application name':
					connectionInfo.applicationName = trimmedValue;
					break;
				case 'command timeout':
					connectionInfo.commandTimeout = parseInt(trimmedValue, 10);
					break;
				case 'encrypt':
					connectionInfo.encrypt = trimmedValue.toLowerCase() === 'true';
					break;
			}
		}

		return connectionInfo;
	}

	/**
	 * Creates a connection with the correct DB context for scripting
	 */
	private async getScriptingUri(database: string): Promise<string | undefined> {
		// Check cache
		if (this.scriptingUriCache.has(database))
			return this.scriptingUriCache.get(database);

		// Get connection string from the current connection
		const baseUri = await this.getCurrentConnectionUri();
		if (!baseUri || !this.mssqlApi)
			return undefined;

		const connectionString = await this.mssqlApi.getConnectionString(baseUri, true);
		const connInfo = this.parseConnectionString(connectionString);
		connInfo.database = database;

		// Create connection with the correct DB via legacy API
		const uri = await this.mssqlApi.connect(connInfo, false);
		this.scriptingUriCache.set(database, uri);
		Logger.info(`Scripting connection for "${database}": ${uri}`);
		return uri;
	}

	/**
	 * Maps the internal object type to vscode-mssql scripting format
	 */
	private mapObjectTypeForScripting(type: string): string {
		switch (type) {
			case 'Table': return 'Table';
			case 'View': return 'View';
			case 'StoredProcedure': return 'StoredProcedure';
			// All function types map to UserDefinedFunction - this is the format the API accepts
			case 'ScalarValuedFunction': return 'UserDefinedFunction';
			case 'TableValuedFunction': return 'UserDefinedFunction';
			case 'Function': return 'UserDefinedFunction';
			default: return type;
		}
	}
}
