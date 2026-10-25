// The existing Advisor exposes only a best flag, not scores or a top-three ranking.
// Display only evaluated recommendations; never rank arbitrary legal alternatives.
export function shortlist(actions = []) {
  return actions.filter(a => a.best).slice(0, 3);
}
export function moveSummary(before, after) {
  const changes = [];
  for (const player of after.players || []) {
    const old = (before.players || []).find(p => p.id === player.id);
    if (!old) continue;
    const bits = [];
    for (const [key, label] of [['money', 'cash'], ['income', 'income'], ['vp', 'victory points'], ['hand', 'cards'], ['tiles', 'tiles'], ['links', 'links']]) {
      const delta = player[key] - old[key];
      if (Number.isFinite(delta) && delta) bits.push(`${label} ${delta > 0 ? '+' : ''}${delta}`);
    }
    if (bits.length) changes.push(`${player.isMe ? 'You' : player.name}: ${bits.join(', ')}`);
  }
  const actions = (after.events || []).filter(e => e.t === 'act' && e.text).map(e => e.text);
  return [...actions, ...changes, ...(before.era !== after.era ? ['The era changed.'] : []), ...(before.round !== after.round ? ['A new round began.'] : [])].join(' · ') || 'Move resolved; no player totals changed. See the move log and map for board and resource changes.';
}
