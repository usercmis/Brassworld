"""Eco extension for an OWNED rules engine. No network calls or client authority.

All functions mutate an in-transaction state supplied by the host engine.
The host must validate/execute base rules, discard a card, advance the turn,
and commit atomically. See integration.py and INTEGRATION_CN.md.
"""
from dataclasses import asdict, dataclass


class RuleError(ValueError):
    pass


@dataclass(frozen=True)
class EcoConfig:
    max_pollution: int = 10
    threshold: int = 6
    surcharge: int = 5
    cleanup_cost: int = 5
    cleanup_amount: int = 3
    upgrade_cost: int = 8
    emission_reduction: int = 2
    green_reward: int = 2

    def __post_init__(self):
        for key, value in asdict(self).items():
            if type(value) is not int or value < 0:
                raise ValueError(f"{key} must be a non-negative integer")
        if not 0 < self.threshold <= self.max_pollution:
            raise ValueError("threshold must be between 1 and max_pollution")


EMISSIONS = {"COTTON": 1, "MFG": 2, "LUX": 3}


class EcoRules:
    def __init__(self, config=None):
        self.config = config or EcoConfig()

    def initialize(self, state, enabled):
        if type(enabled) is not bool:
            raise RuleError("eco_enabled must be a boolean")
        state["eco"] = {
            "schema": 1, "enabled": enabled, "config": asdict(self.config),
            "pollution": {c: 0 for c in state["cities"]}, "upgraded": [],
            "rewarded": [], "green": {str(p): 0 for p in state["players"]},
            "finalized": False,
        }

    def enabled(self, state):
        return bool(state.get("eco", {}).get("enabled"))

    def _city(self, state, city):
        if city not in state["cities"]:
            raise RuleError("Unknown city")

    def _player(self, state, player):
        if player not in state["players"]:
            raise RuleError("Unknown player")
        return state["players"][player]

    def _require_enabled(self, state):
        if not self.enabled(state):
            raise RuleError("Eco Mode is disabled")

    def surcharge(self, state, city):
        self._city(state, city)
        if not self.enabled(state):
            return 0
        return self.config.surcharge if state["eco"]["pollution"][city] >= self.config.threshold else 0

    def quote_build(self, state, city, base_cost):
        if type(base_cost) is not int or base_cost < 0:
            raise RuleError("Invalid server-generated base cost")
        extra = self.surcharge(state, city)
        return {"base": base_cost, "pollution_fee": extra, "total": base_cost + extra}

    def quote_sale(self, state, tile_id):
        tile = state["tiles"].get(tile_id)
        if not tile or tile["industry"] not in EMISSIONS:
            raise RuleError("Choose a sales industry")
        if tile["flipped"]:
            raise RuleError("Industry has already been sold")
        city = tile["city"]
        self._city(state, city)
        before = state["eco"]["pollution"][city]
        upgraded = tile_id in state["eco"]["upgraded"]
        emission = max(0, EMISSIONS[tile["industry"]] - (self.config.emission_reduction if upgraded else 0)) if self.enabled(state) else 0
        after = min(self.config.max_pollution, before + emission)
        reward = self.config.green_reward if self.enabled(state) and upgraded and tile_id not in state["eco"]["rewarded"] else 0
        return {"city": city, "before": before, "emissions": emission,
                "added": after - before, "after": after, "green_reward": reward}

    def record_sale(self, state, tile_id):
        """Call once BEFORE the host flips a validated tile, inside its transaction."""
        quote = self.quote_sale(state, tile_id)
        if not self.enabled(state):
            return quote
        tile = state["tiles"][tile_id]
        state["eco"]["pollution"][tile["city"]] = quote["after"]
        if quote["green_reward"]:
            owner = str(tile["owner"])
            state["eco"]["green"][owner] += quote["green_reward"]
            state["eco"]["rewarded"].append(tile_id)
        return quote

    def clean_up(self, state, player, city):
        self._require_enabled(state)
        self._city(state, city)
        p = self._player(state, player)
        if not any(t["owner"] == player and t["city"] == city for t in state["tiles"].values()):
            raise RuleError("You must own an industry in this city")
        before = state["eco"]["pollution"][city]
        if before == 0:
            raise RuleError("This city is already clean")
        if p["money"] < self.config.cleanup_cost:
            raise RuleError("Not enough money for Clean Up")
        p["money"] -= self.config.cleanup_cost
        p["spent"] += self.config.cleanup_cost
        state["eco"]["pollution"][city] = max(0, before - self.config.cleanup_amount)
        return {"city": city, "before": before, "after": state["eco"]["pollution"][city], "cost": self.config.cleanup_cost}

    def upgrade(self, state, player, tile_id):
        self._require_enabled(state)
        p = self._player(state, player)
        tile = state["tiles"].get(tile_id)
        if not tile or tile["owner"] != player:
            raise RuleError("Choose your own industry")
        if tile["industry"] not in EMISSIONS or tile["flipped"]:
            raise RuleError("Upgrade an unsold cotton, manufacturing or pottery industry")
        if tile_id in state["eco"]["upgraded"]:
            raise RuleError("Industry is already upgraded")
        if p["money"] < self.config.upgrade_cost:
            raise RuleError("Not enough money for Eco Upgrade")
        p["money"] -= self.config.upgrade_cost
        p["spent"] += self.config.upgrade_cost
        state["eco"]["upgraded"].append(tile_id)
        return {"tile": tile_id, "cost": self.config.upgrade_cost}

    def finalize(self, state):
        """Call after base FINAL scoring, never at the end of the first era."""
        if not state.get("over"):
            raise RuleError("Green points convert only at game end")
        if not self.enabled(state) or state["eco"]["finalized"]:
            return {}
        awards = dict(state["eco"]["green"])
        for player, points in awards.items():
            state["players"][player]["vp"] += points
        state["eco"]["finalized"] = True
        return awards
