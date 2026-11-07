let localIdCounter = 0;
// PRD Reference: 0001, 0003, 0006
export function generateLocalId(): string {
  localIdCounter = (localIdCounter + 1) % 100;
  return `-${Date.now()}${localIdCounter.toString().padStart(2, '0')}`;
}
