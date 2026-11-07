import { LoggerService } from '../services/logger.service';
import { APP_CONFIG } from '../app-config';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { FarmManagementService } from '../services/farm-management.service';
import { AuthService } from '../services/auth.service';
import { of, throwError, timer } from 'rxjs';
import { delay, switchMap } from 'rxjs/operators';
import { ReactiveFormsModule } from '@angular/forms';
import { DevAuthApiService } from '../services/dev-auth-api.service';

// No obvious PRD requirement
describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockFarmService: jasmine.SpyObj<FarmManagementService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockDevAuthApi: jasmine.SpyObj<DevAuthApiService>;

  // No obvious PRD requirement
  beforeEach(async () => {
    mockFarmService = jasmine.createSpyObj('FarmManagementService', [
      'getUsers',
      'addUser',
      'deleteUser',
    ]);
    mockAuthService = jasmine.createSpyObj('AuthService', ['login', 'logout', 'isLoggedIn', 'initCodeFlow']);
    mockAuthService.isLoggedIn.and.returnValue(false);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockDevAuthApi = jasmine.createSpyObj('DevAuthApiService', ['getToken']);
    mockDevAuthApi.getToken.and.returnValue(of({ access_token: 'fake-token' }));

    mockFarmService.getUsers.and.returnValue(
      of([
        { id: 1, name: 'Alice', email: 'alice@example.com', role: 'user' },
        { id: 2, name: 'Bob', email: 'bob@example.com', role: 'admin' },
      ]),
    );

    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [
        { provide: FarmManagementService, useValue: mockFarmService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        { provide: DevAuthApiService, useValue: mockDevAuthApi },
        { provide: APP_CONFIG, useValue: { apiPath: "/api", logLevel: "DEBUG", auth: false } },
        LoggerService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // No obvious PRD requirement
  it('should create', () => {
    // No obvious PRD requirement
    expect(component).toBeTruthy();
  });

  // No obvious PRD requirement
  it('should fetch and display users on init', () => {
    // No obvious PRD requirement
    expect(mockFarmService.getUsers).toHaveBeenCalled();
    component.users$.subscribe((users) => {
      // No obvious PRD requirement
      expect(users.length).toBe(2);
      // No obvious PRD requirement
      expect(users[0].name).toBe('Alice');
      // No obvious PRD requirement
      expect(users[1].name).toBe('Bob');
    });
  });

  // No obvious PRD requirement
  it('should display error message if fetch fails', fakeAsync(() => {
    mockFarmService.getUsers.and.returnValue(
      throwError(() => new Error('Server offline')),
    );

    component.ngOnInit();
    fixture.detectChanges();

    let usersLength = -1;
    component.users$.subscribe((users) => {
      usersLength = users.length;
    });

    // No obvious PRD requirement
    tick();
    fixture.detectChanges();

    // No obvious PRD requirement
    expect(component.errorMsg).toContain('Failed to load users');
    // No obvious PRD requirement
    expect(usersLength).toBe(0);
  }));

  // No obvious PRD requirement
  it('should login and navigate when loginAs is called', () => {
    component.loginAs({
      id: 1,
      name: 'Test',
      email: 'test@example.com',
      role: 'user',
    });
    // No obvious PRD requirement
    expect(mockDevAuthApi.getToken).toHaveBeenCalledWith(1, 'user');
    // No obvious PRD requirement
    expect(mockAuthService.login).toHaveBeenCalledWith('1', 'fake-token');
    // No obvious PRD requirement
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/home']);
  });

  // No obvious PRD requirement
  it('should toggle create user form visibility and reset form controls', () => {
    // No obvious PRD requirement
    expect(component.showCreateForm).toBeFalse();
    component.toggleCreateForm();
    // No obvious PRD requirement
    expect(component.showCreateForm).toBeTrue();

    component.createUserForm.patchValue({
      name: 'Declan',
      email: 'declan@test.com',
    });
    component.toggleCreateForm();
    // No obvious PRD requirement
    expect(component.showCreateForm).toBeFalse();
    // No obvious PRD requirement
    expect(component.createUserForm.get('name')?.value).toBeNull();
  });

  // No obvious PRD requirement
  it('should validate required fields in create user form', () => {
    component.toggleCreateForm();
    const form = component.createUserForm;
    // No obvious PRD requirement
    expect(form.valid).toBeFalse();

    const nameControl = form.get('name');
    const emailControl = form.get('email');

    nameControl?.setValue('');
    emailControl?.setValue('invalid-email');
    // No obvious PRD requirement
    expect(form.valid).toBeFalse();
    // No obvious PRD requirement
    expect(emailControl?.hasError('email')).toBeTrue();

    nameControl?.setValue('Declan');
    emailControl?.setValue('declan@example.com');
    // No obvious PRD requirement
    expect(form.valid).toBeTrue();
  });

  // No obvious PRD requirement
  it('should successfully submit new user and refresh list', fakeAsync(() => {
    mockFarmService.addUser.and.returnValue(
      of({
        id: 3,
        name: 'Charlie',
        email: 'charlie@example.com',
        role: 'support',
      }).pipe(delay(50)),
    );

    component.toggleCreateForm();
    component.createUserForm.patchValue({
      name: 'Charlie',
      email: 'charlie@example.com',
      role: 'support',
      phone: '12345',
      description: 'New support operator',
    });

    component.onSubmitUser();
    // No obvious PRD requirement
    expect(component.isSubmitting).toBeTrue();

    // No obvious PRD requirement
    tick(50);
    fixture.detectChanges();

    // No obvious PRD requirement
    expect(mockFarmService.addUser).toHaveBeenCalledWith({
      id: 0,
      name: 'Charlie',
      email: 'charlie@example.com',
      role: 'support',
      phone: '12345',
      description: 'New support operator',
    });

    // No obvious PRD requirement
    expect(component.isSubmitting).toBeFalse();
    // No obvious PRD requirement
    expect(component.showCreateForm).toBeFalse();
    // No obvious PRD requirement
    expect(mockFarmService.getUsers).toHaveBeenCalledTimes(2); // Initial + reload
  }));

  // No obvious PRD requirement
  it('should handle submission error gracefully', fakeAsync(() => {
    mockFarmService.addUser.and.returnValue(
      // No obvious PRD requirement
      timer(50).pipe(switchMap(() => throwError(() => new Error('DB Error')))),
    );

    component.toggleCreateForm();
    component.createUserForm.patchValue({
      name: 'Error User',
      email: 'err@example.com',
      role: 'user',
    });

    component.onSubmitUser();
    // No obvious PRD requirement
    expect(component.isSubmitting).toBeTrue();

    // No obvious PRD requirement
    tick(50);
    fixture.detectChanges();

    // No obvious PRD requirement
    expect(component.isSubmitting).toBeFalse();
    // No obvious PRD requirement
    expect(component.errorMsg).toContain('Failed to create user');
    // No obvious PRD requirement
    expect(component.showCreateForm).toBeTrue(); // Keeps form open
  }));

  // No obvious PRD requirement
  it('should prompt confirmation, delete user, and refresh user list on delete button click', fakeAsync(() => {
    // No obvious PRD requirement
    spyOn(window, 'confirm').and.returnValue(true);
    mockFarmService.deleteUser.and.returnValue(of(undefined));

    const event = jasmine.createSpyObj('Event', ['stopPropagation']);
    const userToDelete = {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      role: 'user',
    };

    component.deleteUser(event, userToDelete.id);

    // No obvious PRD requirement
    expect(event.stopPropagation).toHaveBeenCalled();
    // No obvious PRD requirement
    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete this user? This will delete all of their farms, fields, and records.',
    );
    // No obvious PRD requirement
    expect(mockFarmService.deleteUser).toHaveBeenCalledWith(1);

    fixture.detectChanges();
    // No obvious PRD requirement
    tick();

    // No obvious PRD requirement
    expect(mockFarmService.getUsers).toHaveBeenCalledTimes(2); // Initial + reload after delete
  }));

  // No obvious PRD requirement
  it('should not delete user if confirmation is cancelled', () => {
    // No obvious PRD requirement
    spyOn(window, 'confirm').and.returnValue(false);

    const event = jasmine.createSpyObj('Event', ['stopPropagation']);
    const userToDelete = {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      role: 'user',
    };

    component.deleteUser(event, userToDelete.id);

    // No obvious PRD requirement
    expect(event.stopPropagation).toHaveBeenCalled();
    // No obvious PRD requirement
    expect(window.confirm).toHaveBeenCalled();
    // No obvious PRD requirement
    expect(mockFarmService.deleteUser).not.toHaveBeenCalled();
  });
});
