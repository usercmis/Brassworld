# English localization

All work is on `complete-english-translation`. The branch incorporates the accessibility and larger-text changes from `origin/main` at `a9a72ca`; main is not modified by this work.

## Why the old English layer missed text

The uploaded markdown contains the same approach as the original `dist/theme/english.js`: a dictionary expanded into a global substring matcher, including one-character entries. Unknown server sentences are only partly replaced, and Chinese word order remains. DOM text nodes split sentences around markup, so a text-node observer cannot reliably translate the original sentence. The observer runs after rendering and covers only some attributes. Name discovery depends on a late fetch wrapper and has incomplete coverage. Saves and remote logs still contain the original text and must be localized when displayed.

The uploaded markdown also contains escaped JavaScript (`&#x20;`, `window\.fetch`, escaped comment delimiters and regex operators). Those are document-export artifacts; copying them literally into a JavaScript file would introduce syntax errors. The repository files, rather than the escaped document, were used as executable source.

## Implementation

- `dist/index.html`: English controls, accessible names and labels at source.
- `dist/js/app.js`: English templates for status, tooltips, cards/discards, actions, notifications, rules, tutorials, settings, summaries and scoring. Only display expressions are localized. The city navigator also translates region labels. Transport errors are checked in the API caller, avoiding a fetch-patching startup race.
- `dist/js/art.js`: English industry bonuses, portrait descriptions and color labels.
- `dist/js/map.js`: English geography and closed-port tooltips, plus nameplate sizing for English labels. Map geometry and identifiers are unchanged.
- `dist/theme/locale.js`: exact vocabulary, player display names, complete-message templates for legacy logs and server explanations, and a typed-event formatter. New action replay notifications are generated from `kind`, city IDs, industry IDs, levels, costs and discarded-card fields. They do not depend on finding words in a Chinese sentence. Original objects are never rewritten.
- `dist/theme/tutorial.js`: complete English rules, variant explanation and tour copy.
- `dist/theme/english.js`: compatibility export and last-resort transport error banner; no DOM-wide substring replacement or response mutation.
- `dist/theme/atlas.css`: readable Discard badge, wrapping controls/cards and industry labels, contrasting notifications, and mobile sizing. Existing accessibility modes are retained.
- Matching files under `docs/` are synchronized and tested for equality with `dist/`.
- `tests/`, `package.json`: automated translation, immutability, deployed-copy, browser smoke and full-game checks. The repository originally had no automated test command.

`upstream/` remains the original reference snapshot. `serve.py` and its forwarding behavior are unchanged. Raw player names, `eraZh`, log text and save contents remain in their original form inside game data; rendering translates them. API endpoints, serialized identifiers, legal-action indices, discard indices, rules and AI remain unchanged.

Unknown future server messages are kept intact and reported to the browser console as `Untranslated game message:`. The system never silently drops a message or replaces isolated words inside an unrecognized sentence. The checked fixtures and tested games contain no such messages.

## Backend investigation

`serve.py` forwards JSON requests to `https://brass.iboardgame.app`. `GET /api/board` reads the local board snapshot. The forwarded routes are `/api/state`, `/api/new`, `/api/action`, `/api/pass`, `/api/load`, and `/api/settings`. Responses contain state, legal actions, typed replay events and text-only historical log records. Requests use the original session cookies and payloads.

The rules/AI engine is not included in this repository. Its provenance and README already identify it as a remote dependency. The public upstream HTML links to its frontend and SDK but has no backend source link. Public GitHub repository searches for `brassworld` and `iboardgame` did not locate this engine: the other matching Brassworld repository is an unrelated handicrafts website. This establishes that no accessible backend source was found, not that no private or unindexed source exists. Accordingly, backend-generated text is localized at the frontend display boundary, as authorized.

Sources inspected:

- https://github.com/usercmis/Brassworld
- https://api.github.com/search/repositories?q=brassworld
- https://api.github.com/search/repositories?q=iboardgame
- https://brass.iboardgame.app/
- https://api.github.com/repos/kumarswamynaidu97/brassworld/git/trees/HEAD?recursive=1

## Verification

- All JavaScript files under `dist/` and `docs/`: syntax checks passed. Python server source: parsing passed.
- `node --test tests/localization.test.mjs`: complete-message translation fixtures, representative semantic assertions, immutable saves/events, internal-identifier preservation and deployed-copy equality.
- Browser smoke: new game, hand tooltip, selected Discard badge, confirmed legal action and unchanged outgoing action/discard indices, AI response, journal, industry modal, settings, saved-game restore, saved-game summary, full rules, seven tour stops, desktop/mobile layouts, and no Chinese text or attributes.
- A complete live browser game ran through 49 player pass actions, AI turns, both eras and final scoring. A DOM observer checked transient visible text throughout; there were zero visible Chinese strings, zero untranslated-message warnings and zero browser errors. The player passed to allow all AI turns to run; a separate smoke test executed a legal build.
- Across two disposable games, 990 distinct Chinese backend strings were collected as regression fixtures. Fixtures contain display text only, not session credentials or saves.
- The local Python installation initially required its existing system certificate store (`SSL_CERT_FILE=/etc/ssl/cert.pem`). Certificate validation remained enabled. A later upstream DNS failure interrupted a repeat run; checks are run individually to reduce dependence on concurrent remote requests.

To reproduce locally:

```sh
npm install
python3 serve.py
npm test
npm run check:syntax
npm run test:browser
npm run test:full-game
```

Browser checks require Chrome (default) and the original remote game service. `TEST_URL` can select a different local server; `BROWSER_CHANNEL` selects an installed Playwright browser channel. Tests create disposable game sessions and do not touch personal saves.
