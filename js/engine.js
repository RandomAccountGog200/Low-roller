// Low Roller — pure rules engine. No DOM in here.
// Player 0 = you, player 1 = opponent. Each player has 3 reels (columns).
// A round: column 1 lands -> action window -> column 2 lands -> window -> column 3 lands -> window -> showdown.
// Lowest TOTAL of the three digits wins the round. First to 3 round wins takes the match.
LR.Engine = (() => {
  const C = LR.CARDS;
  // Tunable economy (balance-tested with AI self-play).
  LR.RULES = LR.RULES || { startHot: 3, income: 2, usage: 'window', sevensTotal: 7, runTotal: 10 };
  const R = LR.RULES;
  const MAX_HOT = 10, WIN_ROUNDS = 3, NCOL = 3;
  const clampD = (v) => Math.max(0, Math.min(9, v));
  const clampH = (v) => Math.max(0, Math.min(MAX_HOT, v));
  const tri = (v) => [v, v, v];

  // `flip` marks the guest in an online match: its local player 0 is seat 1. Anything that draws
  // random numbers for both players walks the seats in the same absolute order, so two clients
  // sharing a seeded rng stay in lockstep while each one sees itself as player 0.
  function newMatch(decks, firstActor, flip = false) {
    return {
      flip,
      round: 0, score: [0, 0], hot: [R.startHot, R.startHot], decks,
      firstActor, roundFirst: firstActor,
      digits: [tri(null), tri(null)], mods: [tri(null), tri(null)], frozen: [tri(false), tri(false)],
      used: [tri(false), tri(false)], landed: 0,
      log: [], actor: firstActor, passes: 0,
      over: false, winner: null, lastRound: null,
    };
  }

  function newRound(s) {
    s.round++;
    s.digits = [tri(null), tri(null)];
    s.mods = [tri(null), tri(null)];
    s.frozen = [tri(false), tri(false)];
    s.used = [tri(false), tri(false)];
    s.landed = 0;
    s.log = [];
    s.roundFirst = (s.firstActor + s.round - 1) % 2;
  }

  function rollDigit(mod, rng) {
    if (mod === 'lucky') return Math.floor(rng() * 5);
    if (mod === 'hex') return 5 + Math.floor(rng() * 5);
    return Math.floor(rng() * 10);
  }

  // Lands the next column for both players. Returns the column index.
  const seats = (s) => (s.flip ? [1, 0] : [0, 1]);

  function landColumn(s, rng = Math.random) {
    const c = s.landed;
    for (const p of seats(s)) {
      s.digits[p][c] = rollDigit(s.mods[p][c], rng);
      s.mods[p][c] = null;
    }
    s.landed++;
    return c;
  }

  // Every window: both players get hotdogs. First mover alternates each window.
  function startWindow(s) {
    s.hot = s.hot.map((h) => clampH(h + R.income));
    if (R.usage === 'window') s.used = [tri(false), tri(false)];
    s.log = [];
    s.passes = 0;
    s.actor = (s.roundFirst + s.landed - 1) % 2;
  }

  // Special hands, only once all three reels have landed:
  //   7-7-7 is a jackpot and counts as R.sevensTotal.
  //   A run (three digits climbing by one, left to right: 1-2-3, 4-5-6, 7-8-9...) counts as R.runTotal.
  function special(ds) {
    if (ds.some((d) => d === null)) return null;
    if (ds[0] === 7 && ds[1] === 7 && ds[2] === 7) return 'sevens';
    if (ds[1] === ds[0] + 1 && ds[2] === ds[1] + 1) return 'run';
    return null;
  }
  function score(ds) {
    const sp = special(ds);
    if (sp === 'sevens') return R.sevensTotal;
    if (sp === 'run') return R.runTotal;
    return ds.reduce((a, d) => a + (d ?? 0), 0);
  }
  const total = (s, p) => score(s.digits[p]);
  const cardOf = (s, p, i) => C[s.decks[p][i]];
  const landedCols = (s) => [...Array(s.landed).keys()];

  function lastEnemyPlay(s, p) {
    const last = s.log[s.log.length - 1];
    return last && last.type === 'play' && last.p !== p ? last : null;
  }

  // All legal targets for a card. [] = unplayable, [null] = playable with no target.
  function targets(s, p, i) {
    const card = cardOf(s, p, i), e = 1 - p, d = s.digits, cols = landedCols(s);
    const own = (ok) => cols.filter((c) => ok(c)).map((c) => ({ side: p, col: c }));
    const enemy = (ok) => cols.filter((c) => !s.frozen[e][c] && ok(c)).map((c) => ({ side: e, col: c }));
    const any = (ok) => (ok ? [null] : []);
    switch (card.id) {
      case 'nudge': case 'squash': case 'zero': return own((c) => d[p][c] > 0);
      case 'reroll': return own(() => true);
      case 'freeze': return own((c) => !s.frozen[p][c]);
      case 'jinx': case 'maxout': return enemy((c) => d[e][c] < 9);
      case 'heist': return own((c) => !s.frozen[e][c] && d[e][c] !== d[p][c]);
      case 'rewind': return any(!!lastEnemyPlay(s, p));
      case 'lucky': case 'hex': return any(s.landed < NCOL);
      case 'snack': return any(s.hot[p] < MAX_HOT);
      case 'thief': return any(s.hot[e] > 0);
      case 'chaos': case 'timewarp': return any(s.landed > 0);
      case 'jackpot': case 'blackhole': return any(cols.some((c) => d[p][c] > 0));
      case 'tsunami': return any(cols.some((c) => !s.frozen[e][c] && d[e][c] < 9));
    }
    return [];
  }

  // null if playable, otherwise a human-readable reason.
  function whyNot(s, p, i) {
    const card = cardOf(s, p, i);
    if (s.used[p][i]) return R.usage === 'window' ? 'Already used this window' : 'Already used this round';
    if (s.hot[p] < card.cost) return `Needs ${card.cost} hotdogs`;
    if (!targets(s, p, i).length) {
      if (card.id === 'rewind') return 'Only right after the enemy plays an ability';
      if (card.id === 'lucky' || card.id === 'hex') return 'No reels left to land';
      return 'Nothing to target right now';
    }
    return null;
  }
  const canPlay = (s, p, i) => !whyNot(s, p, i);
  const anyPlayable = (s, p) => [0, 1, 2].some((i) => canPlay(s, p, i));

  const snap = (s) => ({
    digits: s.digits.map((r) => r.slice()),
    mods: s.mods.map((r) => r.slice()),
    frozen: s.frozen.map((r) => r.slice()),
  });

  function play(s, p, i, target, rng = Math.random) {
    const card = cardOf(s, p, i), e = 1 - p, d = s.digits;
    const entry = { type: 'play', p, i, card: card.id, target, before: snap(s), hotFx: [0, 0] };
    s.hot[p] -= card.cost;
    s.used[p][i] = true;
    const gainHot = (q, n) => { const was = s.hot[q]; s.hot[q] = clampH(was + n); entry.hotFx[q] += s.hot[q] - was; };
    const t = target;
    switch (card.id) {
      case 'nudge':  d[p][t.col] = clampD(d[p][t.col] - 1); break;
      case 'squash': d[p][t.col] = clampD(d[p][t.col] - 3); break;
      case 'zero':   d[p][t.col] = 0; break;
      case 'reroll': d[p][t.col] = Math.floor(rng() * 10); break;
      case 'freeze': s.frozen[p][t.col] = true; break;
      case 'jinx':   d[e][t.col] = clampD(d[e][t.col] + 2); break;
      case 'maxout': d[e][t.col] = 9; break;
      case 'heist': { const a = d[p][t.col]; d[p][t.col] = d[e][t.col]; d[e][t.col] = a; break; }
      case 'lucky':  s.mods[p][s.landed] = 'lucky'; break;
      case 'hex':    s.mods[e][s.landed] = 'hex'; break;
      case 'snack':  gainHot(p, 1); break;
      case 'thief': { const k = Math.min(2, s.hot[e]); gainHot(e, -k); gainHot(p, k); break; }
      case 'chaos':
        for (const c of landedCols(s)) for (const q of seats(s))
          if (!s.frozen[q][c]) d[q][c] = Math.floor(rng() * 10);
        break;
      case 'timewarp':
        for (const c of landedCols(s)) d[p][c] = Math.min(d[p][c], Math.floor(rng() * 10));
        break;
      case 'jackpot':   for (const c of landedCols(s)) d[p][c] = clampD(d[p][c] - 3); break;
      case 'blackhole': for (const c of landedCols(s)) d[p][c] = 0; break;
      case 'tsunami':   for (const c of landedCols(s)) if (!s.frozen[e][c]) d[e][c] = clampD(d[e][c] + 3); break;
      case 'rewind': {
        // Restore the board to right before the enemy's last ability. Their hotdogs stay spent,
        // but hotdogs their ability moved around (Snack Break, Thief) are given back.
        const last = lastEnemyPlay(s, p);
        entry.undid = last.card;
        s.digits = last.before.digits.map((r) => r.slice());
        s.mods = last.before.mods.map((r) => r.slice());
        s.frozen = last.before.frozen.map((r) => r.slice());
        for (let q = 0; q < 2; q++) gainHot(q, -last.hotFx[q]);
        break;
      }
    }
    s.log.push(entry);
    s.passes = 0;
    s.actor = e;
    return entry;
  }

  // Returns true when the window closes (both players passed in a row).
  function pass(s, p) {
    s.log.push({ type: 'pass', p });
    s.passes++;
    s.actor = 1 - p;
    return s.passes >= 2;
  }

  function endRound(s) {
    const t = [total(s, 0), total(s, 1)];
    const winner = t[0] < t[1] ? 0 : t[1] < t[0] ? 1 : -1;
    if (winner >= 0) s.score[winner]++;
    if (s.score[0] >= WIN_ROUNDS || s.score[1] >= WIN_ROUNDS) {
      s.over = true;
      s.winner = s.score[0] >= WIN_ROUNDS ? 0 : 1;
    }
    s.lastRound = { totals: t, winner };
    return s.lastRound;
  }

  // Probability distribution of a player's final score, assuming no more abilities are played.
  // Special hands make scoring non-additive, so walk every way the unlanded reels can fall
  // (at most 10x10x10, and only 10x10 once a window is open).
  function sideDist(s, p) {
    const opts = s.digits[p].map((v, c) => {
      if (v !== null) return [v];
      const m = s.mods[p][c];
      const lo = m === 'hex' ? 5 : 0, hi = m === 'lucky' ? 4 : 9, r = [];
      for (let x = lo; x <= hi; x++) r.push(x);
      return r;
    });
    const w = 1 / (opts[0].length * opts[1].length * opts[2].length);
    const dist = new Array(9 * NCOL + 1).fill(0);
    for (const a of opts[0]) for (const b of opts[1]) for (const c of opts[2]) dist[score([a, b, c])] += w;
    return dist;
  }

  // Chance that player p wins the round (ties count half).
  function winProb(s, p) {
    const A = sideDist(s, p), B = sideDist(s, 1 - p);
    let win = 0;
    for (let i = 0; i < A.length; i++) {
      if (!A[i]) continue;
      for (let j = 0; j < B.length; j++) {
        if (!B[j]) continue;
        if (i < j) win += A[i] * B[j]; else if (i === j) win += (A[i] * B[j]) / 2;
      }
    }
    return win;
  }

  const clone = (s) => {
    const c = JSON.parse(JSON.stringify(s));
    return c;
  };

  return {
    MAX_HOT, WIN_ROUNDS, NCOL,
    newMatch, newRound, landColumn, startWindow, targets, whyNot, canPlay, anyPlayable,
    play, pass, endRound, total, special, score, winProb, clone, cardOf, lastEnemyPlay,
  };
})();
