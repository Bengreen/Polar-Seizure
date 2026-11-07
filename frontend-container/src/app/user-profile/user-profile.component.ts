import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FarmManagementService } from '../services/farm-management.service';
import { AuthService } from '../services/auth.service';
import { User, AreaUnit, VolumeUnit, WeightUnit, DistanceUnit, TemperatureUnit } from '../models/user';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.css',
})
export class UserProfileComponent implements OnInit {
  users$!: Observable<User[]>;
  currentUser$!: Observable<User>;
  userForm: FormGroup; // For adding team members
  editProfileForm: FormGroup; // For editing the current user
  currentUserData?: User; // Store the user data
  showEditProfileModal: boolean = false;
  isSaving: boolean = false;

  // A local variable to store current user id for updates
  currentUserId!: string;

  AreaUnit = AreaUnit;
  VolumeUnit = VolumeUnit;
  WeightUnit = WeightUnit;
  DistanceUnit = DistanceUnit;
  TemperatureUnit = TemperatureUnit;

  activeModules = [
    { name: 'Slurry Management Dashboard', icon: 'dashboard', active: true },
    {
      name: 'Compliance & Regulatory Hub',
      icon: 'assignment_turned_in',
      active: true,
    },
    { name: 'Inventory & Equipment', icon: 'inventory', active: true },
    { name: 'Reporting & Export', icon: 'summarize', active: true },
    { name: 'Optimization Engine', icon: 'auto_awesome', active: false },
    { name: 'Weather Integration', icon: 'cloud', active: true },
  ];

  constructor(
    private farmManagementService: FarmManagementService,
    private authService: AuthService,
    private fb: FormBuilder,
  ) {
    this.userForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
    });

    this.editProfileForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      description: [''],
      area_unit: [AreaUnit.Acres],
      volume_unit: [VolumeUnit.Litres],
      weight_unit: [WeightUnit.Kilograms],
      distance_unit: [DistanceUnit.Miles],
      temperature_unit: [TemperatureUnit.Celsius],
    });
  }

  isNewUser: boolean = false;

  // PRD Reference: 0003
  ngOnInit(): void {
    this.users$ = this.farmManagementService.getUsers();

    const authId = this.authService.getUserId();
    this.currentUserId = authId || '1';

    this.loadCurrentUser();
  }

  // PRD Reference: 0002, 0003
  loadCurrentUser() {
    this.currentUser$ = this.farmManagementService.getUser(this.currentUserId);
    this.currentUser$.subscribe({
      next: (user) => {
        if (user) {
          this.currentUserData = user;
          this.isNewUser = false;
          this.editProfileForm.patchValue({
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            description: user.description || '',
            area_unit: user.preferences?.area || AreaUnit.Acres,
            volume_unit: user.preferences?.volume || VolumeUnit.Litres,
            weight_unit: user.preferences?.weight || WeightUnit.Kilograms,
            distance_unit: user.preferences?.distance || DistanceUnit.Miles,
            temperature_unit: user.preferences?.temperature || TemperatureUnit.Celsius,
          });
        }
      },
      error: (err) => {
        // First-time login when GET /users/{id} returns 404
        if (err?.status === 404 || err) {
          this.isNewUser = true;
          this.prepopulateFromJwt();
          this.openEditProfileModal();
        }
      },
    });
  }

  // PRD Reference: 0002, 0003
  prepopulateFromJwt(): void {
    const claims = this.authService.getIdentityClaims() || {};
    const name =
      claims['name'] ||
      [claims['given_name'], claims['family_name']].filter(Boolean).join(' ') ||
      claims['preferred_username'] ||
      '';
    const email = claims['email'] || '';

    this.editProfileForm.patchValue({
      name: name,
      email: email,
      phone: '',
      description: '',
      area_unit: AreaUnit.Acres,
      volume_unit: VolumeUnit.Litres,
      weight_unit: WeightUnit.Kilograms,
      distance_unit: DistanceUnit.Miles,
      temperature_unit: TemperatureUnit.Celsius,
    });
    this.editProfileForm.markAsDirty();
  }

  // PRD Reference: 0003
  onEditProfileSubmit(): void {
    if (
      this.editProfileForm.valid &&
      (this.isNewUser || !this.editProfileForm.pristine)
    ) {
      const updatedUser: User = {
        id: this.currentUserData?.id || (isNaN(Number(this.currentUserId)) ? 0 : Number(this.currentUserId)),
        name: this.editProfileForm.value.name,
        email: this.editProfileForm.value.email,
        role: this.currentUserData?.role || 'user',
        phone: this.editProfileForm.value.phone,
        description: this.editProfileForm.value.description,
        preferences: {
          area: this.editProfileForm.value.area_unit,
          volume: this.editProfileForm.value.volume_unit,
          weight: this.editProfileForm.value.weight_unit,
          distance: this.editProfileForm.value.distance_unit,
          temperature: this.editProfileForm.value.temperature_unit,
        },
      };

      this.isSaving = true;
      const request$ = this.isNewUser
        ? this.farmManagementService.addUser(updatedUser)
        : this.farmManagementService.updateUser(this.currentUserId, updatedUser);

      request$.subscribe({
        next: () => {
          this.isSaving = false;
          this.isNewUser = false;
          this.closeEditProfileModal();
          this.loadCurrentUser();
        },
        error: () => {
          this.isSaving = false;
        },
      });
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  // PRD Reference: 0003
  handleEscape(event: KeyboardEvent) {
    if (this.showEditProfileModal) {
      this.closeEditProfileModal();
    }
  }

  // PRD Reference: 0003
  openEditProfileModal(): void {
    this.showEditProfileModal = true;
  }

  // PRD Reference: 0003
  closeEditProfileModal(): void {
    this.showEditProfileModal = false;
    // Reset form to current user data when closing
    if (this.currentUserData) {
      this.editProfileForm.patchValue({
        name: this.currentUserData.name,
        email: this.currentUserData.email,
        phone: this.currentUserData.phone || '',
        description: this.currentUserData.description || '',
        area_unit: this.currentUserData.preferences?.area || AreaUnit.Acres,
        volume_unit: this.currentUserData.preferences?.volume || VolumeUnit.Litres,
        weight_unit: this.currentUserData.preferences?.weight || WeightUnit.Kilograms,
        distance_unit: this.currentUserData.preferences?.distance || DistanceUnit.Miles,
        temperature_unit: this.currentUserData.preferences?.temperature || TemperatureUnit.Celsius,
      });
      // Mark as pristine so the save button disables again
      this.editProfileForm.markAsPristine();
    }
  }

  // PRD Reference: 0003
  onSubmitUser(): void {
    if (this.userForm.valid) {
      this.farmManagementService
        .addUser({
          ...this.userForm.value,
          role: 'Farm Worker', // Default role for team members
          modules: ['Slurry Management Dashboard'], // Default access
        })
        .subscribe(() => {
          this.users$ = this.farmManagementService.getUsers();
          this.userForm.reset();
        });
    }
  }

  // PRD Reference: 0003
  onSuspendUser(id: number | string): void {
    this.farmManagementService.deleteUser(id).subscribe(() => {
      this.users$ = this.farmManagementService.getUsers();
    });
  }

  // PRD Reference: 0003
  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }
}
