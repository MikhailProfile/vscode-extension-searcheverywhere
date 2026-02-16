import { DatabaseObjectItem } from '../models/databaseObject';
import { ConfigurationService } from '../models/configuration';
import { ConnectionService } from './connectionService';
import { Logger } from '../utils/logger';
import { COLUMNS_QUERY } from '../constants/queries';

/**
 * Column query result
 */
interface ColumnQueryResult {
	SchemaName: string;
	ObjectName: string;
	ObjectType: string;
	Columns: string;
}

/**
 * Service for retrieving column information for tables and views
 */
export class ColumnService {
	private columnCache = new Map<string, Map<string, string>>();

	constructor(
		private connectionService: ConnectionService,
		private configService: ConfigurationService
	) {}

	/**
	 * Enriches objects with column information
	 */
	async enrichWithColumns(uri: string, objects: DatabaseObjectItem[]): Promise<DatabaseObjectItem[]> {
		// Filter only tables and views
		const tablesAndViews = objects.filter(
			o => o.type === 'Table' || o.type === 'View'
		);

		if (tablesAndViews.length === 0)
			return objects;

		// Check cache
		const cacheKey = this.getCacheKey(uri);
		let columnMap = this.columnCache.get(cacheKey);

		if (!columnMap) {
			// Fetch column information from the database
			columnMap = await this.fetchColumns();
			if (columnMap)
				this.columnCache.set(cacheKey, columnMap);
		}

		if (!columnMap)
			return objects;

		// Enrich objects with column information
		return objects.map(obj => {
			if (obj.type === 'Table' || obj.type === 'View') {
				const key = `${obj.schema}.${obj.name}`;
				const columns = columnMap!.get(key);
				if (columns)
					return { ...obj, columns };
			}
			return obj;
		});
	}

	/**
	 * Fetches column information from the database
	 */
	private async fetchColumns(): Promise<Map<string, string> | undefined> {
		try {
			Logger.debug('Fetching column information...');

			const results = await this.connectionService.executeQueryWithDatabase<ColumnQueryResult>(
				COLUMNS_QUERY
			);

			if (!results || results.length === 0) {
				Logger.warn('No column information returned from query');
				return undefined;
			}

			// Create map: "schema.object" -> "columns"
			const columnMap = new Map<string, string>();
			for (const row of results) {
				const key = `${row.SchemaName}.${row.ObjectName}`;
				columnMap.set(key, row.Columns || '');
			}

			Logger.debug(`Fetched column information for ${columnMap.size} objects`);
			return columnMap;
		} catch (error) {
			Logger.error('Failed to fetch column information', error);
			return undefined;
		}
	}

	/**
	 * Clears the column cache
	 */
	clearCache(uri?: string): void {
		if (uri) {
			const cacheKey = this.getCacheKey(uri);
			this.columnCache.delete(cacheKey);
			Logger.debug(`Cleared column cache for ${cacheKey}`);
		} else {
			this.columnCache.clear();
			Logger.debug('Cleared all column cache');
		}
	}

	/**
	 * Generates a cache key
	 */
	private getCacheKey(uri: string): string {
		return uri;
	}
}
