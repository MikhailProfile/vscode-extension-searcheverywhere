import { DatabaseObjectItem, DatabaseObjectType } from '../models/databaseObject';
import { ConfigurationService } from '../models/configuration';
import { ConnectionService } from './connectionService';
import { ColumnService } from './columnService';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errorHandler';
import { ALL_OBJECTS_QUERY } from '../constants/queries';

/**
 * Database object query result
 */
interface DatabaseObjectQueryResult {
	SchemaName: string;
	ObjectName: string;
	ObjectType: string;
}

/**
 * Service for searching database objects
 */
export class SearchService {
	private objectsCache: Map<string, DatabaseObjectItem[]> = new Map();

	constructor(
		private connectionService: ConnectionService,
		private columnService: ColumnService,
		private configService: ConfigurationService
	) {}

	/**
	 * Searches for database objects
	 */
	async search(searchTerm: string = '', clearCache: boolean = false): Promise<DatabaseObjectItem[]> {
		try {
			Logger.debug(`Starting search with term: "${searchTerm}", clearCache: ${clearCache}`);

			// Get connection URI
			const uri = await this.connectionService.getCurrentConnectionUri();
			if (!uri) {
				ErrorHandler.handleNoConnection();
				return [];
			}

			// Get the active database name for the cache key
			const database = await this.connectionService.getActiveDatabase();
			const cacheKey = database ? `${database}` : 'default';

			Logger.info(`Cache: key=${cacheKey}, entries=${this.objectsCache.size}, keys=[${Array.from(this.objectsCache.keys()).join(', ')}]`);

			// Clear cache if required
			if (clearCache) {
				Logger.debug('Clearing caches...');
				this.objectsCache.clear();
				this.columnService.clearCache(uri);
			}

			// Get objects from cache or database
			let objects = await this.getOrFetchObjects(cacheKey, database);

			// Filter by search term
			if (searchTerm.trim()) {
				const lowerTerm = searchTerm.toLowerCase();
				objects = objects.filter(obj =>
					obj.name.toLowerCase().includes(lowerTerm) ||
					obj.schema.toLowerCase().includes(lowerTerm)
				);
			}

			// Optionally enrich with column information
			if (this.configService.includeTableColumns()) {
				Logger.debug('Enriching with column information...');
				objects = await this.columnService.enrichWithColumns(uri, objects);
			}

			Logger.info(`Search completed: ${objects.length} objects found`);
			return objects;
		} catch (error) {
			ErrorHandler.handle(error, 'Search failed');
			return [];
		}
	}

	/**
	 * Gets objects from cache or fetches from the database
	 */
	private async getOrFetchObjects(cacheKey: string, database?: string): Promise<DatabaseObjectItem[]> {
		// Check cache
		const cached = this.objectsCache.get(cacheKey);
		if (cached) {
			Logger.debug(`Using cached objects: ${cached.length} items`);
			return cached;
		}

		// Fetch from the database
		Logger.debug('Fetching objects from database...');
		const results = await this.connectionService.executeQueryWithDatabase<DatabaseObjectQueryResult>(
			ALL_OBJECTS_QUERY,
			database
		);

		if (!results || results.length === 0) {
			Logger.warn('No objects returned from query');
			return [];
		}

		// Transform results
		const objects = results.map(row => this.transformResult(row, database));

		// Save to cache with database-containing key
		this.objectsCache.set(cacheKey, objects);
		Logger.debug(`Fetched and cached ${objects.length} objects for key: ${cacheKey}`);

		return objects;
	}

	/**
	 * Transforms an SQL query result into a DatabaseObjectItem
	 */
	private transformResult(row: DatabaseObjectQueryResult, database?: string): DatabaseObjectItem {
		return {
			name: row.ObjectName || '',
			schema: row.SchemaName || 'dbo',
			type: this.mapObjectType(row.ObjectType),
			database: database,
			columns: undefined,
			definition: undefined
		};
	}

	/**
	 * Maps SQL Server object type to internal format
	 */
	private mapObjectType(type: string): DatabaseObjectType {
		// SQL Server type_desc values:
		// USER_TABLE, VIEW, SQL_STORED_PROCEDURE,
		// SQL_SCALAR_FUNCTION, SQL_INLINE_TABLE_VALUED_FUNCTION, SQL_TABLE_VALUED_FUNCTION
		switch (type) {
			case 'TABLE':
			case 'USER_TABLE':
				return 'Table';
			case 'VIEW':
				return 'View';
			case 'SQL_STORED_PROCEDURE':
				return 'StoredProcedure';
			case 'SQL_SCALAR_FUNCTION':
				return 'ScalarValuedFunction';
			case 'SQL_INLINE_TABLE_VALUED_FUNCTION':
			case 'SQL_TABLE_VALUED_FUNCTION':
				return 'TableValuedFunction';
			default:
				Logger.warn(`Unknown object type: ${type}, defaulting to Table`);
				return 'Table';
		}
	}
}
