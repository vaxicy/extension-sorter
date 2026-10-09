import { INSTALL_DATE_SOURCE_DETAILS, INSTALL_DATE_SOURCE_LABELS, InstallDateSource } from './extensionInfo';

/**
 * Date rendering for the tree view.
 *
 * The product language is English, so dates are formatted with `en-US` on
 * purpose: the output is identical for every user and can be unit tested.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** `Oct 9, 2026`, or `Unknown` when there is no usable date. */
export function formatInstallDate(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    return 'Unknown';
  }
  return DATE_FORMAT.format(new Date(ms));
}

/** `Oct 9, 2026, 3:04 PM` - used in tooltips where seconds do not matter. */
export function formatInstallDateTime(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    return 'Unknown';
  }
  return DATE_TIME_FORMAT.format(new Date(ms));
}

/** Short label shown after the date: `Estimated`, `First seen`, `Installed`, ... */
export function getInstallDateSourceLabel(source: InstallDateSource): string {
  return INSTALL_DATE_SOURCE_LABELS[source];
}

/** Long explanation used in tooltips. */
export function getInstallDateSourceDetail(source: InstallDateSource): string {
  return INSTALL_DATE_SOURCE_DETAILS[source];
}

/** `3 days ago`, `2 hours ago`, `just now` - relative age used in tooltips. */
export function formatAge(ms: number | undefined, now: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    return '';
  }
  const delta = Math.max(0, now - ms);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) {
    return 'just now';
  }
  if (delta < hour) {
    const minutes = Math.round(delta / minute);
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  if (delta < day) {
    const hours = Math.round(delta / hour);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.round(delta / day);
  if (days < 31) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  const months = Math.round(days / 30.44);
  if (months < 24) {
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.round(days / 365.25);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}
