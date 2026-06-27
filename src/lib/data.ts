import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.join(process.cwd(), 'src/data');

/** In-memory cache so repeated loads of the same file hit disk once. */
const cache = new Map<string, unknown>();

/**
 * Load and parse a YAML data file.
 * Results are cached — subsequent calls for the same file return the cached value.
 * Logs a warning on parse failure instead of silently returning {}.
 */
export function load<T>(file: string): T {
  if (cache.has(file)) return cache.get(file) as T;

  const filePath = path.join(dataDir, file);
  try {
    const result = (yaml.load(fs.readFileSync(filePath, 'utf8')) || {}) as T;
    cache.set(file, result);
    return result;
  } catch (err) {
    console.error(`[data] Failed to parse ${file}:`, err instanceof Error ? err.message : err);
    const fallback = {} as T;
    cache.set(file, fallback);
    return fallback;
  }
}

// Lord Icon color themes
export const LORD_ICON_COLORS = {
  default: 'primary:#1A1D23,secondary:#0891B2',
  onDark: 'primary:#ffffff,secondary:#ffffff',
  accent: 'primary:#0891B2,secondary:#0891B2',
} as const;

/** @deprecated Use LORD_ICON_COLORS instead */
export const LI = {
  dark: LORD_ICON_COLORS.default,
  light: LORD_ICON_COLORS.onDark,
  blue: LORD_ICON_COLORS.accent,
};

// Lord Icon CDN URL from hash
export const liSrc = (hash: string) => `https://cdn.lordicon.com/${hash}.json`;

/**
 * Encode an email address as HTML entities to deter scrapers.
 * Browsers render it normally; bots see gibberish.
 */
export function obfuscateEmail(email: string): string {
  return email
    .split('')
    .map((c) => `&#${c.charCodeAt(0)};`)
    .join('');
}
