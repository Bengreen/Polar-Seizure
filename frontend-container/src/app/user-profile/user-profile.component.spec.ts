import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { UserProfileComponent } from './user-profile.component';
import { FarmManagementService } from '../services/farm-management.service';
import { AuthService } from '../services/auth.service';
// PRD Reference: 0003
describe('UserProfileComponent', () => {
  let component: UserProfileComponent;
  let fixture: ComponentFixture<UserProfileComponent>;
  let mockFarmService: any;
  let mockAuthService: any;

  // PRD Reference: 0003
  beforeEach(async () => {
    mockFarmService = {
      getUsers: jasmine.createSpy('getUsers').and.returnValue(of([{ id: 1, name: 'Test User', email: 'test@example.com' }])),
      getUser: jasmine.createSpy('getUser').and.returnValue(of({ id: 1, name: 'Test User', email: 'test@example.com' })),
      updateUser: jasmine.createSpy('updateUser').and.returnValue(of({ id: 1, name: 'Updated User', email: 'test@example.com' })),
      addUser: jasmine.createSpy('addUser').and.returnValue(of({ id: 2, name: 'New User', email: 'new@example.com' })),
      deleteUser: jasmine.createSpy('deleteUser').and.returnValue(of({}))
    };

    mockAuthService = {
      getUserId: jasmine.createSpy('getUserId').and.returnValue('1')
    };

    await TestBed.configureTestingModule({
      imports: [UserProfileComponent],
      providers: [
        { provide: ActivatedRoute, useValue: {} },
        // PRD Reference: 0003
        provideRouter([]),
        { provide: FarmManagementService, useValue: mockFarmService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // PRD Reference: 0003
  it('should create', () => {
    // PRD Reference: 0003
    expect(component).toBeTruthy();
  });

  // PRD Reference: 0003
  it('should load users on init', () => {
    component.users$.subscribe((users) => {
      // PRD Reference: 0003
      expect(users.length).toBe(1);
      // PRD Reference: 0003
      expect(users[0].name).toBe('Test User');
    });
    // PRD Reference: 0003
    expect(mockFarmService.getUsers).toHaveBeenCalled();
  });

  // PRD Reference: 0002, 0003
  it('should handle 404 user profile error by pre-populating form from JWT claims and opening edit modal', () => {
    mockFarmService.getUser.and.returnValue(throwError(() => ({ status: 404 })));
    mockAuthService.getIdentityClaims = jasmine.createSpy('getIdentityClaims').and.returnValue({
      sub: 'ae5245cd-3095-46db-8ce3-cea42fe26edf',
      name: 'John Snow',
      email: 'john.snow13@example.com',
      preferred_username: 'johnsnow'
    });

    component.loadCurrentUser();

    expect(component.isNewUser).toBeTrue();
    expect(component.showEditProfileModal).toBeTrue();
    expect(component.editProfileForm.value.name).toBe('John Snow');
    expect(component.editProfileForm.value.email).toBe('john.snow13@example.com');
  });

  // PRD Reference: 0002, 0003
  it('should call addUser on profile submit when isNewUser is true', () => {
    component.isNewUser = true;
    component.editProfileForm.patchValue({
      name: 'John Snow',
      email: 'john.snow13@example.com'
    });

    component.onEditProfileSubmit();

    expect(mockFarmService.addUser).toHaveBeenCalledWith(jasmine.objectContaining({
      name: 'John Snow',
      email: 'john.snow13@example.com'
    }));
  });
});
