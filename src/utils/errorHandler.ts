import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * Utility for error handling
 */
export class ErrorHandler {
	/**
	 * Handles an error and shows a message to the user
	 */
	static handle(error: any, context?: string): void {
		const message = this.extractMessage(error);
		const fullMessage = context ? `${context}: ${message}` : message;

		Logger.error(fullMessage, error);
		vscode.window.showErrorMessage(fullMessage);
	}

	/**
	 * Extracts the error message from an object
	 */
	private static extractMessage(error: any): string {
		if (typeof error === 'string')
			return error;

		if (error instanceof Error)
			return error.message;

		if (error?.message)
			return error.message;

		return 'Unknown error';
	}

	/**
	 * Handles missing connection error
	 */
	static handleNoConnection(): void {
		const message = 'No active database connection. Please connect to a SQL Server database first.';
		Logger.warn(message);
		vscode.window.showWarningMessage(message);
	}

	/**
	 * Handles missing vscode-mssql extension error
	 */
	static handleMissingMssqlExtension(): void {
		const message = 'vscode-mssql extension is required but not installed. Please install it first.';
		Logger.error(message);
		vscode.window.showErrorMessage(message, 'Install').then(selection => {
			if (selection === 'Install')
				vscode.commands.executeCommand('workbench.extensions.installExtension', 'ms-mssql.mssql');
		});
	}
}
