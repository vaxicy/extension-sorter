/**
 * Pure helpers that read an extension `package.json`.
 *
 * They deliberately do not import `vscode` so that they can be unit tested in a
 * plain Node process. Everything tolerates missing/malformed fields because
 * `package.json` is third-party input.
 */

export type JsonRecord = Record<string, unknown>;

/** Narrows `unknown` to a plain JSON object. */
export function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function readString(source: JsonRecord | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readArray(source: JsonRecord | undefined, key: string): unknown[] | undefined {
  const value = source?.[key];
  return Array.isArray(value) ? value : undefined;
}

/** Metadata VS Code writes into the installed `package.json` of an extension. */
export interface ExtensionMetadata {
  installedTimestamp?: number;
  source?: string;
  pinned?: boolean;
  preRelease?: boolean;
  targetPlatform?: string;
}

/** Reads the `__metadata` block VS Code stores next to an installed extension. */
export function readExtensionMetadata(manifest: unknown): ExtensionMetadata | undefined {
  const metadata = asRecord(asRecord(manifest)?.['__metadata']);
  if (!metadata) {
    return undefined;
  }
  const installedTimestamp = metadata['installedTimestamp'];
  return {
    installedTimestamp: typeof installedTimestamp === 'number' ? installedTimestamp : undefined,
    source: readString(metadata, 'source'),
    pinned: metadata['pinned'] === true,
    preRelease: metadata['preRelease'] === true,
    targetPlatform: readString(metadata, 'targetPlatform'),
  };
}

export function getDisplayName(manifest: unknown, fallback: string): string {
  const record = asRecord(manifest);
  return readString(record, 'displayName') ?? readString(record, 'name') ?? fallback;
}

/** `publisher` from the manifest, falling back to the publisher part of the id. */
export function getPublisher(manifest: unknown, id: string): string {
  const fromManifest = readString(asRecord(manifest), 'publisher');
  if (fromManifest) {
    return fromManifest;
  }
  const separator = id.indexOf('.');
  return separator > 0 ? id.slice(0, separator) : id;
}

export function getVersion(manifest: unknown): string {
  return readString(asRecord(manifest), 'version') ?? '';
}

export function getDescription(manifest: unknown): string {
  return readString(asRecord(manifest), 'description') ?? '';
}

/** Number of color themes contributed through `contributes.themes`. */
export function getColorThemeCount(manifest: unknown): number {
  const contributes = asRecord(asRecord(manifest)?.['contributes']);
  return readArray(contributes, 'themes')?.length ?? 0;
}

/**
 * Theme detection is based on contributed themes, never on the extension name:
 * an extension called "Theme Helper" that contributes no theme is not a theme
 * extension, while a color theme with an unrelated name is.
 *
 * Color themes (`contributes.themes`) are checked first, then file icon themes
 * and product icon themes, which are themes as well.
 */
export function isThemeExtension(manifest: unknown): boolean {
  const contributes = asRecord(asRecord(manifest)?.['contributes']);
  if (!contributes) {
    return false;
  }
  return (
    (readArray(contributes, 'themes')?.length ?? 0) > 0 ||
    (readArray(contributes, 'iconThemes')?.length ?? 0) > 0 ||
    (readArray(contributes, 'productIconThemes')?.length ?? 0) > 0
  );
}

/** Relative icon path declared in the manifest (`icon` field), if any. */
export function getManifestIcon(manifest: unknown): string | undefined {
  return readString(asRecord(manifest), 'icon');
}

/**
 * `true` when `child` is `parent` itself or lives inside it.
 * Comparison is normalized to `/` and optionally case insensitive (Windows).
 */
export function isPathInside(parent: string, child: string, caseInsensitive: boolean): boolean {
  if (!parent || !child) {
    return false;
  }
  const normalize = (value: string): string => {
    const unified = value.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
    return caseInsensitive ? unified.toLowerCase() : unified;
  };
  const normalizedParent = normalize(parent);
  const normalizedChild = normalize(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

