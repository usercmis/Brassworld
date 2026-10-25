"""Offline two-player hotseat scenario to exercise Eco rules, NOT full Brassworld.

Simplified base: fixed build prices, no route/resource/card-matching constraints,
one demo card discarded per action, direct income steps, fixed era length.
"""
from copy import deepcopy
from uuid import uuid4
from .eco_rules import EcoRules, RuleError

CITIES = {
    "riga": {"name": "Riga", "x": 78, "y": 14},
    "rotterdam": {"name": "Rotterdam", "x": 49, "y": 34},
    "london": {"name": "London", "x": 30, "y": 35},
    "marseille": {"name": "Marseille", "x": 57, "y": 70},
    "newyork": {"name": "New York", "x": 12, "y": 78},
    "stockholm": {"name": "Stockholm", "x": 68, "y": 10},
}
INDUSTRIES = {
    "COTTON": {"name": "Cotton mill", "cost": 12, "income": 5, "vp": 5, "beer": 1},
    "MFG": {"name": "Manufactured goods", "cost": 13, "income": 1, "vp": 5, "beer": 1},
    "LUX": {"name": "Pottery", "cost": 20, "income": 5, "vp": 10, "beer": 1},
    "PROV": {"name": "Brewery", "cost": 8, "income": 4, "vp": 4, "beer": 0},
}


def new_game(enabled=True):
    state = {"revision": 0, "cities": deepcopy(CITIES), "tiles": {},
             "players": {str(i): {"name": name, "money": 45, "income": 2,
                 "vp": 0, "spent": 0, "cards": 8} for i, name in enumerate(["Anni", "Player 2"])},
             "active": "0", "order": ["0", "1"], "turn_index": 0,
             "actions_left": 2, "round": 1, "era": 1, "over": False,
             "log": [], "scenario": "eco-lab-v1"}
    rules = EcoRules()
    rules.initialize(state, enabled)
    for owner, city, industry in [("0", "riga", "PROV"), ("0", "rotterdam", "MFG"),
                                  ("0", "newyork", "LUX"), ("1", "london", "PROV"),
                                  ("1", "marseille", "COTTON")]:
        add_tile(state, owner, city, industry)
    if enabled:
        state["eco"]["pollution"]["newyork"] = 5
        state["eco"]["pollution"]["marseille"] = 6
    state["log"].append("Scenario ready: seeded industries and pollution; simplified base rules.")
    return state


def add_tile(state, owner, city, industry):
    tile_id = uuid4().hex
    state["tiles"][tile_id] = {"id": tile_id, "city": city, "industry": industry,
        "owner": owner, "flipped": False, "resources": (1 if state["era"] == 1 else 2) if industry == "PROV" else 0}
    return tile_id


def options(state):
    if state["over"]:
        return []
    rules = EcoRules()
    player = state["active"]
    p = state["players"][player]
    result = []
    def add(kind, label, detail, **fields):
        result.append({"id": str(len(result)), "kind": kind, "label": label, "detail": detail, **fields})
    owned = [t for t in state["tiles"].values() if t["owner"] == player]
    beers = [t for t in owned if t["industry"] == "PROV" and t["resources"] > 0]
    for tile in owned:
        if tile["industry"] in ("COTTON", "MFG", "LUX") and not tile["flipped"]:
            quote = rules.quote_sale(state, tile["id"])
            for beer in beers:
                add("SELL", f"Sell {INDUSTRIES[tile['industry']]['name']} · {CITIES[tile['city']]['name']}",
                    f"Beer from {CITIES[beer['city']]['name']} · Pollution {quote['before']} → {quote['after']} · +{quote['green_reward']} green points",
                    tile_id=tile["id"], beer_id=beer["id"], quote=quote)
            if rules.enabled(state) and tile["id"] not in state["eco"]["upgraded"] and p["money"] >= rules.config.upgrade_cost:
                add("ECO_UPGRADE", f"Upgrade {INDUSTRIES[tile['industry']]['name']} · {CITIES[tile['city']]['name']}",
                    "£8 · one action · emissions −2 · earn 2 green points when sold", tile_id=tile["id"])
    for city, meta in CITIES.items():
        if rules.enabled(state) and any(t["city"] == city for t in owned) and state["eco"]["pollution"][city] > 0 and p["money"] >= rules.config.cleanup_cost:
            before = state["eco"]["pollution"][city]
            add("CLEAN_UP", f"Clean Up · {meta['name']}", f"£5 · one action · Pollution {before} → {max(0, before - 3)}", city=city)
        # Scenario restriction: at most three of each player's industries per city.
        if sum(t["city"] == city for t in owned) >= 3:
            continue
        for ind, definition in INDUSTRIES.items():
            quote = rules.quote_build(state, city, definition["cost"])
            if p["money"] >= quote["total"]:
                add("BUILD", f"Build {definition['name']} · {meta['name']}",
                    f"£{quote['total']} = £{quote['base']} base + £{quote['pollution_fee']} pollution fee", city=city, industry=ind, quote=quote)
    if p["income"] >= -7:
        add("LOAN", "Loan £30", "Immediate £30 · income −3 (simplified scenario)")
    add("PASS", "Pass", "Discard one demo card and use one action")
    return result


def execute(state, action_id, expected_revision):
    if type(expected_revision) is not int or expected_revision != state["revision"]:
        raise RuleError("State changed. Refresh and choose again.")
    action = next((a for a in options(state) if a["id"] == action_id), None)
    if action is None:
        raise RuleError("Action is no longer legal")
    work = deepcopy(state)
    rules = EcoRules()
    actor = work["active"]
    p = work["players"][actor]
    if p["cards"] < 1 or work["actions_left"] < 1:
        raise RuleError("No card or action available")
    kind = action["kind"]
    if kind == "BUILD":
        cost = rules.quote_build(work, action["city"], INDUSTRIES[action["industry"]]["cost"])["total"]
        p["money"] -= cost
        p["spent"] += cost
        add_tile(work, actor, action["city"], action["industry"])
    elif kind == "SELL":
        tile = work["tiles"][action["tile_id"]]
        rules.record_sale(work, tile["id"])
        tile["flipped"] = True
        p["income"] += INDUSTRIES[tile["industry"]]["income"]
        beer = work["tiles"][action["beer_id"]]
        beer["resources"] -= 1
        if beer["resources"] == 0:
            beer["flipped"] = True
            p["income"] += INDUSTRIES["PROV"]["income"]
    elif kind == "CLEAN_UP":
        rules.clean_up(work, actor, action["city"])
    elif kind == "ECO_UPGRADE":
        rules.upgrade(work, actor, action["tile_id"])
    elif kind == "LOAN":
        p["money"] += 30
        p["income"] -= 3
    p["cards"] -= 1
    work["actions_left"] -= 1
    work["log"].append(f"Round {work['round']} · {p['name']}: {action['label']} — {action['detail']}")
    if work["actions_left"] == 0:
        work["turn_index"] += 1
        if work["turn_index"] == len(work["order"]):
            work["turn_index"] = 0
            # Final round has scoring but no income payout.
            if work["round"] < 8:
                for entry in work["players"].values():
                    entry["money"] += entry["income"]
                    if entry["money"] < 0:
                        entry["vp"] += entry["money"]
                        entry["money"] = 0
                    entry["cards"] = 8
                work["log"].append("Round income paid. Demo hands refilled to 8 cards.")
            if work["round"] in (4, 8):
                for t in work["tiles"].values():
                    if t["flipped"]:
                        work["players"][t["owner"]]["vp"] += INDUSTRIES[t["industry"]]["vp"]
                work["log"].append(f"Era {work['era']} base industry scores awarded.")
                if work["round"] == 8:
                    work["over"] = True
                    rules.finalize(work)
                    work["log"].append("Final scoring: green points converted to VP once.")
                else:
                    work["era"] = 2
                    work["log"].append("Steam Era: pollution and upgrades persist. Demo industries remain on the board.")
            if not work["over"]:
                work["order"].sort(key=lambda pid: work["players"][pid]["spent"])
                for entry in work["players"].values():
                    entry["spent"] = 0
                work["round"] += 1
        work["active"] = work["order"][work["turn_index"]]
        work["actions_left"] = 0 if work["over"] else 2
    work["revision"] += 1
    return work


def public_state(state):
    result = deepcopy(state)
    result["options"] = options(state)
    result["definitions"] = INDUSTRIES
    return result
