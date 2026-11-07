import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
  APP_INITIALIZER,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

import { APP_CONFIG, AppConfig } from './app-config';
import { devAuthInterceptor } from './services/dev-auth.interceptor';
import { provideOAuthClient, OAuthService, AuthConfig, OAuthStorage } from 'angular-oauth2-oidc';
import { LoggerService } from './services/logger.service';

export function initializeOAuth(oauthService: OAuthService, config: AppConfig, logger: LoggerService) {
  return () => {
    if (config.auth) {
      const authConfig: AuthConfig = {
        issuer: config.auth.issuer,
        redirectUri: window.location.origin + '/',
        clientId: config.auth.clientId,
        responseType: 'code',
        scope: config.auth.scope,
        showDebugInformation: isDevMode(),
        requireHttps: config.auth.requireHttps ?? true,
        useSilentRefresh: config.auth.requireHttps ?? false,
        strictDiscoveryDocumentValidation: false,
        skipIssuerCheck: config.auth.skipIssuerCheck ?? true,
      };
      oauthService.configure(authConfig);
      if (config.auth.requireHttps ?? true) {
        oauthService.setupAutomaticSilentRefresh();
      }
      return oauthService
        .loadDiscoveryDocumentAndTryLogin()
        .then((result) => {
          logger.log('OAuth discovery & login result:', result, 'Has token:', oauthService.hasValidAccessToken(), 'Claims:', oauthService.getIdentityClaims());
          return true;
        })
        .catch((err) => {
          logger.error('OAuth discovery & login error:', err);
          return true;
        });
    }
    return Promise.resolve(true);
  };
}

export const createAppConfig = (config: AppConfig): ApplicationConfig => ({
  providers: [
    // No obvious PRD requirement
    provideZoneChangeDetection({ eventCoalescing: true }),
    // No obvious PRD requirement
    provideRouter(routes),
    // No obvious PRD requirement
    provideHttpClient(withInterceptors([devAuthInterceptor])),
    // No obvious PRD requirement
    provideAnimations(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    { provide: APP_CONFIG, useValue: config },
    { provide: OAuthStorage, useValue: localStorage },
    provideOAuthClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeOAuth,
      deps: [OAuthService, APP_CONFIG, LoggerService],
      multi: true,
    },
  ],
});
