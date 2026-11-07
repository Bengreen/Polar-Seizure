import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { FarmManagementService } from './farm-management.service';

export const moduleGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot
): Observable<boolean> => {
  const authService = inject(AuthService);
  const farmManagementService = inject(FarmManagementService);
  const router = inject(Router);

  const requiredModule = route.data['module'];
  if (!requiredModule) {
    return of(true);
  }

  const userId = authService.getUserId();
  if (!userId) {
    router.navigate(['/home']);
    return of(false);
  }

  return farmManagementService.getUser(userId).pipe(
    map((user) => {
      if (user.modules && user.modules.includes(requiredModule)) {
        return true;
      }
      router.navigate(['/home']);
      return false;
    }),
    catchError(() => {
      router.navigate(['/home']);
      return of(false);
    })
  );
};