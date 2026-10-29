// Short, speakable room codes shown as ABC-DEF, with look-alikes left out (0/O, 1/I/L, 5/S, 2/Z).
const ALPHABET = '346789ABCDEFGHJKMNPQRTUVWXY';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(random: () => number = secureRandom): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return format(code);
}

/** Accepts sloppy typing ("abc def", "abcdef"); returns canonical ABC-DEF, or null if it can't be a code. */
export function normalizeRoomCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '');
  if (raw.length !== ROOM_CODE_LENGTH || [...raw].some(c => !ALPHABET.includes(c))) return null;
  return format(raw);
}

const format = (raw: string) => `${raw.slice(0, 3)}-${raw.slice(3)}`;

function secureRandom(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0] / 4294967296;
}
