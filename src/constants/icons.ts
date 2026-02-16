/**
 * Icons for database object types
 */
export const OBJECT_ICONS: Record<string, string> = {
	Table: 'table',
	View: 'eye',
	StoredProcedure: 'symbol-method',
	ScalarValuedFunction: 'symbol-function',
	TableValuedFunction: 'symbol-function',
	Synonym: 'link'
};

/**
 * Gets the icon for an object type
 * @param type Object type
 * @returns ThemeIcon name
 */
export function getObjectIcon(type: string): string {
	return OBJECT_ICONS[type] || 'symbol-misc';
}
