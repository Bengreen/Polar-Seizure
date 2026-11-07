import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LoggerService } from '../services/logger.service';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { FarmManagementService } from '../services/farm-management.service';
import { AuthService } from '../services/auth.service';
import { DevAuthApiService } from '../services/dev-auth-api.service';
import { User } from '../models/user';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { APP_CONFIG, AppConfig } from '../app-config';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  isDevAuth = false;
  users$!: Observable<User[]>;
  errorMsg: string | null = null;
  showCreateForm = false;
  editingUserId: number | null = null;
  createUserForm!: FormGroup;
  isSubmitting = false;

  private refreshUsers$ = new BehaviorSubject<void>(undefined);

  constructor(
    private farmManagementService: FarmManagementService,
    private devAuthApi: DevAuthApiService,
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private logger: LoggerService,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {
    this.isDevAuth = !this.config?.auth;
  }

  // No obvious PRD requirement
  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
      return;
    }

    this.createUserForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      role: ['user', Validators.required],
      phone: [''],
      description: [''],
    });

    if (this.isDevAuth) {
    this.users$ = this.refreshUsers$.pipe(
      // No obvious PRD requirement
      switchMap(() =>
        this.farmManagementService.getUsers().pipe(
          catchError((err) => {
            this.logger.error('Error fetching users:', err);
            // No obvious PRD requirement
            setTimeout(() => {
              this.errorMsg =
                'Failed to load users from the backend server. Is the backend running?';
            });
            return of([]);
          }),
        ),
      ),
    );
    } else {
      this.users$ = of([]);
    }
  }

  // No obvious PRD requirement
  loginWithKeycloak(): void {
    this.authService.initCodeFlow();
  }

  loginAs(user: User): void {
    if (user && user.id !== undefined) {
      this.devAuthApi.getToken(user.id, user.role || 'user').subscribe({
        next: (response) => {
          this.authService.login(user.id.toString(), response.access_token);
          this.router.navigate(['/home']);
        },
        error: (err) => {
          this.logger.error('Failed to get Dev JWT token:', err);
          this.errorMsg =
            'Failed to get dev authentication token. Is dev auth enabled in backend?';
        },
      });
    }
  }

  // No obvious PRD requirement
  editUser(event: Event, user: User): void {
    event.stopPropagation();
    this.editingUserId = user.id;
    this.showCreateForm = true;
    this.createUserForm.patchValue({
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      description: user.description,
    });
  }

  // No obvious PRD requirement
  deleteUser(event: Event, userId: number): void {
    event.stopPropagation();
    const confirmed = confirm(
      `Are you sure you want to delete this user? This will delete all of their farms, fields, and records.`,
    );
    if (!confirmed) {
      return;
    }
    this.farmManagementService.deleteUser(userId).subscribe({
      next: () => {
        this.showCreateForm = false;
        this.editingUserId = null;
        this.createUserForm.reset({ role: 'user' });
        this.refreshUsers$.next();
      },
      error: (err) => {
        this.errorMsg = 'Failed to delete user. Please try again.';
        this.logger.error('Error deleting user:', err);
      },
    });
  }

  // No obvious PRD requirement
  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (!this.showCreateForm) {
      this.editingUserId = null;
      this.createUserForm.reset({ role: 'user' });
    }
  }

  // No obvious PRD requirement
  onSubmitUser(): void {
    if (this.createUserForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.errorMsg = null;

    if (this.editingUserId) {
      const updatedUser: User = {
        id: this.editingUserId,
        ...this.createUserForm.value,
      };

      this.farmManagementService.updateUser(updatedUser.id, updatedUser).subscribe({
        next: () => {
          this.isSubmitting = false;
          this.showCreateForm = false;
          this.editingUserId = null;
          this.createUserForm.reset({ role: 'user' });
          this.refreshUsers$.next();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.errorMsg = 'Failed to update user. Please try again.';
          this.logger.error('Error updating user:', err);
        },
      });
    } else {
      const newUser: User = {
        id: 0,
        ...this.createUserForm.value,
      };

      this.farmManagementService.addUser(newUser).subscribe({
        next: () => {
          this.isSubmitting = false;
          this.showCreateForm = false;
          this.editingUserId = null;
          this.createUserForm.reset({ role: 'user' });
          this.refreshUsers$.next();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.errorMsg =
            'Failed to create user. Please ensure the backend is running and details are correct.';
          this.logger.error('Error creating user:', err);
        },
      });
    }
  }
}
