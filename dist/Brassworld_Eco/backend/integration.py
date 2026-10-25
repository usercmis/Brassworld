"""Atomic adapter for an owned full-game engine; not a remote proxy patch."""
from copy import deepcopy
from .eco_rules import EcoConfig, EcoRules, RuleError


def execute_owned_game(state, actor, request, engine):
    """Host locks/loads the game before calling and persists ONLY the return value.

    engine must implement:
      validate_turn(state, actor, request)  # version, actor, actions, game status
      validate_discard(state, actor, discard)
      validate_base(state, actor, request) -> authoritative cost for BUILD, else 0
      apply_base(state, actor, request)    # no turn advancement; debits base cost
      consume_action(state, actor, discard) # validated discard(s), one action
      advance(state)                       # round/era/final scoring, no hidden AI

    SELL request contains tile_ids (unique); base validator checks ownership,
    beer, merchant acceptance/connectivity and every original selling rule.
    All AI actions must also pass this function before being committed.
    Tile ids must be immutable unique ids, never city-slot (overbuilding reuses it).
    """
    work = deepcopy(state)
    rules = EcoRules(EcoConfig(**work["eco"]["config"]))
    engine.validate_turn(work, actor, request)
    engine.validate_discard(work, actor, request.get("discard"))
    kind = request.get("kind")
    if kind == "CLEAN_UP":
        rules.clean_up(work, actor, request.get("city"))
    elif kind == "ECO_UPGRADE":
        rules.upgrade(work, actor, request.get("tile_id"))
    else:
        base_cost = engine.validate_base(work, actor, request)
        if kind == "BUILD":
            fee = rules.quote_build(work, request["city"], base_cost)["pollution_fee"]
            if work["players"][actor]["money"] < base_cost + fee:
                raise RuleError("Insufficient cash including pollution fee")
            work["players"][actor]["money"] -= fee
            work["players"][actor]["spent"] += fee
        if kind == "SELL":
            ids = request.get("tile_ids", [])
            if not ids or len(set(ids)) != len(ids):
                raise RuleError("Choose unique industries to sell")
            for tile_id in ids:
                if work["tiles"][tile_id]["owner"] != actor:
                    raise RuleError("Cannot sell another player's industry")
                rules.record_sale(work, tile_id)
        engine.apply_base(work, actor, request)
    engine.consume_action(work, actor, request["discard"])
    engine.advance(work)
    if work.get("over"):
        rules.finalize(work)
    return work
