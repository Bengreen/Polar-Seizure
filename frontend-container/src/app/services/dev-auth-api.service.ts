import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppConfig, APP_CONFIG } from '../app-config';

export interface DevAuthTokenResponse {
  access_token: string;
}

@Injectable({
  providedIn: 'root',
})
export class DevAuthApiService {
  constructor(
    private http: HttpClient,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {}

  // PRD Reference: 0014
  getToken(userId: number, role: string): Observable<DevAuthTokenResponse> {
    const url = `${this.config.apiPath.replace('/v0', '')}/dev/auth/token`;
    return this.http.post<DevAuthTokenResponse>(url, { user_id: userId, role });
  }
}
