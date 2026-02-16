# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A VS Code extension that enables fast, keyboard-driven search for SQL Server database objects (tables, views, stored procedures, functions). The extension integrates with the `ms-mssql.mssql` extension to provide search capabilities across connected SQL Server databases.

## Build Commands

```bash
# Install dependencies
npm install

# Compile TypeScript to JavaScript
npm run compile

# Watch mode for development
npm run watch

# Lint source code
npm run lint

# Prepare for publishing
npm run vscode:prepublish
```

## Testing

Press F5 in VS Code to launch the Extension Development Host, then connect to a SQL Server database and test the search commands.

## Architecture

### Service Layer Architecture

The extension follows a service-oriented architecture with dependency injection:

1. **ConnectionService** - Manages database connections via vscode-mssql's Connection Sharing API
   - Initializes connection to `ms-mssql.mssql` extension
   - Provides `executeQuery()` and `executeQueryWithDatabase()` methods
   - Handles database context switching with `USE [database]` statements

2. **SearchService** - Handles object search and caching
   - Maintains per-database cache (key: `uri:database`)
   - Queries sys.objects and sys.schemas for database objects
   - Filters results based on search terms

3. **ColumnService** - Enriches objects with column information (optional)
   - Queries INFORMATION_SCHEMA.COLUMNS when `includeTableColumns` is enabled
   - Maintains separate column cache per URI

4. **ScriptingService** - Generates SQL scripts for objects
   - SELECT TOP N for tables/views
   - ALTER scripts for procedures/functions (fetches from sys.sql_modules)
   - EXEC scripts for stored procedures

5. **QuickPickProvider** - Manages UI QuickPick interface
   - Creates QuickPickItems with icons and metadata
   - Handles user selection and delegates to ScriptingService

### Key Interfaces

The extension uses `ms-mssql.mssql`'s exported API:

```typescript
interface IConnectionSharingService {
  getActiveEditorConnectionId(extensionId: string): Promise<string | undefined>;
  getActiveDatabase(extensionId: string): Promise<string | undefined>;
  connect(extensionId: string, connectionId: string, database?: string): Promise<string | undefined>;
  executeSimpleQuery(connectionUri: string, queryString: string): Promise<SimpleExecuteResult>;
}
```

### Data Flow

1. User triggers command → `extension.ts` command handler
2. `SearchService.search()` → checks cache or queries database via `ConnectionService`
3. Optional: `ColumnService.enrichWithColumns()` → adds column information
4. `QuickPickProvider.show()` → displays results to user
5. User selects object → `ScriptingService.generateScript()` → inserts into editor

### Caching Strategy

- Objects are cached per database context: `Map<"uri:database", DatabaseObjectItem[]>`
- Column information is cached separately per URI in `ColumnService`
- Cache is cleared when user invokes "Clear Cache" command
- Cache key includes database name to prevent cross-database contamination

## Configuration

Extension settings (from package.json):
- `sqlSearchEverywhere.includeTableColumns` - Include column names in results (default: false)
- `sqlSearchEverywhere.actions.{table|view|storedProcedure|function}` - Default action per object type
- `sqlSearchEverywhere.scriptRowLimit` - Row limit for SELECT scripts (default: 1000)

## Code Style

- English language for code comments (per user's CLAUDE.md)
- XML documentation on public members in English
- No curly braces for single-statement conditionals (per user's syntax rule)
- TypeScript strict mode enabled
- ESLint with @typescript-eslint rules

## Important Notes

- Extension has hard dependency on `ms-mssql.mssql` - must be installed and activated
- Keyboard shortcuts: `Ctrl+Shift+;` (search), `Ctrl+Shift+Alt+;` (search with cache clear)
- Extension only activates in SQL file context or when commands are invoked
- All database queries execute against the active database context from the active editor
