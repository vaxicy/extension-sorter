import * as assert from 'assert';
import { RichListModel } from '../../models/richList';
import { renderRichListHtml } from '../../providers/richListHtml';

const NONCE = 'testNonce1234567890';

function modelWith(row: Partial<RichListModel['groups'][number]['rows'][number]> & { id: string; name: string }): RichListModel {
  return {
    groups: [
      {
        key: '2026-10',
        label: 'October 2026',
        count: 1,
        rows: [
          {
            subtitle: '',
            dateText: 'Oct 9, 2026',
            dateSourceLabel: 'Estimated',
            dateIsExact: false,
            tooltip: '',
            isTheme: true,
            isBuiltin: false,
            ...row,
          },
        ],
      },
    ],
    total: 1,
    shown: 1,
    query: '',
    sortLabel: 'Newest first',
    filterLabel: '',
    isFiltered: false,
    groupBy: 'month',
  };
}

function render(model: RichListModel): string {
  return renderRichListHtml({ cspSource: 'https://file+.vscode-resource.vscode-cdn.net', nonce: NONCE, initialModel: model });
}

describe('richListHtml', () => {
  it('locks the webview down with the nonce it was given', () => {
    const html = render(modelWith({ id: 'acme.alpha', name: 'Alpha' }));
    assert.ok(
      html.includes(
        "default-src 'none'; img-src https://file+.vscode-resource.vscode-cdn.net data:; " +
          `style-src 'nonce-${NONCE}'; script-src 'nonce-${NONCE}';`,
      ),
      'CSP must follow the cspSource of the webview and only allow nonced code',
    );
    assert.ok(html.includes(`<style nonce="${NONCE}">`));
    assert.ok(html.includes(`<script nonce="${NONCE}">`));
    assert.ok(!html.includes("'unsafe-inline'"), 'no unsafe-inline anywhere');
  });

  it('renders the skeleton the script drives', () => {
    const html = render(modelWith({ id: 'acme.alpha', name: 'Alpha' }));
    for (const id of ['toolbar', 'search', 'summary', 'count', 'detail', 'reset', 'list']) {
      assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
    }
    assert.ok(html.includes('acquireVsCodeApi()'));
    assert.ok(html.includes("send('ready')"));
  });

  it('never lets extension manifest content become markup', () => {
    const html = render(
      modelWith({
        id: 'acme.evil',
        name: '</script><img src=x onerror=alert(1)>',
        subtitle: '<b>not bold</b>',
        tooltip: '</script>',
      }),
    );
    assert.ok(!html.includes('</script><img'), 'the closing script tag must not survive');
    assert.ok(!html.includes('<b>not bold</b>'), 'the subtitle must not be markup');
    assert.ok(html.includes('\\u003c/script>'), 'markup is escaped as unicode escapes in the model');
  });

  it('ships the initial model, so the first paint needs no round trip', () => {
    const html = render(modelWith({ id: 'acme.alpha', name: 'Alpha' }));
    assert.ok(html.includes('"name":"Alpha"'));
    assert.ok(html.includes('"label":"October 2026"'));
    assert.ok(html.includes('let model = {'));
  });
});
