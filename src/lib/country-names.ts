/**
 * ISO 3166-1 alpha-2 to display name lookup.
 * Used by geo surfaces to show human-readable country names
 * instead of raw codes (e.g. "Mexico" instead of "MX").
 *
 * Extend this table when adding trackers with new country codes.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan',
  AL: 'Albania',
  AM: 'Armenia',
  AO: 'Angola',
  AR: 'Argentina',
  AZ: 'Azerbaijan',
  BD: 'Bangladesh',
  BO: 'Bolivia',
  BR: 'Brazil',
  BY: 'Belarus',
  CL: 'Chile',
  CN: 'China',
  CO: 'Colombia',
  CU: 'Cuba',
  DE: 'Germany',
  EG: 'Egypt',
  ES: 'Spain',
  ET: 'Ethiopia',
  FR: 'France',
  GB: 'United Kingdom',
  GE: 'Georgia',
  HT: 'Haiti',
  ID: 'Indonesia',
  IL: 'Israel',
  IN: 'India',
  IQ: 'Iraq',
  IR: 'Iran',
  JP: 'Japan',
  KP: 'North Korea',
  KR: 'South Korea',
  LB: 'Lebanon',
  LY: 'Libya',
  ML: 'Mali',
  MM: 'Myanmar',
  MX: 'Mexico',
  NG: 'Nigeria',
  PH: 'Philippines',
  PK: 'Pakistan',
  PR: 'Puerto Rico',
  PS: 'Palestine',
  RU: 'Russia',
  SA: 'Saudi Arabia',
  SD: 'Sudan',
  SO: 'Somalia',
  SS: 'South Sudan',
  SY: 'Syria',
  TW: 'Taiwan',
  UA: 'Ukraine',
  US: 'United States',
  VE: 'Venezuela',
  VN: 'Vietnam',
  YE: 'Yemen',
  ZA: 'South Africa',
  ZW: 'Zimbabwe',
};

/**
 * Return the display name for a country code.
 * Falls back to the code itself if unknown (e.g. "XK" -> "XK").
 * Never throws.
 */
export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}
