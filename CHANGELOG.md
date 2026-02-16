# Changelog

## [1.0.0] - 2026-02-16

### Initial Release

- Support for searching tables, views, stored procedures, and functions
- Configurable actions per object type (Select, Create, Alter, Delete, Execute, Insert Name)
- Optional column information display in search results
- Per-database object caching for fast repeated searches
- Keyboard shortcuts: `Ctrl+Shift+;` (search), `Ctrl+Shift+Alt+;` (search with cache clear)
- Integration with [SQL Server (mssql)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql) extension via Connection Sharing API
