import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Runs the integration tests inside the *locally installed* VS Code.
 *
 * This is the same mechanism the official `@vscode/test-electron` uses
 * (`--extensionDevelopmentPath` + `--extensionTestsPath`), just without
 * downloading a second copy of VS Code:
 *
 *   1. an isolated profile is created in the temp folder,
 *   2. two fake extensions are placed in its `--extensions-dir`,
 *   3. VS Code is started three times with that profile:
 *      - `write`: records a sort order and shuts down gracefully,
 *      - `read`:  verifies that the state of `write` survived the restart,
 *      - `suite`: runs the whole mocha suite (`--extensionTestsPath`).
 *
 * The two persistence phases must **not** use `--extensionTestsPath`: VS Code
 * turns every storage database into in-memory SQLite as soon as that flag is set
 * (see `src/test/integration/stateDriver.ts`), so a test run can never observe
 * what a previous run wrote. They are ordinary editor launches driven by a
 * generated helper extension instead.
 *
 * Usage: `npm run test:integration` (set `VSCODE_EXECUTABLE_PATH` to override
 * the editor that is used, `EXTENSION_SORTER_TEST_PHASES=suite` to run only one
 * phase).
 */

const projectRoot = path.resolve(__dirname, '..', '..');
const integrationDir = path.join(projectRoot, 'out', 'test', 'integration');
const extensionTestsPath = path.join(integrationDir, 'index.js');

const APRICOT_ID = 'contoso.apricot-glow-theme';
const BLUE_HOUR_ID = 'fabrikam.blue-hour-tool';
/** Install time VS Code would have recorded for the fake theme. */
const APRICOT_INSTALLED_AT = Date.UTC(2026, 0, 15, 10, 0, 0);

/** Id of the generated helper extension that drives the persistence phases. */
const DRIVER_EXTENSION_ID = 'extension-sorter-test.state-driver';
const DRIVER_EXTENSION_VERSION = '1.0.0';

const LAUNCH_TIMEOUT_MS = 5 * 60 * 1000;

/** `write` and `read` need a real editor, `suite` needs `--extensionTestsPath`. */
type Phase = 'write' | 'read' | 'suite';
const ALL_PHASES: readonly Phase[] = ['write', 'read', 'suite'];

interface Profile {
  root: string;
  userDataDir: string;
  extensionsDir: string;
}

interface PhaseRun {
  phase: Phase;
  startedAt: number;
  /** Path the driver extension writes its JSON report to; only for non-suite phases. */
  reportFile?: string;
}

interface DriverReport {
  mode?: string;
  ok?: boolean;
  failures?: string[];
  details?: Record<string, unknown>;
}

function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** `code.cmd` on PATH -> the `Code.exe` next to it. */
function resolveCodeExecutable(): string | undefined {
  const fromEnvironment = process.env['VSCODE_EXECUTABLE_PATH'];
  if (fromEnvironment && fs.existsSync(fromEnvironment)) {
    return fromEnvironment;
  }
  const executableName = process.platform === 'win32' ? 'Code.exe' : 'Code';
  const shimNames = process.platform === 'win32' ? ['code.cmd', 'code.exe'] : ['code'];
  for (const directory of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (!directory) {
      continue;
    }
    for (const shim of shimNames) {
      if (!fs.existsSync(path.join(directory, shim))) {
        continue;
      }
      const candidate = path.join(path.resolve(directory, '..'), executableName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * Writes two extensions into the isolated profile:
 * - a theme extension with a `__metadata.installedTimestamp` (January 2026),
 * - a plain extension without one, so its date has to be estimated from the
 *   folder that was created moments ago.
 */
function createFakeExtensions(profile: Profile): string[] {
  // `engines.vscode: "*"` is rejected by current VS Code builds ("not specific
  // enough") and the extension then never loads, so use a real range.
  const apricotDir = path.join(profile.extensionsDir, `${APRICOT_ID}-2.1.0`);
  writeJsonFile(path.join(apricotDir, 'package.json'), {
    name: 'apricot-glow-theme',
    displayName: 'Apricot Glow Theme',
    description: 'Fake theme used by the Extension Sorter integration tests.',
    publisher: 'contoso',
    version: '2.1.0',
    engines: { vscode: '^1.80.0' },
    categories: ['Themes'],
    icon: 'icon.png',
    contributes: {
      themes: [
        { label: 'Apricot Glow', uiTheme: 'vs-dark', path: './themes/apricot-glow.json' },
        { label: 'Apricot Glow Light', uiTheme: 'vs', path: './themes/apricot-glow-light.json' },
      ],
    },
    __metadata: { installedTimestamp: APRICOT_INSTALLED_AT, source: 'gallery', targetPlatform: 'undefined' },
  });
  writeJsonFile(path.join(apricotDir, 'themes', 'apricot-glow.json'), {
    name: 'Apricot Glow',
    type: 'dark',
    colors: { 'editor.background': '#1b1410', 'editor.foreground': '#f3e7dd' },
  });
  writeJsonFile(path.join(apricotDir, 'themes', 'apricot-glow-light.json'), {
    name: 'Apricot Glow Light',
    type: 'light',
    colors: { 'editor.background': '#fff7f0', 'editor.foreground': '#33261c' },
  });
  const projectIcon = path.join(projectRoot, 'resources', 'icon.png');
  if (fs.existsSync(projectIcon)) {
    fs.copyFileSync(projectIcon, path.join(apricotDir, 'icon.png'));
  } else {
    throw new Error(`Missing ${projectIcon}; run "python3 scripts/generate-icon.py" first.`);
  }

  const blueHourDir = path.join(profile.extensionsDir, `${BLUE_HOUR_ID}-0.3.0`);
  writeJsonFile(path.join(blueHourDir, 'package.json'), {
    name: 'blue-hour-tool',
    displayName: 'Blue Hour Tool',
    description: 'Fake extension without a recorded install timestamp.',
    publisher: 'fabrikam',
    version: '0.3.0',
    engines: { vscode: '^1.80.0' },
    contributes: { commands: [{ command: 'blueHour.hello', title: 'Blue Hour: Hello' }] },
    // No __metadata on purpose: the date has to come from the file system.
  });

  return [APRICOT_ID, BLUE_HOUR_ID];
}

/**
 * Generates the helper extension that drives the `write` and `read` phases in a
 * real editor.
 *
 * It needs the `<publisher>.<name>-<version>` folder name, a concrete
 * `engines.vscode` range and a real activation event, otherwise the editor
 * silently skips it. The logic itself stays in `out/test/integration/stateDriver.js`
 * and is pulled in through an absolute `require`; during the `suite` phase that
 * module returns immediately, so the helper cannot interfere with the mocha run.
 */
function createStateDriver(profile: Profile): void {
  const driverModule = path.join(integrationDir, 'stateDriver.js');
  if (!fs.existsSync(driverModule)) {
    throw new Error(`Missing ${driverModule}; run "npm run compile" first.`);
  }
  const driverDir = path.join(profile.extensionsDir, `${DRIVER_EXTENSION_ID}-${DRIVER_EXTENSION_VERSION}`);
  writeJsonFile(path.join(driverDir, 'package.json'), {
    name: 'state-driver',
    displayName: 'Extension Sorter State Driver',
    description: 'Throw-away extension used by src/test/runIntegration.ts to verify that the state survives a restart.',
    publisher: 'extension-sorter-test',
    version: DRIVER_EXTENSION_VERSION,
    engines: { vscode: '^1.80.0' },
    main: './extension.js',
    activationEvents: ['onStartupFinished'],
  });
  fs.writeFileSync(
    path.join(driverDir, 'extension.js'),
    [
      "'use strict';",
      '// The logic lives in the compiled test code of the project under test.',
      `const driver = require(${JSON.stringify(driverModule)});`,
      'exports.activate = () => driver.run();',
      '',
    ].join('\n'),
    'utf8',
  );
}

function createProfile(): Profile {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-sorter-it-'));
  const profile: Profile = {
    root,
    userDataDir: path.join(root, 'user-data'),
    extensionsDir: path.join(root, 'extensions'),
  };
  fs.mkdirSync(profile.userDataDir, { recursive: true });
  fs.mkdirSync(profile.extensionsDir, { recursive: true });
  return profile;
}

function launchVsCode(
  executable: string,
  profile: Profile,
  extensionIds: readonly string[],
  testsModule: string,
  run: PhaseRun,
): Promise<number> {
  const args = [
    `--extensionDevelopmentPath=${projectRoot}`,
    ...(run.reportFile ? [] : [`--extensionTestsPath=${testsModule}`]),
    `--user-data-dir=${profile.userDataDir}`,
    `--extensions-dir=${profile.extensionsDir}`,
    '--locale=en',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-updates',
    '--disable-telemetry',
    '--disable-workspace-trust',
    '--new-window',
  ];
  console.log(`\n=== VS Code integration tests, phase "${run.phase}" ===`);
  console.log(`${executable} ${args.join(' ')}\n`);

  return new Promise<number>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        EXTENSION_SORTER_TEST_PHASE: run.phase,
        EXTENSION_SORTER_TEST_STARTED_AT: String(run.startedAt),
        EXTENSION_SORTER_TEST_EXT_IDS: extensionIds.join(','),
        EXTENSION_SORTER_TEST_USER_DATA_DIR: profile.userDataDir,
        EXTENSION_SORTER_TEST_EXTENSIONS_DIR: profile.extensionsDir,
        ...(run.reportFile ? { EXTENSION_SORTER_TEST_DRIVER_RESULT: run.reportFile } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, LAUNCH_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`VS Code did not finish the "${run.phase}" phase within ${LAUNCH_TIMEOUT_MS / 1000}s.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

/**
 * Turns the JSON report of the driver extension into a pass/fail. A real editor
 * launch exits with code 0 no matter what an extension did, so the report is the
 * only source of truth - and a *missing* report means the driver never ran.
 */
function verifyDriverReport(run: PhaseRun): void {
  if (!run.reportFile) {
    return;
  }
  if (!fs.existsSync(run.reportFile)) {
    throw new Error(
      `the "${run.phase}" phase did not report anything (${run.reportFile} is missing).\n` +
        `The generated helper extension "${DRIVER_EXTENSION_ID}" was placed in the extensions folder of the profile; ` +
        'if it never activated, check the renderer log of that profile for a scan error (folder name, engines.vscode, activationEvents).',
    );
  }
  const report: DriverReport = JSON.parse(fs.readFileSync(run.reportFile, 'utf8'));
  console.log(`[phase ${run.phase}] ${report.ok ? 'ok' : 'failed'} ${JSON.stringify(report.details ?? {})}`);
  if (!report.ok) {
    const failures = report.failures ?? [];
    throw new Error(`the "${run.phase}" phase reported ${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
  }
}

function readPhases(): readonly Phase[] {
  const requested = (process.env['EXTENSION_SORTER_TEST_PHASES'] ?? ALL_PHASES.join(','))
    .split(',')
    .map((value) => value.trim() as Phase)
    .filter((value): value is Phase => ALL_PHASES.includes(value));
  return requested.length > 0 ? requested : ALL_PHASES;
}

async function main(): Promise<void> {
  if (!fs.existsSync(extensionTestsPath)) {
    throw new Error(`Missing ${extensionTestsPath}; run "npm run compile" first.`);
  }
  const executable = resolveCodeExecutable();
  if (!executable) {
    console.error(
      'No VS Code installation found. Add the "bin" folder of VS Code to PATH or set VSCODE_EXECUTABLE_PATH to Code.exe.',
    );
    process.exitCode = 2;
    return;
  }
  console.log(`Using the installed VS Code: ${executable}`);

  const phases = readPhases();
  const profile = createProfile();
  const extensionIds = createFakeExtensions(profile);
  createStateDriver(profile);
  console.log(`Isolated profile: ${profile.root}`);
  console.log(`Phases to run: ${phases.join(', ')}`);

  try {
    for (const phase of phases) {
      const run: PhaseRun = {
        phase,
        startedAt: Date.now(),
        ...(phase === 'suite' ? {} : { reportFile: path.join(profile.root, `state-${phase}.json`) }),
      };
      const exitCode = await launchVsCode(executable, profile, extensionIds, extensionTestsPath, run);
      if (exitCode !== 0) {
        console.error(`\nIntegration tests failed in the "${phase}" phase (exit code ${exitCode}).`);
        process.exitCode = exitCode || 1;
        console.error(`The isolated profile was kept for inspection: ${profile.root}`);
        return;
      }
      verifyDriverReport(run);
    }
    console.log(`\nAll integration phases passed (${phases.join(', ')}).`);
    fs.rmSync(profile.root, { recursive: true, force: true });
  } catch (error) {
    process.exitCode = 1;
    console.error(`Integration test run failed: ${String(error)}`);
    console.error(`The isolated profile was kept for inspection: ${profile.root}`);
  }
}

void main();
