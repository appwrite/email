// Server-wide branding set by admins: the app's name, logo and accent color.
// It's cached on the device and the accent is applied by the boot script, so
// returning visitors see their brand from the first paint.
import type { Models } from 'appwrite';
import { DATABASE_ID, ENDPOINT, PROJECT_ID, TABLES, tablesDB } from './appwrite';
import { createStore } from './store';

export const DEFAULT_NAME = 'Mail';
export const BRAND_KEY = 'ae:brand';
export const BRANDING_BUCKET_ID = 'branding';

export type Brand = { name: string; logo: string | null; accent: string | null };
export const DEFAULT_BRAND: Brand = { name: DEFAULT_NAME, logo: null, accent: null };

/** Apple's system colors, offered as accent presets. */
export const ACCENT_PRESETS: [string, string][] = [
  ['Blue', '#007aff'],
  ['Indigo', '#5856d6'],
  ['Purple', '#af52de'],
  ['Pink', '#ff2d55'],
  ['Red', '#ff3b30'],
  ['Orange', '#ff9500'],
  ['Green', '#34c759'],
  ['Teal', '#30b0c7'],
  ['Graphite', '#8e8e93'],
];

// The server snapshot is always the default, so prerendered pages hydrate
// cleanly; the cached brand applies right after.
export const brandStore = createStore<Brand>(DEFAULT_BRAND);

export const useBrand = () => brandStore.use((s) => s);

export function logoUrl(fileId: string) {
  return `${ENDPOINT}/storage/buckets/${BRANDING_BUCKET_ID}/files/${fileId}/view?project=${PROJECT_ID}`;
}

type ConfigRow = Models.Row & { brandName?: string | null; brandLogo?: string | null; brandAccent?: string | null };

export function brandFromConfig(row: Partial<ConfigRow> | null | undefined): Brand {
  return {
    name: row?.brandName?.trim() || DEFAULT_NAME,
    logo: row?.brandLogo ? logoUrl(row.brandLogo) : null,
    accent: row?.brandAccent || null,
  };
}

export function applyBrand(brand: Brand) {
  brandStore.set(brand);
  const root = document.documentElement;
  if (brand.accent) root.style.setProperty('--brand-accent', brand.accent);
  else root.style.removeProperty('--brand-accent');
  try {
    localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
  } catch {
    // storage may be unavailable
  }
}

let loading: Promise<void> | null = null;

/** Applies the cached brand, then the server's. */
export function initBrand(force = false) {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!loading) {
    try {
      const cached = JSON.parse(localStorage.getItem(BRAND_KEY) || 'null');
      if (cached?.name) applyBrand(cached);
    } catch {
      // ignore
    }
  }
  if (!loading || force) {
    loading = tablesDB
      .getRow<ConfigRow>({ databaseId: DATABASE_ID, tableId: TABLES.config, rowId: 'app' })
      .then((row) => applyBrand(brandFromConfig(row)))
      .catch((e) => {
        if (e?.code === 404) applyBrand(DEFAULT_BRAND);
      });
  }
  return loading;
}
