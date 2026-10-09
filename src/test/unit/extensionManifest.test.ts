import * as assert from 'assert';
import { SorterExtension } from '../../models/extensionInfo';
import {
  asRecord,
  getColorThemeCount,
  getDisplayName,
  getManifestIcon,
  getPublisher,
  getVersion,
  isPathInside,
  isThemeExtension,
  readExtensionMetadata,
} from '../../models/extensionManifest';
import { buildTooltipLines } from '../../models/tooltip';

const themeManifest = {
  name: 'apricot-glow',
  displayName: 'Apricot Glow Theme',
  publisher: 'lilin',
  version: '1.2.3',
  description: 'A warm theme',
  icon: 'icon.png',
  contributes: {
    themes: [
      { label: 'Apricot Glow', uiTheme: 'vs-dark', path: './themes/apricot.json' },
      { label: 'Apricot Light', uiTheme: 'vs', path: './themes/apricot-light.json' },
    ],
  },
  __metadata: { installedTimestamp: 1770000000000, source: 'gallery', pinned: true },
};

const plainManifest = { name: 'beta-tool', publisher: 'fabrikam', version: '0.0.1' };

describe('extensionManifest - safe reading', () => {
  it('narrows unknown values to objects', () => {
    assert.deepStrictEqual(asRecord({ a: 1 }), { a: 1 });
    assert.strictEqual(asRecord(null), undefined);
    assert.strictEqual(asRecord([1]), undefined);
    assert.strictEqual(asRecord('x'), undefined);
  });

  it('reads the metadata VS Code writes into an installed manifest', () => {
    const metadata = readExtensionMetadata(themeManifest);
    assert.strictEqual(metadata?.installedTimestamp, 1770000000000);
    assert.strictEqual(metadata?.source, 'gallery');
    assert.strictEqual(metadata?.pinned, true);
    assert.strictEqual(readExtensionMetadata(plainManifest), undefined);
  });

  it('falls back when display fields are missing', () => {
    assert.strictEqual(getDisplayName(themeManifest, 'fallback'), 'Apricot Glow Theme');
    assert.strictEqual(getDisplayName(plainManifest, 'fallback'), 'beta-tool');
    assert.strictEqual(getDisplayName(undefined, 'acme.thing'), 'acme.thing');
    assert.strictEqual(getPublisher(plainManifest, 'fabrikam.beta-tool'), 'fabrikam');
    assert.strictEqual(getPublisher({}, 'acme.thing'), 'acme');
    assert.strictEqual(getPublisher({}, 'noseparator'), 'noseparator');
    assert.strictEqual(getVersion(themeManifest), '1.2.3');
    assert.strictEqual(getVersion(undefined), '');
    assert.strictEqual(getManifestIcon(themeManifest), 'icon.png');
    assert.strictEqual(getManifestIcon(undefined), undefined);
  });
});

describe('extensionManifest - theme detection', () => {
  it('uses contributed themes, not the extension name', () => {
    assert.strictEqual(isThemeExtension(themeManifest), true);
    assert.strictEqual(isThemeExtension({ name: 'Some Theme Helper', contributes: { commands: [] } }), false);
    assert.strictEqual(isThemeExtension({ name: 'unrelated', contributes: { themes: [{ label: 'x' }] } }), true);
    assert.strictEqual(isThemeExtension({ name: 'icons', contributes: { iconThemes: [{ id: 'x', path: 'p' }] } }), true);
    assert.strictEqual(isThemeExtension({ name: 'producticons', contributes: { productIconThemes: [{ id: 'x', path: 'p' }] } }), true);
    assert.strictEqual(isThemeExtension({ name: 'empty', contributes: { themes: [] } }), false);
    assert.strictEqual(isThemeExtension(undefined), false);
  });

  it('counts color themes only', () => {
    assert.strictEqual(getColorThemeCount(themeManifest), 2);
    assert.strictEqual(getColorThemeCount({ contributes: { iconThemes: [{}] } }), 0);
    assert.strictEqual(getColorThemeCount(undefined), 0);
  });
});

describe('extensionManifest - path containment', () => {
  it('accepts the folder itself and children', () => {
    assert.strictEqual(isPathInside('C:\\Users\\me\\.vscode\\extensions', 'C:\\Users\\me\\.vscode\\extensions\\acme.alpha-1.0.0', true), true);
    assert.strictEqual(isPathInside('/home/me/.vscode/extensions', '/home/me/.vscode/extensions/acme.alpha-1.0.0', false), true);
    assert.strictEqual(isPathInside('/a', '/a', false), true);
  });

  it('rejects siblings that only share a prefix', () => {
    assert.strictEqual(isPathInside('/a/ext', '/a/extensions', false), false);
    assert.strictEqual(isPathInside('/home/me/.vscode/extensions', '/home/me/other/acme.alpha', false), false);
  });

  it('honours case sensitivity', () => {
    assert.strictEqual(isPathInside('C:\\Ext', 'c:\\ext\\child', true), true);
    assert.strictEqual(isPathInside('/Ext', '/ext/child', false), false);
  });

  it('rejects empty input', () => {
    assert.strictEqual(isPathInside('', '/a', false), false);
    assert.strictEqual(isPathInside('/a', '', false), false);
  });
});

describe('tooltip', () => {
  const extension: SorterExtension = {
    id: 'lilin.apricot-glow',
    name: 'Apricot Glow Theme',
    publisher: 'lilin',
    version: '1.2.3',
    description: '',
    isTheme: true,
    themeCount: 2,
    isBuiltin: false,
    extensionPath: 'C:\\Users\\me\\.vscode\\extensions\\lilin.apricot-glow-1.2.3',
    iconPath: 'C:\\Users\\me\\.vscode\\extensions\\lilin.apricot-glow-1.2.3\\icon.png',
    installDateMs: Date.UTC(2026, 8, 1),
    installDateSource: 'file-birthtime',
  };

  it('contains everything a user needs to understand the date', () => {
    const text = buildTooltipLines(extension, { now: Date.UTC(2026, 9, 9) }).join('\n');
    assert.ok(text.includes('**Apricot Glow Theme**'));
    assert.ok(text.includes('`lilin.apricot-glow`'));
    assert.ok(text.includes('Publisher: lilin'));
    assert.ok(text.includes('Version: 1.2.3'));
    assert.ok(text.includes('Date source: Estimated from the creation time of the extension folder.'));
    assert.ok(text.includes('Theme extension: Yes (2 color themes)'));
    assert.ok(text.includes('Estimated date - VS Code does not expose the exact install time.'));
    assert.ok(text.includes('Path: `'), 'tooltips include the extension folder');
  });

  it('explains unknown and observed dates', () => {
    const unknown = buildTooltipLines({ ...extension, installDateMs: undefined, installDateSource: 'unknown' }, { now: 0 }).join('\n');
    assert.ok(unknown.includes('Date: Unknown - Unknown'));
    assert.ok(unknown.includes('No install date could be determined'));

    const firstSeen = buildTooltipLines({ ...extension, installDateSource: 'first-seen' }, { now: Date.UTC(2026, 9, 9) }).join('\n');
    assert.ok(firstSeen.includes('Observed date - this is not the install time.'));
  });

  it('marks built-in and non theme extensions', () => {
    const text = buildTooltipLines({ ...extension, isTheme: false, isBuiltin: true }, { now: 0 }).join('\n');
    assert.ok(text.includes('Theme extension: No'));
    assert.ok(text.includes('Built-in extension: Yes'));
  });
});
