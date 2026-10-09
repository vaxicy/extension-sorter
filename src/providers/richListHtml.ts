import { RichListModel } from '../models/richList';

/**
 * Markup of the rich list view.
 *
 * The skeleton (search box, summary line, list container) is static HTML; the
 * rows are rendered by the webview script from the model it receives through
 * `postMessage`. That way typing in the search box never rebuilds the input -
 * only the list below it - and re-rendering a few hundred rows stays cheap.
 *
 * Everything that comes from an extension manifest (name, publisher,
 * description) is inserted through `textContent` or escaped, never as raw HTML.
 */

export interface RichListHtmlOptions {
  cspSource: string;
  nonce: string;
  initialModel: RichListModel;
}

/** Chrome-free serialization of the initial model for the `<script>` block. */
function serialize(model: RichListModel): string {
  return JSON.stringify(model).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

export function renderRichListHtml(options: RichListHtmlOptions): string {
  const { cspSource, nonce, initialModel } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>Installed by Date</title>
<style nonce="${nonce}">
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; padding: 0; }
  body {
    display: flex;
    flex-direction: column;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: transparent;
  }
  #toolbar { padding: 6px 8px 0; }
  #search {
    width: 100%;
    padding: 4px 6px;
    font-family: inherit;
    font-size: inherit;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
  }
  #search:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  #search::placeholder { color: var(--vscode-input-placeholderForeground); }
  #summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 10px 4px;
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
  }
  /* The summary has to survive a narrow sidebar: the counters stay one line
     and the wordier "themes only · Newest first" part gives way first. */
  #count { flex: 0 0 auto; white-space: nowrap; }
  #detail { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #summary .spacer { flex: 1 1 auto; }
  #reset {
    flex: 0 0 auto;
    padding: 0;
    font: inherit;
    font-size: inherit;
    white-space: nowrap;
    color: var(--vscode-textLink-foreground);
    background: none;
    border: none;
    cursor: pointer;
  }
  #reset:hover { text-decoration: underline; }
  #list { flex: 1 1 auto; overflow-y: auto; padding: 0 4px 12px; outline: none; }
  .group {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px 2px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-sideBar-background);
    font-size: 0.82em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    outline-offset: -1px;
  }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
  .row[aria-selected="true"] {
    color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
    background: var(--vscode-list-activeSelectionBackground);
  }
  .icon { flex: 0 0 32px; width: 32px; height: 32px; border-radius: 4px; object-fit: contain; }
  .icon.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-icon-foreground);
    background: var(--vscode-toolbar-hoverBackground);
  }
  .text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vscode-descriptionForeground);
    font-size: 0.88em;
  }
  .row[aria-selected="true"] .subtitle { color: inherit; opacity: 0.85; }
  .meta { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .date {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    font-variant-numeric: tabular-nums;
  }
  .row[aria-selected="true"] .date { color: inherit; opacity: 0.85; }
  .chip { padding: 0 4px; border: 1px solid currentColor; border-radius: 3px; font-size: 0.85em; opacity: 0.85; }
  /* Icon sized on purpose: text buttons would reserve ~170px in *every* row
     and leave a truncated name behind, because the actions only show on hover
     but still take part in the layout. */
  .actions { display: flex; gap: 4px; opacity: 0; }
  .row:hover .actions, .row:focus .actions, .row:focus-within .actions { opacity: 1; }
  .actions button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    line-height: 0;
    color: var(--vscode-icon-foreground);
    background: none;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }
  .actions button svg { display: block; }
  .actions button:hover { color: var(--vscode-foreground); }
  .actions button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .row[aria-selected="true"] .actions button { color: inherit; }
  .empty { padding: 16px 12px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
</style>
</head>
<body>
  <div id="toolbar">
    <input id="search" type="search" placeholder="Search installed extensions" aria-label="Search installed extensions" spellcheck="false">
  </div>
  <div id="summary">
    <span id="count"></span>
    <span id="detail"></span>
    <span class="spacer"></span>
    <button id="reset" type="button" hidden aria-label="Reset filters and search" title="Reset filters and search">Reset</button>
  </div>
  <div id="list" role="listbox" aria-label="Installed extensions" tabindex="0"></div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const listEl = document.getElementById('list');
  const searchEl = document.getElementById('search');
  const countEl = document.getElementById('count');
  const detailEl = document.getElementById('detail');
  const resetEl = document.getElementById('reset');

  let model = ${serialize(initialModel)};

  const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (value) => String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (ch) => ESCAPE[ch]);

  const PLACEHOLDER = '<span class="icon placeholder" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" width="19" height="19"><rect x="4.5" y="4.5" width="15" height="15" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>' +
    '</span>';

  // Drawn by hand so the row actions stay icon sized (see .actions in the CSS).
  const COPY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">' +
    '<path d="M9.4 2.6H3.6A1 1 0 0 0 2.6 3.6v6.8"/>' +
    '<rect x="5.4" y="4.4" width="8" height="9" rx="1.4"/>' +
    '</svg>';
  const MARKETPLACE_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9.6 2.4h4v4"/>' +
    '<path d="M13.6 2.4 8 8"/>' +
    '<path d="M11.6 9.6v3.2a.8.8 0 0 1-.8.8H2.8a.8.8 0 0 1-.8-.8V4.8a.8.8 0 0 1 .8-.8h3.2"/>' +
    '</svg>';

  function rowHtml(row) {
    const icon = row.iconUri
      ? '<img class="icon" src="' + escapeHtml(row.iconUri) + '" alt="">'
      : PLACEHOLDER;
    const badge = row.dateIsExact ? '' : '<span class="chip">' + escapeHtml(row.dateSourceLabel) + '</span>';
    return '<div class="row" role="option" aria-selected="false" tabindex="-1" data-id="' + escapeHtml(row.id) + '" title="' + escapeHtml(row.tooltip) + '">' +
      icon +
      '<div class="text">' +
        '<div class="name">' + escapeHtml(row.name) + '</div>' +
        '<div class="subtitle">' + escapeHtml(row.subtitle) + '</div>' +
      '</div>' +
      '<div class="meta">' +
        '<div class="date">' + escapeHtml(row.dateText) + badge + '</div>' +
        '<div class="actions">' +
          '<button type="button" data-action="copy" title="Copy Extension ID" aria-label="Copy Extension ID">' + COPY_ICON + '</button>' +
          '<button type="button" data-action="marketplace" title="Open in Marketplace" aria-label="Open in Marketplace">' + MARKETPLACE_ICON + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    const total = model.total;
    countEl.textContent = model.isFiltered ? model.shown + ' of ' + total : total + ' extension' + (total === 1 ? '' : 's');
    detailEl.textContent = model.isFiltered ? '· ' + model.filterLabel + ' · ' + model.sortLabel : '· ' + model.sortLabel;
    resetEl.hidden = !model.isFiltered;
    if (searchEl.value !== model.query) {
      searchEl.value = model.query;
    }

    if (model.shown === 0) {
      listEl.innerHTML = '<div class="empty">' + escapeHtml(model.emptyMessage || 'No extensions to show.') + '</div>';
      return;
    }

    let html = '';
    for (const group of model.groups) {
      if (group.label) {
        html += '<div class="group" role="presentation"><span>' + escapeHtml(group.label) + '</span><span>' + group.count + '</span></div>';
      }
      for (const row of group.rows) {
        html += rowHtml(row);
      }
    }
    listEl.innerHTML = html;
  }

  function rows() {
    return Array.prototype.slice.call(listEl.querySelectorAll('.row'));
  }

  function select(row) {
    if (!row) {
      return;
    }
    for (const other of rows()) {
      other.setAttribute('aria-selected', other === row ? 'true' : 'false');
      other.tabIndex = other === row ? 0 : -1;
    }
    row.focus();
    row.scrollIntoView({ block: 'nearest' });
  }

  function selectedIndex() {
    return rows().indexOf(document.activeElement);
  }

  function send(action, id, value) {
    vscode.postMessage({ action: action, id: id, value: value });
  }

  listEl.addEventListener('click', (event) => {
    const target = event.target;
    const row = target.closest ? target.closest('.row') : null;
    if (!row) {
      return;
    }
    const button = target.closest('button[data-action]');
    send(button ? button.dataset.action : 'open', row.dataset.id, undefined);
  });

  listEl.addEventListener('keydown', (event) => {
    const all = rows();
    if (all.length === 0) {
      return;
    }
    const index = selectedIndex();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      select(all[Math.min(all.length - 1, index + 1)]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      select(all[Math.max(0, index - 1)]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      select(all[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      select(all[all.length - 1]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const active = document.activeElement;
      if (active && active.classList.contains('row')) {
        event.preventDefault();
        send('open', active.dataset.id, undefined);
      }
    }
  });

  let searchTimer;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => send('search', undefined, searchEl.value), 150);
  });
  searchEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      searchEl.value = '';
      send('search', undefined, '');
    }
  });
  resetEl.addEventListener('click', () => send('reset'));

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message) {
      return;
    }
    if (message.type === 'model') {
      model = message.model;
      render();
    } else if (message.type === 'focusSearch') {
      searchEl.focus();
    }
  });

  render();
  send('ready');
})();
</script>
</body>
</html>
`;
}
