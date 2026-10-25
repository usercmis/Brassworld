# Beginner and Classic display modes

The supported local application (`python3 serve.py`) serves `dist`. Select an interface mode when creating a game or in Settings during play. The preference is stored in `bw_prefs.displayMode` and defaults to Classic. Saves, exported games, API bodies, difficulty, rules, AI, scoring and economy are unchanged. The full map stays accessible.

Beginner shows up to three legal actions across categories, explanations using the existing Strategy Advisor's explainMove function, a collapsible reference, and a persistent summary of the latest resolved move sequence (including opponent moves and changes to player totals). Show All Options opens the existing categorized interface. A new move collapses the list again. Map filtering opens the normal filtered list. Classic keeps the existing interface.

## Recommendation limitation

The current API exposes `action.best`, not a ranked list. The Advisor choice is shown first; remaining entries retain server order and are explicitly labeled alternatives. When hints are off and no best flag is available, all entries are legal alternatives. Three Advisor-ranked recommendations require an upstream ranking API. No substitute scoring model is introduced.

## Deployment limitation

The older `docs` tree is unchanged; it does not contain the current Strategy Advisor. These changes target the current application in `dist`. GitHub Pages deployments using `/docs` need a separate decision about synchronizing the existing divergent frontends.

## Validation

- `node --test tests/display-modes.test.mjs`: three tests cover shortlist identity, input/save immutability, short/empty lists, move summaries, both render paths, expansion and switching.
- `node --check dist/js/app.js`: syntax validation.
- `node tests/modes-browser.cjs`: browser interaction test; requires Playwright and its Chromium browser (or BROWSER_CHANNEL=chrome). Browser launch was blocked in the implementation environment, so browser and live-service end-to-end validation remain outstanding.
