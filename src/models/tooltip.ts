import { SorterExtension } from './extensionInfo';
import {
  formatAge,
  formatInstallDate,
  formatInstallDateTime,
  getInstallDateSourceDetail,
  getInstallDateSourceLabel,
} from './dateFormat';

/**
 * Builds the hover tooltip of a row. Pure markdown so the wording is unit
 * tested and so no `vscode` import leaks into the models.
 */

export interface TooltipOptions {
  /** Current time, injected so unit tests are stable. */
  now: number;
  /** `true` when every date in the view comes from an estimate or an observation. */
  includePath?: boolean;
}

/** Escapes the few markdown characters that would break a code span. */
function codeSpan(value: string): string {
  return `\`${value.replace(/`/g, '\\`')}\``;
}

export function buildTooltipLines(extension: SorterExtension, options: TooltipOptions): string[] {
  const lines: string[] = [];
  lines.push(`**${extension.name}**`);
  lines.push(codeSpan(extension.id));

  const details: string[] = [];
  details.push(`Publisher: ${extension.publisher}`);
  if (extension.version) {
    details.push(`Version: ${extension.version}`);
  }
  const sourceLabel = getInstallDateSourceLabel(extension.installDateSource);
  const age = formatAge(extension.installDateMs, options.now);
  const dateText =
    typeof extension.installDateMs === 'number'
      ? `${formatInstallDateTime(extension.installDateMs)} - ${sourceLabel}${age ? ` (${age})` : ''}`
      : `${formatInstallDate(undefined)} - ${sourceLabel}`;
  details.push(`Date: ${dateText}`);
  details.push(`Date source: ${getInstallDateSourceDetail(extension.installDateSource)}`);
  if (extension.isTheme) {
    details.push(
      extension.themeCount > 0
        ? `Theme extension: Yes (${extension.themeCount} color theme${extension.themeCount === 1 ? '' : 's'})`
        : 'Theme extension: Yes (icon or product icon theme)',
    );
  } else {
    details.push('Theme extension: No');
  }
  if (extension.isBuiltin) {
    details.push('Built-in extension: Yes');
  }
  for (const line of details) {
    lines.push(line);
  }

  if (options.includePath !== false && extension.extensionPath) {
    lines.push(`Path: ${codeSpan(extension.extensionPath)}`);
  }
  // The label shown in the row is repeated here so a hover never means "the
  // date is a fact" when it is not.
  if (typeof extension.installDateMs !== 'number') {
    lines.push('_No install date could be determined for this extension._');
  } else if (extension.installDateSource === 'file-birthtime' || extension.installDateSource === 'file-ctime') {
    lines.push('_Estimated date - VS Code does not expose the exact install time._');
  } else if (extension.installDateSource === 'first-seen') {
    lines.push('_Observed date - this is not the install time._');
  }
  return lines;
}
