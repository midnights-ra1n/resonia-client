export function shuffleIndices(length: number, fixedFirstIndex?: number): number[] {
  if (length === 0) return [];

  const indices = Array.from({ length }, (_, i) => i);
  let pool: number[];
  let first: number;

  if (fixedFirstIndex !== undefined) {
    first = fixedFirstIndex;
    pool = indices.filter((i) => i !== fixedFirstIndex);
  } else {
    const randomStart = Math.floor(Math.random() * indices.length);
    first = indices[randomStart];
    pool = indices.filter((_, i) => i !== randomStart);
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return [first, ...pool];
}

export function linearOrder(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}

export function reshuffleUpcoming(playOrder: number[], position: number): number[] {
  const played = playOrder.slice(0, position + 1);
  const upcoming = [...playOrder.slice(position + 1)];

  for (let i = upcoming.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
  }

  return [...played, ...upcoming];
}