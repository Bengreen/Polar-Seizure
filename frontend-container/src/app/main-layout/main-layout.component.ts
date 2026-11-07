import { LoggerService } from '../services/logger.service';
import { Component, Inject, OnInit } from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { CommonModule } from '@angular/common';
import { SyncStatusComponent } from '../sync-status/sync-status.component';
import { AvatarComponent } from '../utils/avatar.component';
import { RxdbService } from '../services/rxdb/rxdb.service';
import { AuthService } from '../services/auth.service';
import { FarmManagementService } from '../services/farm-management.service';
import { DevAuthApiService } from '../services/dev-auth-api.service';
import { User } from '../models/user';
import { Observable, shareReplay, catchError, EMPTY, map, startWith, of } from 'rxjs';
import { SyncStateService, SyncState } from '../services/sync-state.service';
import { APP_CONFIG, AppConfig } from '../app-config';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CommonModule,
    SyncStatusComponent,
    AvatarComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
})
export class MainLayoutComponent implements OnInit {
  readonly fallbackToRest$: Observable<boolean>;
  readonly syncState$: Observable<SyncState>;
  readonly lastSyncTime$: Observable<Date | null>;
  currentUser$!: Observable<User>;
  users$: Observable<User[]> | undefined;
  isDevAuth = false;
  showUserSelection$: Observable<boolean> | undefined;

  constructor(
    private rxdbService: RxdbService,
    private authService: AuthService,
    private farmManagementService: FarmManagementService,
    private devAuthApi: DevAuthApiService,
    private router: Router,
    private logger: LoggerService,
    private syncStateService: SyncStateService,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {
    this.fallbackToRest$ = this.rxdbService.fallbackToRest$;
    this.syncState$ = this.syncStateService.syncState$;
    this.lastSyncTime$ = this.syncStateService.lastSyncTime$;
    this.isDevAuth = !this.config?.auth;
  }

  // PRD Reference: 0002, 0003, 0014
  ngOnInit(): void {
    const userId = this.authService.getUserId();
    if (userId) {
      this.currentUser$ = this.farmManagementService
        .getUser(userId)
        .pipe(
          catchError((err) => {
            if (err?.status === 404) {
              if (!this.router.url.includes('/profile')) {
                this.router.navigate(['/profile']);
              }
            }
            return EMPTY;
          }),
          shareReplay(1)
        );
    }

    this.showUserSelection$ = (this.currentUser$ || of(null)).pipe(
      map((user) => {
        if (this.isDevAuth) {
          return true;
        }
        const role = user?.role?.toLowerCase();
        if (role === 'admin' || role === 'support') {
          return true;
        }
        const roles = this.authService.getUserRoles ? this.authService.getUserRoles() : [];
        return roles.some(
          (r) => r.toLowerCase() === 'admin' || r.toLowerCase() === 'support'
        );
      }),
      startWith(this.isDevAuth),
      shareReplay(1)
    );

    this.showUserSelection$.subscribe((visible) => {
      if (visible && !this.users$) {
        this.users$ = this.farmManagementService.getUsers().pipe(shareReplay(1));
      }
    });
  }

  // No obvious PRD requirement
  async logout(): Promise<void> {
    await this.rxdbService.wipeDatabase();
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  // No obvious PRD requirement
  switchUser(userId: string | number): void {
    const userIdStr = userId.toString();
    this.users$?.subscribe({
      next: (users) => {
        const selectedUser = users.find((u) => u.id?.toString() === userIdStr);
        if (selectedUser && selectedUser.id !== undefined) {
          this.devAuthApi
            .getToken(selectedUser.id, selectedUser.role || 'user')
            .subscribe({
              next: (response) => {
                this.authService.login(
                  selectedUser.id!.toString(),
                  response.access_token,
                );
                this.reloadPage();
              },
              error: (err) => {
                this.logger.error(
                  'Failed to get Dev JWT token on user switch:',
                  err,
                );
                this.authService.login(selectedUser.id!.toString());
                this.reloadPage();
              },
            });
        } else {
          this.authService.login(userIdStr);
          this.reloadPage();
        }
      },
      error: (err) => {
        this.logger.error('Failed to fetch user list during switch:', err);
        this.authService.login(userIdStr);
        this.reloadPage();
      },
    });
  }

  // No obvious PRD requirement
  reloadPage(): void {
    window.location.reload();
  }
}
