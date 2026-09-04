export interface TextEncoderStrategy {
  readonly name: string;
  encode(text: string): Uint8Array;
}

const SAFE_PUNCTUATION: Readonly<Record<string, string>> = Object.freeze({
  '\u00a0': ' ',
  '\u00aa': 'a',
  '\u00ba': 'o',
  '\u00ab': '"',
  '\u00bb': '"',
  '\u00bf': '?',
  '\u00a1': '!',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2212': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201a': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u201e': '"',
  '\u2022': '*',
  '\u2026': '...',
  '\u00b7': '.',
});

const SAFE_LETTERS: Readonly<Record<string, string>> = Object.freeze({
  '\u00c6': 'AE',
  '\u00e6': 'ae',
  '\u00d0': 'D',
  '\u00f0': 'd',
  '\u00d8': 'O',
  '\u00f8': 'o',
  '\u00de': 'TH',
  '\u00fe': 'th',
  '\u00df': 'ss',
  '\u0141': 'L',
  '\u0142': 'l',
  '\u0152': 'OE',
  '\u0153': 'oe',
});

const isCombiningMark = (character: string): boolean => /\p{Mark}/u.test(character);

/**
 * Deterministic development encoding restricted to printable ASCII bytes.
 * It deliberately makes no claim of compatibility with a physical printer;
 * the real device code page must be selected after its model is known.
 */
export class AsciiSafeTextEncoder implements TextEncoderStrategy {
  readonly name = 'ascii-safe';

  encode(text: string): Uint8Array {
    const output: number[] = [];

    for (const originalCharacter of text) {
      const replacement = SAFE_PUNCTUATION[originalCharacter]
        ?? SAFE_LETTERS[originalCharacter]
        ?? originalCharacter;

      for (const character of replacement.normalize('NFD')) {
        if (isCombiningMark(character)) continue;
        const codePoint = character.codePointAt(0);
        if (codePoint !== undefined && codePoint >= 0x20 && codePoint <= 0x7e) {
          output.push(codePoint);
        } else {
          output.push(0x3f);
        }
      }
    }

    return Uint8Array.from(output);
  }
}
