import { Inject, Injectable, Optional, OnDestroy } from '@angular/core';
import { APP_CONFIG, AppConfig } from '../app-config';
import Dexie from 'dexie';
import { HttpClient } from '@angular/common/http';
import { NetworkService } from './network.service';
import { Subscription, interval } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface ClientLogEvent {
  id?: number;
  level: string;
  message: string;
  timestamp: string;
  metadata?: any;
}

class LoggerDatabase extends Dexie {
  logs!: Dexie.Table<ClientLogEvent, number>;

  constructor() {
    super('SwardLoggerDatabase');
    this.version(1).stores({
      logs: '++id, level, timestamp'
    });
  }
}

const MAX_LOGS = 1000;
const FLUSH_INTERVAL_MS = 60000; // Flush every 1 minute if online

@Injectable({
  providedIn: 'root',
})
export class LoggerService implements OnDestroy {
  private level: LogLevel;
  private db: LoggerDatabase;
  private flushSub?: Subscription;

  constructor(
    @Optional() @Inject(APP_CONFIG) private config: AppConfig | null,
    @Optional() private http: HttpClient | null,
    private networkService: NetworkService,
    private authService: AuthService
  ) {
    this.level = this.parseLogLevel(config?.logLevel || 'INFO');
    this.db = new LoggerDatabase();

    // Setup background flush
    this.flushSub = interval(FLUSH_INTERVAL_MS)
      .pipe(switchMap(() => this.networkService.isOnline$))
      .subscribe((isOnline) => {
        if (isOnline) {
          this.flushLogs();
        }
      });
  }

  ngOnDestroy() {
    if (this.flushSub) {
      this.flushSub.unsubscribe();
    }
  }

  private async enqueueLog(level: string, message: any, ...args: any[]): Promise<void> {
    const logEvent: ClientLogEvent = {
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      timestamp: new Date().toISOString(),
      metadata: args.length ? args : undefined
    };

    try {
      await this.db.logs.add(logEvent);
      const count = await this.db.logs.count();
      if (count > MAX_LOGS) {
        // Delete oldest logs to keep limit
        const limit = count - MAX_LOGS;
        const oldestIds = await this.db.logs.limit(limit).primaryKeys();
        await this.db.logs.bulkDelete(oldestIds);
      }
    } catch (e) {
      // Ignore Dexie errors to prevent crashing app over logs
      console.error('Failed to enqueue log', e);
    }
  }

  private async flushLogs(): Promise<void> {
    if (!this.config || !this.authService.getToken()) return;

    try {
      const logs = await this.db.logs.toArray();
      if (logs.length === 0) return;

      const url = `${this.config.apiPath}/client-logs`;

      if (!this.http) return;
      this.http.post(url, logs).subscribe({
        next: async () => {
          // On success, clear the sent logs
          const ids = logs.map(l => l.id!).filter(id => id != null);
          await this.db.logs.bulkDelete(ids);
        },
        error: (err) => {
          console.error('Failed to flush logs to server', err);
        }
      });
    } catch (e) {
      console.error('Failed to process log flush', e);
    }
  }

  public setLogLevel(level: string): void {
    this.level = this.parseLogLevel(level);
  }

  // No obvious PRD requirement
  private parseLogLevel(level: string): LogLevel {
    switch (level?.toUpperCase()) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  // No obvious PRD requirement
  log(message: any, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(message, ...args);
      this.enqueueLog('DEBUG', message, ...args);
    }
  }

  // No obvious PRD requirement
  info(message: any, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(message, ...args);
      this.enqueueLog('INFO', message, ...args);
    }
  }

  // No obvious PRD requirement
  warn(message: any, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(message, ...args);
      this.enqueueLog('WARN', message, ...args);
    }
  }

  // No obvious PRD requirement
  error(message: any, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(message, ...args);
      this.enqueueLog('ERROR', message, ...args);
    }
  }
}
