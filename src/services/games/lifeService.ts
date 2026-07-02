export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 30 * 60 * 1000;

export function computeRegeneratedLives(
  currentLives: number,
  lastConsumedAt: number | null,
  now: number = Date.now()
): { lives: number; lastConsumedAt: number | null } {
  if (currentLives >= MAX_LIVES || lastConsumedAt === null) {
    return { lives: currentLives, lastConsumedAt };
  }
  const elapsed = now - lastConsumedAt;
  const regenerated = Math.floor(elapsed / LIFE_REGEN_MS);
  if (regenerated <= 0) {
    return { lives: currentLives, lastConsumedAt };
  }
  const newLives = Math.min(MAX_LIVES, currentLives + regenerated);
  const newAnchor = newLives >= MAX_LIVES ? null : lastConsumedAt + regenerated * LIFE_REGEN_MS;
  return { lives: newLives, lastConsumedAt: newAnchor };
}

export function msUntilNextLife(
  lives: number,
  lastConsumedAt: number | null,
  now: number = Date.now()
): number | null {
  if (lives >= MAX_LIVES || lastConsumedAt === null) return null;
  return Math.max(0, LIFE_REGEN_MS - ((now - lastConsumedAt) % LIFE_REGEN_MS));
}
