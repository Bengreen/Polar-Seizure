import { TestBed } from '@angular/core/testing';
import { LoggerService } from './logger.service';
import { APP_CONFIG } from '../app-config';

// No obvious PRD requirement
describe('LoggerService', () => {
  let service: LoggerService;

  // No obvious PRD requirement
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_CONFIG,
          useValue: { apiPath: '/api', logLevel: 'DEBUG' },
        },
      ],
    });
    service = TestBed.inject(LoggerService);
  });

  // No obvious PRD requirement
  it('should be created', () => {
    // No obvious PRD requirement
    expect(service).toBeTruthy();
  });

  // No obvious PRD requirement
  it('should call console.debug when log is called', () => {
    const spy = spyOn(console, 'debug');
    service.log('test message');
    // No obvious PRD requirement
    expect(spy).toHaveBeenCalledWith('test message');
  });

  // No obvious PRD requirement
  it('should call console.info when info is called', () => {
    const spy = spyOn(console, 'info');
    service.info('test message');
    // No obvious PRD requirement
    expect(spy).toHaveBeenCalledWith('test message');
  });

  // No obvious PRD requirement
  it('should call console.warn when warn is called', () => {
    const spy = spyOn(console, 'warn');
    service.warn('test message');
    // No obvious PRD requirement
    expect(spy).toHaveBeenCalledWith('test message');
  });

  // No obvious PRD requirement
  it('should call console.error when error is called', () => {
    const spy = spyOn(console, 'error');
    service.error('test message');
    // No obvious PRD requirement
    expect(spy).toHaveBeenCalledWith('test message');
  });
});
