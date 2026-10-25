# Combined Era beginner game

Default new games use an independent local engine (`game/combined.py`) and the existing vintage interface, portraits, palette, industry artwork, full 80-city board and all 137 routes. No city coordinates or original art files changed. Both eras' tile levels remain in the supply, used in level order, without era restrictions or resets.

## Rules

- Eight rounds, one human action and up to one casual action per rival per round.
- Start with £30 cash and £5 income. Build increases income by £2. Everyone receives income after each round, including round eight.
- Build in any matching empty city slot, paying only the tile's printed cash cost. No resource, card, network or era requirement for building.
- Builds score printed tile VP immediately. Industries are active immediately; there is no Sell or Develop step.
- Connect from a home-region city, owned industry or owned route. Every original land/shipping route costs £5 and scores 3 VP. A route may be built only once.
- Pass to save money for free. No discards, loans or scouting. The six industry cards are reusable visual guides.
- The final ledger totals building and route VP; no additional settlement is applied. Ties use income, then cash, then the original player order for exact ties.
- Beginner rivals choose casual legal moves without lookahead and sometimes pass. Difficulty controls apply to Classic/Eco; Combined always uses beginner opponents.

## Architecture and compatibility

The inspected upstream Classic server is external (`brass.iboardgame.app`); its authoritative rules and neural AI source are not present in this repository. Renaming its era labels cannot change those rules. Combined uses its own authoritative engine and English messages behind the existing Python API. Classic proxy dispatch and Eco rules remain available.

Combined saves have a distinct `atlas-combined-v1` engine tag and browser key `bw_combined_save`. The existing Classic/Eco browser save key is retained. Older saves resume in their original mode; they are not silently converted. Local engine saves retain the existing server signature mechanism and need the same server database/signing key to import. The server database is ignored by Git. The same API serializes concurrent moves and rejects stale versions and altered signed saves.

Run `python3 serve.py` and open http://localhost:3000. The Python backend is required; copying `docs/` to a static-only host does not supply the game API. No hosting, deployment or merging is part of this change.

## Verification

- `python3 -m py_compile serve.py game/combined.py`
- `python3 -m unittest discover -s tests -p test_combined.py`: four scenario tests cover full game, fixed route costs/all routes, tile persistence, exact income/VP, finality, invalid/stale actions and save round-trip.
- `python3 tests/combined-api.py`: against a disposable local server on port 3012 (or set TEST_URL); covers real HTTP gameplay through eight rounds, settings, save verification, tamper rejection and English payloads.
- `node --check dist/js/app.js` and six localization regression tests pass (`node --test tests/localization.test.mjs`). `docs/` and `dist/` interface copies are synchronized, including a pre-existing map-module mismatch.
- In-app browser: built, connected, passed, finished all eight rounds, checked final totals, help, industry board, journal, reload persistence and visible English/title text. Checked 390px phone, 768px tablet and 1440px desktop layout; phone final table fits.
- `tests/combined-browser.cjs` is a repeatable optional Playwright check; direct Chrome launch was blocked by the local sandbox, so the completed UI check used the in-app browser instead.
- Existing Eco suite: 31 total Python tests including the four new scenarios; 26 pass, five fail because old Eco tests still expect 80 cities or removed world cities while the unchanged Eco engine restricts its map to 20. Those Eco tests/engine are outside this rules change.

During UI testing found the missing Music button startup crash; concurrent main update 17cf76e fixed it and is merged into this branch. Kept that button and fixed mobile map toolbar stretching. Beginner-specific descriptions replace resource/era constraints, and passing no longer asks for a discard. No text mutation observer is used; backend Combined messages are English at source.
