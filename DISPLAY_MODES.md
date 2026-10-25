# Beginner and Classic display modes

Select an interface mode when creating a game or in Settings during play. The local preference `bw_prefs.displayMode` defaults to Classic. Saves, exported games, API bodies, difficulty, rules, AI, scoring and economy are unchanged. The full map stays accessible.

Beginner shows evaluated legal recommendations, the existing Strategy Advisor's explanations, a collapsible reference, and the latest resolved move summary (including opponent moves and changes to player totals). Show All Options opens the existing categorized interface. A new move collapses the list again. Map filtering opens the normal filtered list. Classic keeps the existing interface.

## Recommendation contract

The live `/api/new` response was inspected with hints enabled. It has 56 legal actions and exactly one `best` flag, with no rank, score or evaluation fields. The existing Strategy Advisor reads that same flag and explains it with `explainMove`. The engine and value network are remote and are not included in this repository.

Only flagged recommendations are shown, up to three if supplied by the service. Currently that means one genuinely evaluated recommendation. Arbitrary legal moves are no longer added to fill three slots. With hints disabled or no recommendation, the UI explains the limitation and offers Show All Options. No fabricated scores, inferred ranks, alternative evaluator or changes to AI settings are introduced. A true three-place ranking requires an upstream API addition.

## Deployment inspection

GitHub's public repository metadata reports `has_pages: false` and `homepage: null`. The deployments endpoint returns an empty list. The standard `https://usercmis.github.io/Brassworld/` URL returns 404. No deployment workflows or CNAME file exist in main. The local server explicitly serves `dist`.

There is no evidence that `docs` is currently used for deployment, so it is left unchanged. It predates the current Strategy Advisor and accessibility features; replacing it wholesale would introduce unrelated changes. Custom hosting outside GitHub cannot be determined from public repository metadata.

## Validation completed

On October 24, 2026 (America/New_York), tested against the live game service in the Codex in-app browser:

- Started a Beginner game with Novice AI and Suggested moves enabled. Finished AI opening playback.
- Verified the updated shortlist contains only the actual Advisor choice and a visible ranking limitation. Expanded all options and selected a legal build.
- Built Coal mine I in Cardiff for $5. Cash changed from $17 to $12, owned tiles from zero to one, and the normal new-round card refill completed. The persistent move summary reported the build, discarded card, cash and tile changes.
- Switched Beginner to Classic and back using Settings. All displayed player totals and hand contents remained identical.
- Exported saves before and after switching. Files were byte-identical, SHA-256 `56a6baf95ab637f30d86d5ef18d96a40986b6e1fb58303bf600c61ff9f688b7e`. This covers complete serialized game state, money, cards, scoring and RNG data.
- Started a second game directly in Classic. The full categorized action interface appeared and Beginner reference was hidden. Switched that game to Beginner successfully.
- Restarted the local server to remove its session and reloaded the browser. Automatic `/api/load` recovery retained Round 2, $12, 0 VP, one coal mine and the eight-card hand. Beginner preference persisted. World view remained usable.

The system Python initially lacked trusted CA roots. Validation used the installed certifi CA bundle via SSL_CERT_FILE; certificate verification was retained. The repository server and game transport were not changed.

Automated: `node --test tests/display-modes.test.mjs` covers legal action identity, state/save immutability, missing evaluations, summaries, both render paths and expansion. `node --check dist/js/app.js` and `git diff --check` pass. The small Playwright DOM harness in `tests/modes-browser.cjs` is supplemental and does not replace the live browser checks above. Standalone Playwright could not launch in this environment; live browser validation used the available in-app browser instead.
