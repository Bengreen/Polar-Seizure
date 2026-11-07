import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { NetworkService } from './network.service';

// No obvious PRD requirement
describe('NetworkService', () => {
  let service: NetworkService;

  // No obvious PRD requirement
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NetworkService],
    });
    service = TestBed.inject(NetworkService);
  });

  // No obvious PRD requirement
  it('should be created', () => {
    // No obvious PRD requirement
    expect(service).toBeTruthy();
  });

  // No obvious PRD requirement
  it('should emit the current online status as the initial value', async () => {
    const isOnline = await firstValueFrom(service.isOnline$.pipe(take(1)));
    // In the test browser we expect to be online
    // No obvious PRD requirement
    expect(isOnline).toBe(navigator.onLine);
  });

  // No obvious PRD requirement
  it('should emit false when an offline event is dispatched', (done) => {
    const values: boolean[] = [];
    const sub = service.isOnline$.subscribe((v) => {
      values.push(v);
      // After initial + offline event
      if (values.length === 2) {
        // No obvious PRD requirement
        expect(values[1]).toBe(false);
        sub.unsubscribe();
        // No obvious PRD requirement
        done();
      }
    });
    window.dispatchEvent(new Event('offline'));
  });

  // No obvious PRD requirement
  it('should emit true when an online event is dispatched', (done) => {
    const values: boolean[] = [];
    const sub = service.isOnline$.subscribe((v) => {
      values.push(v);
      if (values.length === 3) {
        // No obvious PRD requirement
        expect(values[2]).toBe(true);
        sub.unsubscribe();
        // No obvious PRD requirement
        done();
      }
    });
    // Simulate going offline then back online
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
});
