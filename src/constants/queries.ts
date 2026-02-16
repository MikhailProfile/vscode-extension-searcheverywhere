/**
 * SQL query to retrieve all database objects
 */
export const ALL_OBJECTS_QUERY = `
SELECT o.name AS ObjectName
    , 'TABLE' AS ObjectType
    , '' AS DEFINITION
    , ss.name AS SchemaName
FROM sys.objects AS o
JOIN sys.schemas AS ss ON o.schema_id = ss.schema_id
WHERE type = 'U'
UNION ALL

SELECT DISTINCT o.name AS name
    , o.type_desc AS type
    , m.DEFINITION AS DEFINITION
    , ss.name AS schemaName
FROM sys.sql_modules m
JOIN sys.objects o ON m.object_id = o.object_id
JOIN sys.schemas AS ss ON o.schema_id = ss.schema_id`;

/**
 * SQL query to retrieve column information for tables and views
 */
export const COLUMNS_QUERY = `
SELECT
    s.name AS SchemaName,
    o.name AS ObjectName,
    o.type_desc AS ObjectType,
    STUFF((
        SELECT ', ' + c.name
        FROM sys.columns c
        WHERE c.object_id = o.object_id
        ORDER BY c.column_id
        FOR XML PATH(''), TYPE
    ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Columns
FROM sys.objects o
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type IN ('U', 'V')
    AND o.is_ms_shipped = 0
ORDER BY s.name, o.name;
`;

