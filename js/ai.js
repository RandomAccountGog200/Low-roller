// Low Roller — opponent brain.
// Scores every legal play by how much it changes the chance of winning the round, minus what the
// hotdogs are worth. Smarter bots also fear your Rewind, value hotdogs better and make fewer mistakes.
LR.AI = (() => {
  const E = LR.Engine, C = LR.CARDS;

  function makeProfile(skill) {
    skill = Math.max(0, Math.min(1, skill));
    return {
      skill,
      noise: (1 - skill) * 0.10,        // misjudging how good a play is
      hv: 0.035 + skill * 0.015,        // how much a single hotdog is worth (in round-win chance)
      fearsRewind: skill > 0.45,        // won't feed a big card into your open Rewind
      baits: skill > 0.7,               // plays a cheap card first to draw out your Rewind
      lazy: (1 - skill) * 0.22,         // sometimes just passes
      blunder: (1 - skill) * 0.08,      // sometimes plays something random
    };
  }

  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

  function canRewind(s, q) {
    const i = s.decks[q].indexOf('rewind');
    return i >= 0 && !s.used[q][i] && s.hot[q] >= C.rewind.cost;
  }

  function evaluate(s, p, i, target, prof) {
    const card = E.cardOf(s, p, i), e = 1 - p;
    const p0 = E.winProb(s, p);
    const samples = card.random ? 20 : 1;
    let sum = 0, after = null;
    for (let k = 0; k < samples; k++) {
      const c = E.clone(s);
      E.play(c, p, i, target);
      sum += E.winProb(c, p);
      after = c;
    }
    const matchPoint = s.score[0] === E.WIN_ROUNDS - 1 || s.score[1] === E.WIN_ROUNDS - 1;
    const weight = matchPoint ? 1.35 : 1;
    let hv = prof.hv;
    if (s.hot[p] >= E.MAX_HOT - 1) hv *= 0.5; // about to waste income anyway
    const gain = (sum / samples - p0) * weight;
    let hotBonus = 0;
    if (card.id === 'snack') hotBonus = (after.hot[p] - s.hot[p] + card.cost) * hv;
    if (card.id === 'thief') {
      const k = s.hot[e] - after.hot[e];
      hotBonus = k * hv * 1.6 + (prof.fearsRewind && canRewind(s, e) && !canRewind(after, e) ? 0.08 : 0);
    }
    let value = gain - card.cost * hv + hotBonus;
    // Feeding a juicy play into an open Rewind is a waste of hotdogs.
    if (prof.fearsRewind && card.id !== 'rewind' && gain > 0.1 && canRewind(after, e)) {
      value = gain * 0.25 - card.cost * hv + hotBonus;
    }
    return value + gauss() * prof.noise;
  }

  function decide(s, p, prof) {
    const opts = [];
    for (let i = 0; i < 3; i++) {
      if (!E.canPlay(s, p, i)) continue;
      for (const t of E.targets(s, p, i)) opts.push({ type: 'play', i, target: t, v: evaluate(s, p, i, t, prof) });
    }
    if (!opts.length) return { type: 'pass' };
    if (Math.random() < prof.blunder) {
      const o = opts[Math.floor(Math.random() * opts.length)];
      if (E.cardOf(s, p, o.i).cost <= 3) return o;
    }
    opts.sort((a, b) => b.v - a.v);
    let best = opts[0];

    // Bait: if the enemy is sitting on Rewind and we want to land something big, lead with a cheap
    // useful card first so they either burn Rewind on it or let it through.
    if (prof.baits && canRewind(s, 1 - p) && E.cardOf(s, p, best.i).cost >= 4) {
      const cheap = opts.find((o) => E.cardOf(s, p, o.i).cost <= 2 && o.v > -0.03);
      if (cheap) best = cheap;
    }
    if (best.v <= 0.004) return { type: 'pass' };
    if (Math.random() < prof.lazy && best.v < 0.15) return { type: 'pass' };
    return best;
  }

  return { makeProfile, decide };
})();
