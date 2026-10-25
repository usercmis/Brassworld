# EcoBrass — An Industrial Atlas

A separate, playable eight-round demo using the cream-colored Industrial Atlas map and interface. It runs locally without the original game service. No installation of Python packages or JavaScript dependencies is required.

## Launch

Requirements: Python 3.10 or newer and a modern desktop browser.

From the repository root:

```sh
python3 ecobrass.py
```

On Windows, use `python ecobrass.py`, or double-click `start_ecobrass_windows.bat`. On macOS/Linux use `start_ecobrass_mac_linux.sh` or the command above.

Open **http://127.0.0.1:4180**. Keep the terminal open. A first-game tutorial opens automatically; **How to play** always reopens it. For another port, run `python3 ecobrass.py --port 4182`.

The existing game is still available through its unchanged `python3 serve.py` launcher. Its Classic mode retains its original external-service requirement. Existing saves and EcoBrass saves are separate. EcoBrass games are stored in ignored `ecobrass.sqlite3`; browser exports are signed for the local server that created them.

## Quick start

1. Begin a game. You start with £30, 3 coal, 3 iron, £3 round income and a free starter factory in Manchester. Starter industries contribute their normal initial pollution.
2. Choose **Connect**, then a route touching Manchester. Conventional routes cost £5 + 1 coal; clean routes cost £8 with no coal. Both earn 2 victory points. Check the confirmation and confirm.
3. Choose **Sell** and sell the starter factory. Earn £10, 3 points and +£1 income. All three novice rivals take two actions, then round 2 begins.
4. Build more industries, improve unsold ones, expand your network and manage pollution over eight rounds.

## Simplified rules

- Four primary actions: **Build, Connect, Develop, Sell**. Each uses one action. Everyone takes two actions per turn, including round 1; fixed order: you, Campbell, Hawthorne, Kessler. **Pass** uses one action to wait for income.
- One combined era. No era transition, tile removals, deck depletion or card discards. Illustrated cards remain as reusable reference/preview cards.
- All 80 city positions, original matching industry slots and all 137 route geometries are retained. Start in your home region; extend your own routes to unlock other cities. Shared city slots and routes create competition. Occupied slots cannot be overwritten and routes have one owner.
- Six original illustrated industries remain, avoiding empty or incompatible original slots: coal mine, ironworks, brewery, factory, cotton mill and pottery. Factory/cotton/pottery use the same simple sales rules.

| Industry | Base cash | Coal | Iron | Build pollution | Production |
|---|---:|---:|---:|---:|---|
| Coal mine | £8 | 0 | 0 | 3 | 2 × level coal each round |
| Ironworks | £10 | 1 | 0 | 3 | 2 × level iron each round |
| Brewery | £10 | 0 | 1 | 1 | Adds £1 income when built |
| Factory | £12 | 1 | 1 | 2 | Goods for sale |
| Cotton mill | £10 | 1 | 0 | 2 | Goods for sale |
| Pottery | £12 | 0 | 1 | 2 | Goods for sale |

Your resource stock is used first. Shortages are automatically delivered for £2 per coal or iron, anywhere. The displayed action price includes delivery. Markets are fixed-price suppliers with unlimited replenishment in this demo; there is no regional price-merging puzzle.

**Connect:** conventional £5 + 1 coal, +1 pollution; clean £8, no coal, no pollution. Both award 2 points immediately. An endpoint must be in your home region or own network. Sea and land use the same simple cost; their original routes and art remain.

**Develop:** target one of your unsold industries. Level upgrade costs £5 + 1 iron, earns 2 points immediately, and increases level by one (maximum III). It emits 1 pollution unless the industry is eco. Eco retrofit costs £6 + 1 iron, removes up to 2 pollution from the city and your personal total, earns 3 points at final scoring, and eliminates coal use and emissions on that industry's sale. One eco retrofit per industry. Sold industries cannot be developed.

**Sell:** any unsold industry with one of your own routes at its city can sell once. Earn £(8 + 2 × level), 3 × level points immediately, and +£level income. Conventional sales consume 1 coal and emit 1 pollution; eco sales consume none and emit none. No port acceptance, beer selection or card matching. Selling flips a tile; its mine/iron production continues.

**Round end:** everyone receives their income, and coal mines/ironworks add 2 × level resources to their owner's stock. Production and income also occur after round 8, before the cash tie-break.

**Final score:** points already earned from sales, routes and development + 3 per eco retrofit − floor(personal pollution / 3). Highest score wins. Ties use income, then cash; exact ties share victory. Cash and leftover resources do not score separately. Environmental bonuses/penalties are applied exactly once.

## Appearance and isolation

The launcher serves the existing `dist/css/app.css`, `dist/theme/atlas.css`, `dist/js/art.js`, map JSON, fonts, portraits, textures and industry artwork directly, unchanged. The demo copies only the application controller, map renderer and HTML shell into `ecobrass/`. The renderer differs only in environmental captions; coordinates/path data are unchanged.

The cream/brown/olive palette, fonts, scoreboard location, portrait images, map controls, illustrated hand, action dock, confirmation controls, modal styling, panning/zooming, highlights and tile/route effects are preserved. Text and values change for the simplified rules. Small repairs address missing music/industry-panel hooks and the unused third dock grid track from the source snapshot; this is appearance preservation with functional labels and environmental additions, not a claim of pixel-identical screenshots.

`dist`, `docs`, `upstream`, `game/engine.py`, `Brassworld_Eco`, and `serve.py` are not modified. The original remains available. Nothing is merged or deployed.

## Validation

```sh
python3 -m unittest tests.test_hackathon tests.test_hackathon_http -v
```

Twelve tests cover original-map identities, action limits, resource delivery and production, upgrades/eco conversion, duplicate selling, stale requests, transaction rollback, all three AIs, 20 complete randomized eight-round games, final scoring/ties, HTTP full-game completion, session separation, signed-save restore/tamper rejection, and unchanged shared visual assets.

Desktop browser validation at 1440 × 1000: first-game tutorial; direct map city and route clicks; clean connection; construction; level and eco development; ordinary and eco selling; three AI opponents; all eight rounds and final ledger; reload; English UI scan; zero broken images and zero console errors in the tested flow. A matched desktop visual reference uses the unchanged Atlas client with frozen initial demo data. Only absent DOM hooks are supplied to make that reference snapshot render; it is a rendering comparison, not a recording of the original remote game's rules.

## New/changed files

- `ecobrass.py`: local HTTP launcher, isolated SQLite sessions and signed saves.
- `game/hackathon.py`: authoritative simplified engine and novice AI.
- `ecobrass/index.html`: Atlas shell, EcoBrass labels and restored music hook.
- `ecobrass/js/app.js`: Atlas controller adapted for simplified actions/tutorial/ledger.
- `ecobrass/js/map.js`: original renderer with corrected pollution captions.
- `ecobrass/ecobrass.css`: environmental values in existing style and empty-track repair.
- `tests/test_hackathon.py`, `tests/test_hackathon_http.py`: engine and HTTP checks.
- `start_ecobrass_mac_linux.sh`, `start_ecobrass_windows.bat`: launch shortcuts.
- `.gitignore`: ignores local EcoBrass sessions/key.
- This guide.

## Hackathon disclosure

AI assistance: OpenAI Codex was used for implementation, testing and documentation. This submission adapts the existing Industrial Atlas frontend and assets; it should not be described as all original code or artwork made from scratch. Keep PROVENANCE.json and original source notices. Event eligibility and reuse permission were not certified by this implementation.
