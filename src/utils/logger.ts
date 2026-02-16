/**
 * Utility for logging extension messages
 */
export class Logger {
	private static readonly prefix = '[SQL Search Everywhere]';

	/**
	 * Logs an informational message
	 */
	static info(message: string, ...args: any[]): void {
		console.log(`${this.prefix} ${message}`, ...args);
	}

	/**
	 * Logs a warning
	 */
	static warn(message: string, ...args: any[]): void {
		console.warn(`${this.prefix} ${message}`, ...args);
	}

	/**
	 * Logs an error
	 */
	static error(message: string, error?: any): void {
		console.error(`${this.prefix} ${message}`, error);
		if (error?.stack)
			console.error(error.stack);
	}

	/**
	 * Logs a debug message
	 */
	static debug(message: string, ...args: any[]): void {
		console.debug(`${this.prefix} ${message}`, ...args);
	}
}
