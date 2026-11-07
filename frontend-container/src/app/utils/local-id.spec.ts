import { generateLocalId } from './local-id';

describe('generateLocalId', () => {
  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2023, 1, 1));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  // PRD Reference: 0001, 0003, 0006
  it('should generate an ID starting with a hyphen, followed by the timestamp and a 2-digit counter', () => {
    const timestamp = Date.now();
    const id = generateLocalId();
    expect(id).toMatch(new RegExp(`^-${timestamp}\\d{2}$`));
  });

  // PRD Reference: 0001, 0003, 0006
  it('should increment the counter sequentially and pad with zeros', () => {
    const id1 = generateLocalId();
    const id2 = generateLocalId();

    const counter1 = parseInt(id1.slice(-2), 10);
    const counter2 = parseInt(id2.slice(-2), 10);

    expect(counter2).toBe((counter1 + 1) % 100);
    expect(id1.endsWith(counter1.toString().padStart(2, '0'))).toBeTrue();
    expect(id2.endsWith(counter2.toString().padStart(2, '0'))).toBeTrue();
  });

  // PRD Reference: 0001, 0003, 0006
  it('should wrap around the counter to 00 after 99', () => {
    let currentCounter = 0;
    const id = generateLocalId();
    currentCounter = parseInt(id.slice(-2), 10);

    const callsTo99 = (99 - currentCounter + 100) % 100;

    for (let i = 0; i < callsTo99; i++) {
      generateLocalId();
    }

    const nextId = generateLocalId();
    expect(nextId.slice(-2)).toBe('00');

    const followingId = generateLocalId();
    expect(followingId.slice(-2)).toBe('01');
  });
});
