import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { getLogDir } from '../config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private level: LogLevel;
  private logFile: string;
  private logs: Array<{ timestamp: string; level: string; message: string }> = [];
  private maxLogs = 1000;

  constructor(level: string = 'info') {
    this.level = (level as LogLevel) || 'info';
    const logDir = getLogDir();
    const date = new Date().toISOString().split('T')[0];
    this.logFile = resolve(logDir, `agent-${date}.log`);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  private log(level: LogLevel, message: string): void {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message);
    console.log(formatted);

    // Store in memory
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
    });

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Write to file
    try {
      const logDir = getLogDir();
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      appendFileSync(this.logFile, formatted + '\n');
    } catch {
      // Ignore file write errors
    }
  }

  debug(message: string): void {
    this.log('debug', message);
  }

  info(message: string): void {
    this.log('info', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  getLogs(limit = 100): Array<{ timestamp: string; level: string; message: string }> {
    return this.logs.slice(-limit);
  }

  getLogsByLevel(level: LogLevel, limit = 100): Array<{ timestamp: string; level: string; message: string }> {
    return this.logs.filter((l) => l.level === level).slice(-limit);
  }
}

export default Logger;
