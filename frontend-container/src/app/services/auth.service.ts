import { Injectable, inject } from '@angular/core';
import { OAuthService } from 'angular-oauth2-oidc';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly oauthService = inject(OAuthService, { optional: true });
  private readonly USER_KEY = 'agent-user-id';
  private readonly JWT_KEY = 'dev-jwt-token';

  constructor() {}

  // PRD Reference: 0014
  login(userId: string, token?: string): void {
    localStorage.setItem(this.USER_KEY, userId);
    if (token) {
      localStorage.setItem(this.JWT_KEY, token);
    } else {
      localStorage.removeItem(this.JWT_KEY);
    }
  }

  // PRD Reference: 0014
  logout(): void {
    if (this.oauthService?.hasValidAccessToken()) {
      this.oauthService.logOut();
    }
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.JWT_KEY);
  }

  // PRD Reference: 0014
  getUserId(): string | null {
    if (this.oauthService) {
      const claims = this.oauthService.getIdentityClaims() as Record<string, any>;
      if (claims && claims['sub']) {
        return claims['sub'];
      }
    }
    return localStorage.getItem(this.USER_KEY);
  }

  // PRD Reference: 0002, 0003
  getIdentityClaims(): Record<string, any> | null {
    if (this.oauthService) {
      const claims = this.oauthService.getIdentityClaims() as Record<string, any>;
      if (claims) {
        return claims;
      }
    }
    return null;
  }

  // PRD Reference: 0014
  getToken(): string | null {
    if (this.oauthService) {
      const token = this.oauthService.getAccessToken();
      if (token) {
        return token;
      }
    }
    return localStorage.getItem(this.JWT_KEY);
  }

  // PRD Reference: 0014
  isLoggedIn(): boolean {
    if (this.oauthService) {
      if (this.oauthService.hasValidAccessToken() || this.oauthService.hasValidIdToken() || !!this.oauthService.getAccessToken()) {
        return true;
      }
    }
    return !!localStorage.getItem(this.USER_KEY);
  }

  initCodeFlow(): void {
    this.oauthService?.initCodeFlow();
  }

  // PRD Reference: 0001, 0002
  getUsername(): string {
    if (this.oauthService?.hasValidAccessToken()) {
      const claims = this.oauthService.getIdentityClaims() as Record<string, any>;
      if (claims) {
        return claims['preferred_username'] || claims['name'] || claims['email'] || claims['sub'] || 'Authenticated User';
      }
    }
    return localStorage.getItem(this.USER_KEY) || 'Guest User';
  }

  // PRD Reference: 0001, 0002
  getUserEmail(): string {
    if (this.oauthService?.hasValidAccessToken()) {
      const claims = this.oauthService.getIdentityClaims() as Record<string, any>;
      if (claims && claims['email']) {
        return claims['email'];
      }
    }
    const userId = this.getUserId();
    return userId ? `${userId}@polecatworks.com` : 'N/A';
  }

  // PRD Reference: 0001, 0002
  getUserRoles(): string[] {
    if (this.oauthService?.hasValidAccessToken()) {
      const claims = this.oauthService.getIdentityClaims() as Record<string, any>;
      if (claims) {
        const realmAccess = claims['realm_access'];
        if (realmAccess && Array.isArray(realmAccess.roles)) {
          return realmAccess.roles;
        }
        if (Array.isArray(claims['roles'])) {
          return claims['roles'];
        }
      }
    }
    return ['user'];
  }

  // PRD Reference: 0001, 0002
  getUserProfile(): { userId: string; username: string; email: string; roles: string[] } {
    return {
      userId: this.getUserId() || 'unknown',
      username: this.getUsername(),
      email: this.getUserEmail(),
      roles: this.getUserRoles(),
    };
  }
}
