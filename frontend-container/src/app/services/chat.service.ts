import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  Observable,
  BehaviorSubject,
  Subject,
  map,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';

export interface Thread {
  thread_id: string;
  user_id: string;
  title: string;
  created_at?: string;
  color?: string;
  status_msg?: string;
  status_updated_at?: string;
  current_server_time?: string;
  learning_mode_enabled?: boolean;
}

export interface UserSettings {
  learning_mode_enabled: boolean;
}

export interface AgentDefinition {
  id?: string;
  name: string;
  content: string;
}

export interface ChatResponse {
  thread_id: string;
  response?: string;
  status?: string;
}

export interface Message {
  type: string;
  content: string;
  duration?: string;
  created_at?: string;
  name?: string;
  tool_call_id?: string;
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    max_tokens?: number;
  };
  additional_kwargs?: {
    image_url?: string;
    follow_up_questions?: string[];
    tool_calls?: { id?: string; name: string; args: any; response?: string }[];
    [key: string]: any;
  };
  showTools?: boolean;
}

export interface HistoryResponse {
  thread?: Thread;
  messages: Message[];
  visualizations?: Visualization[];
}

export interface Visualization {
  id: string;
  thread_id: string;
  provider: string;
  component: string;
  content: any;
  name?: string;
  title?: string;
  description?: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export interface VisualizationsResponse {
  visualizations: Visualization[];
}

import { APP_CONFIG, AppConfig } from '../app-config';
import { Inject } from '@angular/core';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private apiUrl$: Observable<string>;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private logger: LoggerService,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {
    this.apiUrl$ = of(this.config.apiPath).pipe(shareReplay(1));
  }

  // No obvious PRD requirement
  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
    });
  }

  private threadsSubject = new BehaviorSubject<Thread[]>([]);
  threads$ = this.threadsSubject.asObservable();

  private externalMessageSubject = new Subject<string>();
  externalMessage$ = this.externalMessageSubject.asObservable();

  // No obvious PRD requirement
  triggerExternalMessage(threadId: string) {
    this.externalMessageSubject.next(threadId);
  }

  private currentVisualizationsSubject = new BehaviorSubject<Visualization[]>(
    [],
  );
  currentVisualizations$ = this.currentVisualizationsSubject.asObservable();

  // No obvious PRD requirement
  updateVisualizations(visualizations: Visualization[]) {
    this.currentVisualizationsSubject.next(visualizations);
  }

  // No obvious PRD requirement
  refreshThreads() {
    this.getThreads().subscribe({
      next: (res) => {
        this.threadsSubject.next(res.threads);
      },
      error: (err) => this.logger.error('Error refreshing threads', err),
    });
  }

  // No obvious PRD requirement
  sendMessage(
    message: string,
    threadId?: string,
    bypassLearningMode: boolean = false,
  ): Observable<ChatResponse> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.post<ChatResponse>(
          `${apiUrl}/chat`,
          {
            message,
            thread_id: threadId,
            bypass_learning_mode: bypassLearningMode,
          },
          { headers: this.getHeaders() },
        ),
      ),
    );
  }

  // No obvious PRD requirement
  getThreads(): Observable<{ threads: Thread[] }> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.get<{ threads: Thread[] }>(`${apiUrl}/threads`, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }

  // No obvious PRD requirement
  getHistory(threadId: string): Observable<HistoryResponse> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.get<HistoryResponse>(
          `${apiUrl}/threads/${threadId}/history`,
          { headers: this.getHeaders() },
        ),
      ),
      // No obvious PRD requirement
      tap((res) => {
        if (res.visualizations) {
          this.updateVisualizations(res.visualizations);
        }
        if (res.thread) {
          const currentThreads = this.threadsSubject.getValue();
          const threadIndex = currentThreads.findIndex(
            (t) => t.thread_id === res.thread?.thread_id,
          );
          if (threadIndex !== -1) {
            const updatedThreads = [...currentThreads];
            updatedThreads[threadIndex] = {
              ...updatedThreads[threadIndex],
              ...res.thread,
            };
            this.threadsSubject.next(updatedThreads);
          }
        }
      }),
    );
  }

  // No obvious PRD requirement
  deleteThread(threadId: string): Observable<any> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.delete(`${apiUrl}/threads/${threadId}`, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }

  // No obvious PRD requirement
  updateThread(
    threadId: string,
    thread: { title?: string; color?: string; learning_mode_enabled?: boolean },
  ): Observable<any> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.put(`${apiUrl}/threads/${threadId}`, thread, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }

  // No obvious PRD requirement
  getVisualizations(threadId: string): Observable<VisualizationsResponse> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.get<VisualizationsResponse>(
          `${apiUrl}/threads/${threadId}/visualizations`,
          { headers: this.getHeaders() },
        ),
      ),
    );
  }

  // No obvious PRD requirement
  getUserSettings(): Observable<UserSettings> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.get<UserSettings>(`${apiUrl}/user/settings`, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }

  // No obvious PRD requirement
  updateUserSettings(settings: UserSettings): Observable<any> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.put(`${apiUrl}/user/settings`, settings, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }

  // No obvious PRD requirement
  getAgents(): Observable<AgentDefinition[]> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.get<AgentDefinition[]>(`${apiUrl}/agents`, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }

  // No obvious PRD requirement
  createAgent(agent: AgentDefinition): Observable<AgentDefinition> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.post<AgentDefinition>(`${apiUrl}/agents`, agent, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }

  // No obvious PRD requirement
  updateAgent(id: string, agent: AgentDefinition): Observable<AgentDefinition> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.put<AgentDefinition>(`${apiUrl}/agents/${id}`, agent, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }

  // No obvious PRD requirement
  deleteAgent(id: string): Observable<any> {
    return this.apiUrl$.pipe(
      // No obvious PRD requirement
      switchMap((apiUrl) =>
        this.http.delete(`${apiUrl}/agents/${id}`, {
          headers: this.getHeaders(),
        }),
      ),
    );
  }
}
