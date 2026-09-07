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

/**
 * Multilingual names and common short forms per ISO code (es/fr/pt plus
 * English variants). Used by the gazetteer so "Estados Unidos",
 * "États-Unis" and "United States" resolve to the same place.
 * Keys are the same codes as COUNTRY_NAMES; the English display name is
 * added automatically by the gazetteer.
 */
export const COUNTRY_ALIASES: Record<string, string[]> = {
  AF: ['Afganistán', 'Afeganistão'],
  AL: ['Albania', 'Albanie', 'Albânia'],
  AM: ['Armenia', 'Arménie', 'Armênia'],
  AO: ['Angola'],
  AR: ['Argentina', 'Argentine'],
  AZ: ['Azerbaiyán', 'Azerbaïdjan', 'Azerbaijão'],
  BD: ['Bangladés', 'Bangladesh'],
  BO: ['Bolivia', 'Bolivie', 'Bolívia'],
  BR: ['Brasil', 'Brésil', 'Brazil'],
  BY: ['Bielorrusia', 'Biélorussie', 'Bielorrússia', 'Belarus'],
  CL: ['Chile', 'Chili'],
  CN: ['China', 'Chine', 'República Popular China'],
  CO: ['Colombia', 'Colombie', 'Colômbia'],
  CU: ['Cuba'],
  DE: ['Alemania', 'Allemagne', 'Alemanha', 'Germany'],
  EG: ['Egipto', 'Égypte', 'Egito', 'Egypt'],
  ES: ['España', 'Espagne', 'Espanha', 'Spain'],
  ET: ['Etiopía', 'Éthiopie', 'Etiópia', 'Ethiopia'],
  FR: ['Francia', 'France', 'França'],
  GB: ['Reino Unido', 'Royaume-Uni', 'United Kingdom', 'Britain', 'Great Britain', 'UK'],
  GE: ['Georgia', 'Géorgie', 'Geórgia'],
  HT: ['Haití', 'Haïti', 'Haiti'],
  ID: ['Indonesia', 'Indonésie', 'Indonésia'],
  IL: ['Israel', 'Israël'],
  IN: ['India', 'Inde', 'Índia'],
  IQ: ['Irak', 'Iraque', 'Iraq'],
  IR: ['Irán', 'Iran', 'Irã'],
  JP: ['Japón', 'Japon', 'Japão', 'Japan'],
  KP: ['Corea del Norte', 'Corée du Nord', 'Coreia do Norte', 'North Korea', 'DPRK'],
  KR: ['Corea del Sur', 'Corée du Sud', 'Coreia do Sul', 'South Korea'],
  LB: ['Líbano', 'Liban', 'Lebanon'],
  LY: ['Libia', 'Libye', 'Líbia', 'Libya'],
  ML: ['Malí', 'Mali'],
  MM: ['Birmania', 'Birmanie', 'Mianmar', 'Myanmar', 'Burma'],
  MX: ['México', 'Mexique', 'Mexico'],
  NG: ['Nigeria', 'Nigéria'],
  PH: ['Filipinas', 'Philippines'],
  PK: ['Pakistán', 'Pakistan', 'Paquistão'],
  PR: ['Puerto Rico', 'Porto Rico'],
  PS: ['Palestina', 'Palestine'],
  RU: ['Rusia', 'Russie', 'Rússia', 'Russia', 'Russian Federation'],
  SA: ['Arabia Saudita', 'Arabia Saudí', 'Arabie saoudite', 'Arábia Saudita', 'Saudi Arabia'],
  SD: ['Sudán', 'Soudan', 'Sudão', 'Sudan'],
  SO: ['Somalia', 'Somalie', 'Somália'],
  SS: ['Sudán del Sur', 'Soudan du Sud', 'Sudão do Sul', 'South Sudan'],
  SY: ['Siria', 'Syrie', 'Síria', 'Syria'],
  TW: ['Taiwán', 'Taïwan', 'Taiwan'],
  UA: ['Ucrania', 'Ukraine', 'Ucrânia'],
  US: ['Estados Unidos', 'États-Unis', 'Etats-Unis', 'United States', 'EE.UU.', 'EEUU', 'USA', 'U.S.'],
  VE: ['Venezuela', 'Venezuela'],
  VN: ['Vietnam', 'Viet Nam', 'Vietnã'],
  YE: ['Yemen', 'Yémen', 'Iêmen'],
  ZA: ['Sudáfrica', 'Afrique du Sud', 'África do Sul', 'South Africa'],
  ZW: ['Zimbabue', 'Zimbabwe', 'Zimbábue'],
};

/** Approximate geographic centroids (lat, lon) for the codes in COUNTRY_NAMES. */
export const COUNTRY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  AF: { lat: 33.9, lon: 67.7 }, AL: { lat: 41.2, lon: 20.2 }, AM: { lat: 40.1, lon: 45.0 }, AO: { lat: -11.2, lon: 17.9 },
  AR: { lat: -38.4, lon: -63.6 }, AZ: { lat: 40.1, lon: 47.6 }, BD: { lat: 23.7, lon: 90.4 }, BO: { lat: -16.3, lon: -63.6 },
  BR: { lat: -14.2, lon: -51.9 }, BY: { lat: 53.7, lon: 27.9 }, CL: { lat: -35.7, lon: -71.5 }, CN: { lat: 35.9, lon: 104.2 },
  CO: { lat: 4.6, lon: -74.3 }, CU: { lat: 21.5, lon: -77.8 }, DE: { lat: 51.2, lon: 10.4 }, EG: { lat: 26.8, lon: 30.8 },
  ES: { lat: 40.5, lon: -3.7 }, ET: { lat: 9.1, lon: 40.5 }, FR: { lat: 46.2, lon: 2.2 }, GB: { lat: 54.0, lon: -2.5 },
  GE: { lat: 42.3, lon: 43.4 }, HT: { lat: 19.0, lon: -72.3 }, ID: { lat: -2.5, lon: 118.0 }, IL: { lat: 31.0, lon: 34.9 },
  IN: { lat: 20.6, lon: 79.0 }, IQ: { lat: 33.2, lon: 43.7 }, IR: { lat: 32.4, lon: 53.7 }, JP: { lat: 36.2, lon: 138.3 },
  KP: { lat: 40.3, lon: 127.5 }, KR: { lat: 36.5, lon: 127.9 }, LB: { lat: 33.9, lon: 35.9 }, LY: { lat: 26.3, lon: 17.2 },
  ML: { lat: 17.6, lon: -4.0 }, MM: { lat: 19.8, lon: 96.7 }, MX: { lat: 23.6, lon: -102.6 }, NG: { lat: 9.1, lon: 8.7 },
  PH: { lat: 12.9, lon: 121.8 }, PK: { lat: 30.4, lon: 69.3 }, PR: { lat: 18.2, lon: -66.5 }, PS: { lat: 31.9, lon: 35.2 },
  RU: { lat: 61.5, lon: 105.3 }, SA: { lat: 23.9, lon: 45.1 }, SD: { lat: 12.9, lon: 30.2 }, SO: { lat: 5.2, lon: 46.2 },
  SS: { lat: 6.9, lon: 31.3 }, SY: { lat: 34.8, lon: 39.0 }, TW: { lat: 23.7, lon: 121.0 }, UA: { lat: 48.4, lon: 31.2 },
  US: { lat: 39.8, lon: -98.6 }, VE: { lat: 6.4, lon: -66.6 }, VN: { lat: 14.1, lon: 108.3 }, YE: { lat: 15.6, lon: 48.5 },
  ZA: { lat: -30.6, lon: 22.9 }, ZW: { lat: -19.0, lon: 29.2 },
};
