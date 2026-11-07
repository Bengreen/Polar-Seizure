import { Component, OnInit, OnDestroy, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { RxdbService } from '../services/rxdb/rxdb.service';
import { SyncEngineService } from '../services/sync-engine.service';

/**
 * Diagnostic & Recovery Error Page Component for route `/error`.
 * Handles:
 * - Diagnostic HTTP status display & error descriptions
 * - Authenticated user identity context summary card
 * - Interactive countdown timer and visual progress bar for sync & retryable errors
 * - Automatic and manual sync retry with seamless resumption to previous route upon HTTP 200 OK
 */
@Component({
  selector: 'app-error-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-page.component.html',
})
export class ErrorPageComponent implements OnInit, OnDestroy {
  errorMessage: string = 'An unexpected error occurred.';
  errorCode: number | null = null;
  isAuthError: boolean = false;
  isSyncError: boolean = false;
  previousUrl: string = '/home';
  isRetrying: boolean = false;

  countdownMax: number = 15;
  countdown: number = 15;
  private timerSub?: Subscription;

  userProfile: { userId: string; username: string; email: string; roles: string[] } = {
    userId: 'unknown',
    username: 'Guest User',
    email: 'N/A',
    roles: ['user'],
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    private rxdbService: RxdbService,
    @Optional() private syncEngineService?: SyncEngineService,
  ) {
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras.state as {
      error?: string;
      errorCode?: number;
      isSyncError?: boolean;
      previousUrl?: string;
    };

    const historyState = (history.state || {}) as {
      error?: string;
      errorCode?: number;
      isSyncError?: boolean;
      previousUrl?: string;
    };

    const activeState = state || historyState;

    if (activeState.error) {
      this.errorMessage = activeState.error;
    }
    if (activeState.errorCode) {
      this.errorCode = activeState.errorCode;
    }
    if (activeState.isSyncError !== undefined) {
      this.isSyncError = activeState.isSyncError;
    } else if (this.errorCode === 403 || this.errorMessage.toLowerCase().includes('sync')) {
      this.isSyncError = true;
    }
    if (activeState.previousUrl) {
      this.previousUrl = activeState.previousUrl;
    }

    if (
      this.errorCode === 401 ||
      this.errorMessage.includes('Authentication failed') ||
      this.errorMessage.includes('credentials')
    ) {
      this.isAuthError = true;
    }
  }

  ngOnInit(): void {
    if (this.authService) {
      this.userProfile = this.authService.getUserProfile();
    }

    if (this.isSyncError) {
      this.startCountdown();
    }
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  get progressPercentage(): number {
    if (this.countdownMax <= 0) return 0;
    const elapsed = this.countdownMax - this.countdown;
    return Math.min(100, Math.max(0, (elapsed / this.countdownMax) * 100));
  }

  startCountdown(): void {
    this.stopCountdown();
    this.countdown = this.countdownMax;
    this.timerSub = interval(1000).subscribe(() => {
      if (this.countdown > 1) {
        this.countdown--;
      } else {
        this.countdown = 0;
        this.stopCountdown();
        this.retrySync();
      }
    });
  }

  stopCountdown(): void {
    if (this.timerSub) {
      this.timerSub.unsubscribe();
      this.timerSub = undefined;
    }
  }

  async retrySync(): Promise<void> {
    this.stopCountdown();
    this.isRetrying = true;

    try {
      if (this.syncEngineService) {
        await this.syncEngineService.fullSync();
      }
      this.isRetrying = false;
      // Resume to previous view upon HTTP 200 OK
      this.router.navigateByUrl(this.previousUrl);
    } catch (err: any) {
      this.isRetrying = false;
      if (err?.error?.error || err?.message) {
        this.errorMessage = err.error?.error || err.message;
      }
      // Restart countdown on failure
      this.startCountdown();
    }
  }

  async goHome(): Promise<void> {
    this.stopCountdown();
    if (this.isAuthError) {
      await this.rxdbService.wipeDatabase();
      this.authService.logout();
      this.router.navigate(['/login']);
    } else {
      this.router.navigate(['/home']);
    }
  }
}
