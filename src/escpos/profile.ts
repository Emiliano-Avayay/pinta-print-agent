export interface PrinterProfile {
  paperWidthMm: number;
  columns: number;
  supportsCut: boolean;
  characterEncoding: string;
  finalFeedLines: number;
}

export type PrinterProfileOverrides = Partial<PrinterProfile>;

const freezeProfile = (profile: PrinterProfile): Readonly<PrinterProfile> =>
  Object.freeze({ ...profile });

export const DEVELOPMENT_PROFILE_58MM = freezeProfile({
  paperWidthMm: 58,
  columns: 32,
  supportsCut: false,
  characterEncoding: 'ascii-safe',
  finalFeedLines: 3,
});

/** Production baseline for the USB-connected Nexuspos NX80 (80 mm ESC/POS). */
export const NEXUSPOS_NX80_PROFILE_80MM = freezeProfile({
  paperWidthMm: 80,
  columns: 48,
  supportsCut: false,
  characterEncoding: 'ascii-safe',
  finalFeedLines: 3,
});

export const DEVELOPMENT_PROFILES = Object.freeze({
  mm58: DEVELOPMENT_PROFILE_58MM,
  mm80: NEXUSPOS_NX80_PROFILE_80MM,
});

/** @deprecated Prefer NEXUSPOS_NX80_PROFILE_80MM for production code. */
export const DEVELOPMENT_PROFILE_80MM = NEXUSPOS_NX80_PROFILE_80MM;

export function createPrinterProfile(
  base: Readonly<PrinterProfile> = NEXUSPOS_NX80_PROFILE_80MM,
  overrides: PrinterProfileOverrides = {},
): PrinterProfile {
  const profile: PrinterProfile = { ...base, ...overrides };
  validatePrinterProfile(profile);
  return profile;
}

export function validatePrinterProfile(profile: Readonly<PrinterProfile>): void {
  if (!Number.isFinite(profile.paperWidthMm) || profile.paperWidthMm <= 0) {
    throw new RangeError('paperWidthMm must be a positive finite number');
  }
  if (!Number.isInteger(profile.columns) || profile.columns < 16 || profile.columns > 255) {
    throw new RangeError('columns must be an integer between 16 and 255');
  }
  if (typeof profile.supportsCut !== 'boolean') {
    throw new TypeError('supportsCut must be a boolean');
  }
  if (typeof profile.characterEncoding !== 'string' || !profile.characterEncoding.trim()) {
    throw new TypeError('characterEncoding must be a non-empty string');
  }
  if (
    !Number.isInteger(profile.finalFeedLines)
    || profile.finalFeedLines < 0
    || profile.finalFeedLines > 255
  ) {
    throw new RangeError('finalFeedLines must be an integer between 0 and 255');
  }
}
