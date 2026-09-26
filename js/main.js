// Low Roller — screens, save data, and the battle controller.
(() => {
  const E = LR.Engine, C = LR.CARDS, S = LR.Sound;
  const $ = (q, r = document) => r.querySelector(q);
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const ORD = ['1st', '2nd', '3rd'];
  const TURN_MS = 20000;

  // ------------------------------------------------------------------ save
  const SAVE_KEY = 'lowroller_save_v1';
  const DEFAULT = {
    coins: 100, trophies: 0, bestTrophies: 0, owned: [...LR.STARTER_OWNED], deck: [...LR.STARTER_DECK],
    wins: 0, losses: 0, bossWins: 0, underdogWins: 0, muted: false, seenHelp: false, crateAt: 0,
  };
  let save = load();
  function load() {
    let d = JSON.parse(JSON.stringify(DEFAULT));
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) d = { ...d, ...JSON.parse(raw) };
    } catch (e) { /* private mode etc. — play without saving */ }
    d.owned = [...new Set([...LR.STARTER_OWNED, ...d.owned.filter((id) => C[id])])];
    d.deck = d.deck.filter((id) => d.owned.includes(id));
    d.deck = [...new Set(d.deck)];
    for (const id of d.owned) if (d.deck.length < 3 && !d.deck.includes(id)) d.deck.push(id);
    return d;
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------ helpers
  let SPEED = 1;
  const ms = (x) => x * SPEED;
  const sleep = (x) => new Promise((r) => setTimeout(r, ms(x)));

  function cardEl(id, { mini = false, cls = '', extra = '' } = {}) {
    const c = C[id];
    const d = document.createElement('div');
    d.className = `card r-${c.rarity} ${mini ? 'mini' : ''} ${cls}`;
    d.dataset.id = id;
    d.innerHTML = `<div class="cost">${c.cost}</div><div class="art">${c.icon}</div>
      <div class="name">${c.name}</div><div class="desc">${c.desc}</div>
      <div class="rar">${LR.RARITY[c.rarity].label}</div>${extra}`;
    return d;
  }

  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2000);
  }

  function banner(text, cls = '', sub = '', dur = 1400) {
    const b = document.createElement('div');
    b.className = `banner ${cls}`;
    b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    b.style.animationDuration = `${ms(dur)}ms`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), ms(dur) + 50);
  }

  function floater(target, text, cls) {
    const r = target.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = `floater ${cls}`;
    f.textContent = text;
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top + r.height / 2}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  function flashScreen(color) {
    const f = document.createElement('div');
    f.className = 'flashscreen';
    f.style.background = color;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 600);
  }

  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 600); }

  function rain(emojis, n = 40) {
    for (let k = 0; k < n; k++) {
      const d = document.createElement('div');
      d.className = 'rain';
      d.textContent = pick(emojis);
      d.style.left = `${rand(0, 100)}vw`;
      d.style.fontSize = `${rand(22, 44)}px`;
      d.style.setProperty('--rot', `${rand(-540, 540)}deg`);
      d.style.animationDuration = `${rand(1.8, 3.4)}s`;
      d.style.animationDelay = `${rand(0, 1.2)}s`;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 5000);
    }
  }

  function modal(html, onMount) {
    const bg = $('#modalBg'), m = $('#modal');
    m.innerHTML = html;
    bg.classList.add('show');
    if (onMount) onMount(m);
  }
  function closeModal() { $('#modalBg').classList.remove('show'); }

  function countUp(el, from, to, dur = 700) {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) setTimeout(step, 30);
    };
    step();
  }

  function renderTop(animateFrom) {
    const cv = $('#coinsVal'), tv = $('#trophyVal');
    if (animateFrom) { countUp(cv, animateFrom.coins, save.coins); countUp(tv, animateFrom.trophies, save.trophies); }
    else { cv.textContent = save.coins; tv.textContent = save.trophies; }
    $('#muteBtn').textContent = save.muted ? '🔇' : '🔊';
  }

  const deckPower = (deck) => deck.reduce((a, id) => a + LR.RARITY[C[id].rarity].order, 0);

  // ------------------------------------------------------------------ screens
  let current = 'home', heroTimer = null;
  const renderers = { home: renderHome, deck: renderDeck, shop: renderShop, rules: renderRules };

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.body.classList.toggle('in-battle', name === 'battle');
    current = name;
    clearTimeout(heroTimer);
    if (renderers[name]) renderers[name]();
    renderTop();
  }

  // ---------- home
  function renderHome() {
    const root = $('#screen-home');
    const a = LR.arenaFor(save.trophies), A = LR.ARENAS[a], next = LR.ARENAS[a + 1];
    const pct = next ? ((save.trophies - A.min) / (next.min - A.min)) * 100 : 100;
    const games = save.wins + save.losses;
    root.innerHTML = `
      <div class="home">
        <div class="hero">
          <h1>LOW <em>ROLLER</em></h1>
          <p>Spin three reels · lowest total wins · outsmart bigger decks</p>
        </div>
        <div class="hero-reels" id="heroReels"></div>
        <div class="arena-card">
          <div class="arena-top">
            <div class="arena-icon">${A.icon}</div>
            <div><div class="arena-sub">ARENA ${a + 1}</div><div class="arena-name">${A.name}</div></div>
            <div class="pill" style="margin-left:auto"><span class="ico">🏆</span>${save.trophies}</div>
          </div>
          <div class="progress"><i style="width:${Math.max(3, pct)}%"></i></div>
          <div class="progress-lbl"><span>${A.min}</span><span>${next ? `Next: ${next.icon} ${next.name} at ${next.min}` : 'Top arena reached!'}</span></div>
        </div>
        <div class="home-actions">
          <button class="btn" id="goBattle">⚔️ BATTLE</button>
          <button class="btn purple boss-btn" id="goBoss"><span style="font-size:30px">👑</span>
            <span>BOSS FIGHT<small>The Golden Frank · the best deck in the game${save.bossWins ? ` · beaten ${save.bossWins}×` : ''}</small></span></button>
        </div>
        <div class="stats-row">
          <div class="stat"><b>${save.wins}</b><span>Wins</span></div>
          <div class="stat"><b>${save.losses}</b><span>Losses</span></div>
          <div class="stat"><b>${games ? Math.round((save.wins / games) * 100) : 0}%</b><span>Win rate</span></div>
          <div class="stat"><b>${save.underdogWins}</b><span>Underdog wins</span></div>
        </div>
        <div class="deck-preview" id="homeDeck"></div>
      </div>`;
    const hd = $('#homeDeck');
    save.deck.forEach((id) => hd.appendChild(cardEl(id, { mini: true })));
    hd.onclick = () => { S.click(); show('deck'); };
    $('#goBattle').onclick = () => { S.select(); startBattle({ boss: false }); };
    $('#goBoss').onclick = () => { S.select(); startBattle({ boss: true }); };

    const hr = $('#heroReels');
    const reels = [0, 1, 2].map((c) => { const r = new LR.Reel(0, c); r.set(irand(0, 9)); hr.appendChild(r.el); return r; });
    const cycle = () => {
      if (current !== 'home') return;
      reels.forEach((r) => r.spin());
      const vals = [irand(0, 4), irand(0, 9), irand(0, 9)];
      reels.forEach((r, c) => setTimeout(() => r.land(vals[c], 900 + c * 250, false), 350));
      heroTimer = setTimeout(cycle, 5200);
    };
    heroTimer = setTimeout(cycle, 600);
  }

  // ---------- deck builder
  let deckPick = { card: null, slot: null };
  function renderDeck() {
    const root = $('#screen-deck');
    const all = Object.keys(C).sort((a, b) => LR.RARITY[C[a].rarity].order - LR.RARITY[C[b].rarity].order || C[a].cost - C[b].cost);
    const avg = save.deck.reduce((a, id) => a + C[id].cost, 0) / 3;
    root.innerHTML = `
      <div class="page-title">Your Deck</div>
      <div class="page-sub">Pick 3 abilities. Tap a card from your collection, then tap the slot to swap it in.</div>
      <div class="deck-slots" id="slots"></div>
      <div class="deck-meta"><span>Avg cost <b>${avg.toFixed(1)}</b> 🌭</span><span>Owned <b>${save.owned.length}/${all.length}</b></span></div>
      <div class="section-h">Collection</div>
      <div class="grid" id="coll"></div>`;
    const slots = $('#slots');
    save.deck.forEach((id, k) => {
      const w = document.createElement('div');
      w.className = `slot ${deckPick.card || deckPick.slot === k ? 'pick' : ''}`;
      const cd = cardEl(id);
      if (deckPick.slot === k) cd.classList.add('picked');
      w.appendChild(cd);
      w.onclick = () => {
        if (deckPick.card) return place(deckPick.card, k);
        S.click();
        deckPick.slot = deckPick.slot === k ? null : k;
        renderDeck();
      };
      slots.appendChild(w);
    });
    const coll = $('#coll');
    for (const id of all) {
      const owned = save.owned.includes(id);
      const price = LR.RARITY[C[id].rarity].price;
      const d = cardEl(id, {
        cls: `${owned ? '' : 'locked'} ${save.deck.includes(id) ? 'in-deck' : ''} ${deckPick.card === id ? 'picked' : ''}`,
        extra: owned ? '' : `<div class="tag">🪙 ${price}</div>`,
      });
      d.onclick = () => {
        if (!owned) { S.deny(); toast(`Locked — buy ${C[id].name} in the Shop for 🪙 ${price}`); return; }
        if (save.deck.includes(id)) { S.deny(); toast(`${C[id].name} is already in your deck`); return; }
        if (deckPick.slot !== null) return place(id, deckPick.slot);
        S.click();
        deckPick.card = deckPick.card === id ? null : id;
        renderDeck();
      };
      coll.appendChild(d);
    }
  }
  function place(id, slot) {
    const old = save.deck[slot];
    save.deck[slot] = id;
    persist();
    deckPick = { card: null, slot: null };
    S.select();
    toast(`${C[id].icon} ${C[id].name} in, ${C[old].name} out`);
    renderDeck();
  }

  // ---------- shop
  const CRATE_MS = 3 * 60 * 60 * 1000, CRATE_COINS = 50;
  function renderShop() {
    const root = $('#screen-shop');
    const left = save.crateAt + CRATE_MS - Date.now();
    const ready = left <= 0;
    const hrs = Math.floor(left / 3600000), mins = Math.ceil((left % 3600000) / 60000);
    root.innerHTML = `
      <div class="page-title">Shop</div>
      <div class="page-sub">Stronger abilities cost more coins <b>and</b> more hotdogs to play — so they're never free wins.</div>
      <div class="crate">
        <div class="ico">📦</div>
        <div class="txt"><b>Free Hotdog Crate</b><span>${ready ? `+${CRATE_COINS} coins, ready now!` : `Next crate in ${hrs}h ${mins}m`}</span></div>
        <button class="btn small" id="crateBtn" ${ready ? '' : 'disabled'}>Open</button>
      </div>
      <div id="shopSecs"></div>`;
    $('#crateBtn').onclick = () => {
      const before = { coins: save.coins, trophies: save.trophies };
      save.coins += CRATE_COINS; save.crateAt = Date.now(); persist();
      S.coin(); S.coin(0.12); S.coin(0.24);
      rain(['🪙', '🌭'], 24);
      renderShop(); renderTop(before);
    };
    const secs = $('#shopSecs');
    for (const rar of ['rare', 'epic', 'legendary', 'common']) {
      const ids = Object.keys(C).filter((id) => C[id].rarity === rar).sort((a, b) => C[a].cost - C[b].cost);
      const h = document.createElement('div');
      h.className = 'section-h';
      h.innerHTML = `${LR.RARITY[rar].label}<span class="chip">${rar === 'common' ? 'starter · free' : `🪙 ${LR.RARITY[rar].price} each`}</span>`;
      secs.appendChild(h);
      const g = document.createElement('div');
      g.className = 'grid';
      for (const id of ids) {
        const owned = save.owned.includes(id), price = LR.RARITY[rar].price;
        const it = document.createElement('div');
        it.className = 'shop-item';
        it.appendChild(cardEl(id));
        if (owned) {
          const o = document.createElement('div'); o.className = 'owned'; o.textContent = '✓ OWNED'; it.appendChild(o);
        } else {
          const b = document.createElement('button');
          b.className = 'btn small';
          b.textContent = `🪙 ${price}`;
          if (save.coins < price) b.disabled = true;
          b.onclick = () => buy(id, price);
          it.appendChild(b);
        }
        g.appendChild(it);
      }
      secs.appendChild(g);
    }
  }
  function buy(id, price) {
    if (save.coins < price || save.owned.includes(id)) return;
    const before = { coins: save.coins, trophies: save.trophies };
    save.coins -= price;
    save.owned.push(id);
    persist();
    S.coin(); S.good();
    toast(`${C[id].icon} ${C[id].name} unlocked! Equip it in the Deck tab.`);
    renderShop(); renderTop(before);
  }

  // ---------- rules
  function rulesHTML() {
    return `
      <div class="rules">
        <h3>🎰 Lowest number wins</h3>
        <p>You and your opponent each have <b>3 reels</b> that spin to a digit from 0–9. The player with the <b>lowest total</b> wins the round. First to <b>3 round wins</b> takes the match. A tie is a push — nobody scores.</p>
        <h3>⏱️ How a round plays</h3>
        <ul>
          <li>The reels land <b>one column at a time</b>. After each column lands, there's an <b>action window</b>.</li>
          <li>In a window you take turns: <b>play one ability or pass</b>. When both players pass in a row, the next column lands.</li>
          <li>Who moves first alternates every window, so nobody always gets the last word.</li>
        </ul>
        <h3>🌭 Hotdogs are your elixir</h3>
        <ul>
          <li>You start the match with 3 and get <b>+2 every window</b> (max 10).</li>
          <li>Hotdogs <b>carry over</b> between rounds. Letting a hopeless round go to bank hotdogs is often the winning move.</li>
          <li>Each of your 3 abilities can be used <b>once per window</b> if you can afford it.</li>
        </ul>
        <h3>🧠 Why skill beats a big deck</h3>
        <ul>
          <li><b>⏪ Rewind</b> is a starter card: for 3 hotdogs it undoes the enemy's last ability. A 9-hotdog Black Hole erased by a 3-hotdog Rewind is a massive swing.</li>
          <li>Legendaries cost so much that a big deck can only fire one every couple of rounds. Cheap cards play every round.</li>
          <li>Watch the enemy's hotdogs and which cards they've used. If they can't afford Rewind, that's your moment.</li>
          <li>Bait counters with a cheap card before you commit the expensive one. Don't overspend on rounds you can't win.</li>
        </ul>
        <h3>🪙 Coins, trophies, shop</h3>
        <p>Win matches for coins and trophies, climb arenas, and buy new abilities in the Shop. Beat a stronger deck than yours for an <b>Underdog bonus</b>.</p>
        <div class="tip"><b>Controls:</b> tap an ability, then tap a glowing reel (or tap the card again if it has no target). Keyboard: <b>1–3</b> pick a card, <b>Enter</b> play it, <b>Space</b> pass, <b>Esc</b> cancel. Digits glow <span style="color:#7dffb3">green</span> when low and <span style="color:#ff8a95">red</span> when high.</div>
      </div>`;
  }
  function renderRules() {
    $('#screen-rules').innerHTML = `<div class="page-title">How to play</div><div class="page-sub">Low Roller in 60 seconds.</div>${rulesHTML()}`;
  }

  // ------------------------------------------------------------------ opponents
  const RARITY_WEIGHTS = [
    { common: 75, rare: 25, epic: 0, legendary: 0 },
    { common: 50, rare: 35, epic: 15, legendary: 0 },
    { common: 35, rare: 35, epic: 22, legendary: 8 },
    { common: 25, rare: 30, epic: 28, legendary: 17 },
    { common: 15, rare: 28, epic: 30, legendary: 27 },
  ];
  function makeOpponent(tr) {
    const a = LR.arenaFor(tr), w = RARITY_WEIGHTS[a];
    const deck = [];
    while (deck.length < 3) {
      let roll = Math.random() * 100, rar = 'common';
      for (const r of ['common', 'rare', 'epic', 'legendary']) { if (roll < w[r]) { rar = r; break; } roll -= w[r]; }
      const pool = Object.keys(C).filter((id) => C[id].rarity === rar && !deck.includes(id));
      if (pool.length) deck.push(pick(pool));
    }
    const firstGames = save.wins + save.losses < 2;
    const skill = firstGames ? 0.2 : Math.max(0.2, Math.min(0.93, 0.3 + tr / 1400 + rand(-0.12, 0.12)));
    return {
      name: pick(LR.OPP_NAMES), avatar: pick(LR.OPP_AVATARS),
      trophies: Math.max(0, tr + irand(-40, 40)), deck, profile: LR.AI.makeProfile(skill),
    };
  }

  // ------------------------------------------------------------------ battle
  const ABORT = Symbol('abort');
  let B = null;

  function el(id) { return document.getElementById(id); }

  function buildBattle() {
    const o = B.opp;
    $('#screen-battle').innerHTML = `
      <div class="battle" id="battleRoot">
        <div class="side enemy" id="side1">
          <div class="side-head">
            <div class="avatar">${o.avatar}</div>
            <div class="who"><div class="nm">${o.name}</div>
              <div class="tr">${o.boss ? '👑 BOSS' : `🏆 ${o.trophies}`} <span class="thinking"><i></i><i></i><i></i></span></div></div>
            <div class="pips" id="pips1"></div>
            <div class="enemy-hand" id="hand1"></div>
          </div>
          <div class="enemy-row2">
            <div class="reels-row" id="reels1"></div>
            <div class="hotbar small" id="hot1"></div>
          </div>
        </div>
        <div class="midline">
          <button class="quit" id="quitBtn" title="Forfeit">✕</button>
          <div class="round-lbl" id="roundLbl">Round 1</div>
          <div class="wdots" id="wdots"><i></i><i></i><i></i></div>
          <div class="feed" id="feed"></div>
        </div>
        <div class="side player" id="side0">
          <div class="reels-row" id="reels0"></div>
          <div class="player-row2">
            <div class="pips" id="pips0"></div>
            <div class="hotbar" id="hot0"></div>
            <div class="turn-tag">YOUR MOVE!</div>
          </div>
          <div class="hand-row">
            <div class="hand" id="hand0"></div>
            <button class="pass-btn" id="passBtn" disabled><div class="ring" id="ring"></div>PASS<small>space</small></button>
          </div>
        </div>
      </div>`;
    B.reels = [[], []];
    for (let p = 0; p < 2; p++) {
      const row = el(`reels${p}`);
      row.innerHTML = `<div class="reels"></div><div class="total" id="tot${p}"><span class="lbl">TOTAL</span><b>–</b><small></small></div>`;
      for (let c = 0; c < 3; c++) {
        const r = new LR.Reel(p, c);
        r.el.addEventListener('click', (ev) => { ev.stopPropagation(); onReelClick(p, c); });
        row.firstChild.appendChild(r.el);
        B.reels[p][c] = r;
      }
      el(`hot${p}`).innerHTML = `<div class="count">0</div><div class="segs">${'<div class="seg"></div>'.repeat(10)}</div>`;
    }
    el('passBtn').onclick = (ev) => { ev.stopPropagation(); humanPass(); };
    el('quitBtn').onclick = (ev) => { ev.stopPropagation(); askForfeit(); };
    el('battleRoot').onclick = () => { if (B && B.sel !== null) { B.sel = null; renderHands(); clearTargets(); } };
    B.shownHot = [0, 0];
    renderPips(); renderHot(); renderHands(); renderMid();
  }

  function renderPips() {
    for (let p = 0; p < 2; p++) {
      const box = el(`pips${p}`);
      const want = [0, 1, 2].map((k) => (k < B.s.score[p] ? 'on' : ''));
      if (box.children.length !== 3) box.innerHTML = '<i class="pip"></i>'.repeat(3);
      [...box.children].forEach((pp, k) => { if (pp.classList.contains('on') !== !!want[k]) pp.className = `pip ${want[k]}`; });
    }
  }

  function renderHot() {
    const s = B.s;
    for (let p = 0; p < 2; p++) {
      const bar = el(`hot${p}`);
      if (!bar) continue;
      const h = s.hot[p], prev = B.shownHot[p];
      bar.querySelector('.count').textContent = h;
      const cost = p === 0 && B.sel !== null ? E.cardOf(s, 0, B.sel).cost : 0;
      [...bar.querySelectorAll('.seg')].forEach((seg, k) => {
        seg.classList.toggle('on', k < h);
        seg.classList.toggle('new', k < h && k >= prev);
        seg.classList.toggle('cost', k < h && k >= h - cost);
      });
      if (h > prev) S.hotdog();
      B.shownHot[p] = h;
    }
  }

  function renderHands() {
    const s = B.s;
    const h0 = el('hand0'), h1 = el('hand1');
    if (!h0) return;
    const myTurn = !!B.resolve;
    h0.classList.toggle('my-turn', myTurn);
    h0.innerHTML = '';
    s.decks[0].forEach((id, i) => {
      const why = E.whyNot(s, 0, i);
      const card = C[id];
      const needsTarget = card.target !== null;
      const d = cardEl(id, {
        extra: `<div class="tag u">USED</div><div class="tag go">${needsTarget ? 'PICK A REEL' : 'TAP TO PLAY'}</div>`,
      });
      if (s.used[0][i]) d.classList.add('used');
      else if (!why) d.classList.add('playable');
      else if (s.hot[0] < card.cost) d.classList.add('poor');
      else d.classList.add('blocked');
      if (B.sel === i) d.classList.add('selected');
      d.title = why || card.desc;
      d.onclick = (ev) => { ev.stopPropagation(); onCardClick(i); };
      h0.appendChild(d);
    });
    h1.innerHTML = '';
    s.decks[1].forEach((id, i) => {
      const d = cardEl(id, { mini: true, extra: '<div class="tag">USED</div>' });
      if (s.used[1][i]) d.classList.add('used');
      d.title = `${C[id].name} (${C[id].cost}🌭): ${C[id].desc}`;
      h1.appendChild(d);
    });
    renderHot();
  }

  function renderMid() {
    const s = B.s;
    el('roundLbl').textContent = `Round ${Math.max(1, s.round)}`;
    [...el('wdots').children].forEach((d, k) => d.classList.toggle('on', k < s.landed));
  }

  function renderTotals(bump) {
    const s = B.s;
    const t = [E.total(s, 0), E.total(s, 1)];
    for (let p = 0; p < 2; p++) {
      const box = el(`tot${p}`);
      const b = box.querySelector('b');
      const txt = s.landed ? String(t[p]) : '–';
      if (b.textContent !== txt) {
        b.textContent = txt;
        if (bump) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
      }
      box.querySelector('small').textContent = s.landed < 3 && s.landed > 0 ? `+ ${3 - s.landed} to land` : s.landed === 0 ? 'spinning…' : '';
      box.classList.toggle('leading', s.landed > 0 && t[p] < t[1 - p]);
    }
  }

  function setFeed(text, who) {
    const f = el('feed');
    if (!f) return;
    f.innerHTML = '';
    const sp = document.createElement('span');
    sp.className = who === 0 ? 'me' : who === 1 ? 'them' : '';
    sp.textContent = text;
    f.appendChild(sp);
  }

  function setActive(p) {
    el('side0').classList.toggle('active', p === 0);
    el('side1').classList.toggle('active', p === 1);
  }

  // ---------- human input
  function onCardClick(i) {
    if (!B || B.over) return;
    const s = B.s;
    if (!B.resolve) { S.deny(); toast(s.used[0][i] ? 'Already used this round' : "Wait for your turn"); return; }
    const why = E.whyNot(s, 0, i);
    if (why) { S.deny(); toast(why); return; }
    const card = E.cardOf(s, 0, i);
    if (B.sel === i) {
      if (card.target === null) return commit({ type: 'play', i, target: null });
      toast('Tap one of the glowing reels');
      return;
    }
    S.select();
    B.sel = i;
    renderHands();
    clearTargets();
    if (card.target !== null) {
      for (const t of E.targets(s, 0, i)) B.reels[t.side][t.col].el.classList.add('targetable');
    }
  }

  function onReelClick(p, c) {
    if (!B || !B.resolve || B.sel === null) return;
    const t = E.targets(B.s, 0, B.sel).find((x) => x && x.side === p && x.col === c);
    if (!t) { S.deny(); return; }
    commit({ type: 'play', i: B.sel, target: t });
  }

  function clearTargets() {
    if (!B || !B.reels) return;
    B.reels.flat().forEach((r) => r.el.classList.remove('targetable'));
  }

  function humanPass() {
    if (!B || !B.resolve) return;
    commit({ type: 'pass' });
  }

  function commit(act) {
    const r = B.resolve;
    if (!r) return;
    B.resolve = null;
    B.sel = null;
    clearInterval(B.timerId);
    clearTargets();
    el('passBtn').disabled = true;
    el('ring').style.setProperty('--t', 0);
    r(act);
  }

  function humanTurn() {
    const s = B.s;
    if (B.autoplay) {
      return sleep(300).then(() => LR.AI.decide(s, 0, LR.AI.makeProfile(0.9)));
    }
    if (!E.anyPlayable(s, 0)) {
      setFeed(s.hot[0] < 1 ? 'Out of hotdogs — auto pass' : 'No plays available — auto pass', 0);
      return sleep(750).then(() => ({ type: 'pass' }));
    }
    S.turn();
    return new Promise((res) => {
      B.resolve = res;
      B.sel = null;
      renderHands();
      el('passBtn').disabled = false;
      const t0 = Date.now();
      let lastSec = 99;
      const ring = el('ring');
      const tick = () => {
        const left = TURN_MS - (Date.now() - t0);
        ring.style.setProperty('--t', Math.max(0, left / TURN_MS));
        ring.classList.toggle('low', left < 5000);
        const sec = Math.ceil(left / 1000);
        if (left < 5000 && sec !== lastSec && sec > 0) { lastSec = sec; S.tick(); }
        if (left <= 0) { toast("Time's up — passed"); commit({ type: 'pass' }); }
      };
      tick();
      B.timerId = setInterval(tick, 100);
    });
  }

  async function aiTurn() {
    await wait(rand(650, 1250));
    return LR.AI.decide(B.s, 1, B.opp.profile);
  }

  // Sleep that bails out of the battle loop if the player forfeits.
  async function wait(x) {
    await sleep(x);
    if (!B || B.aborted) throw ABORT;
  }

  // ---------- animation of a played ability
  function describe(entry) {
    const c = C[entry.card];
    const who = entry.p === 0 ? 'You' : B.opp.name;
    let txt = `${who} played ${c.icon} ${c.name}`;
    if (entry.target) {
      txt += ` on ${entry.target.side === 0 ? 'your' : 'their'} ${ORD[entry.target.col]} reel`;
    }
    if (entry.card === 'rewind') txt += ` — ${C[entry.undid].name} undone!`;
    if (entry.card === 'thief') txt += ` (${Math.abs(entry.hotFx[1 - entry.p])} 🌭 stolen)`;
    if (entry.card === 'snack') txt += ` (+${entry.hotFx[entry.p]} 🌭)`;
    if (entry.card === 'lucky') txt += ` — next reel lands 0–4`;
    if (entry.card === 'hex') txt += ` — next reel lands 5–9`;
    return txt;
  }

  async function castCard(p, i, id) {
    const src = el(`hand${p}`).children[i];
    const r = src.getBoundingClientRect();
    const root = el('battleRoot').getBoundingClientRect();
    const cx = root.left + root.width / 2, cy = root.top + root.height * 0.47;
    const wrap = document.createElement('div');
    wrap.className = 'cast';
    wrap.appendChild(cardEl(id));
    const nm = document.createElement('div');
    nm.className = 'cast-name';
    nm.textContent = `${C[id].name}!`;
    nm.style.color = p === 0 ? 'var(--mustard)' : 'var(--ketchup)';
    wrap.appendChild(nm);
    wrap.style.left = `${cx}px`;
    wrap.style.top = `${cy}px`;
    wrap.style.transform = 'translate(-50%,-50%)';
    document.body.appendChild(wrap);
    const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
    try {
      wrap.animate([
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${p === 0 ? 1 : 0.6})`, opacity: 0.5 },
        { transform: 'translate(-50%,-50%) scale(1.25) rotate(-3deg)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%,-50%) scale(1.18) rotate(0deg)', opacity: 1, offset: 0.78 },
        { transform: 'translate(-50%,-50%) scale(1.45)', opacity: 0 },
      ], { duration: ms(1150), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    } catch (e) { /* no WAAPI: the card just appears */ }
    setTimeout(() => wrap.remove(), ms(1200));
    if (p === 1) { src.classList.add('flash'); setTimeout(() => src.classList.remove('flash'), 800); }
    await wait(650);
  }

  async function animatePlay(entry, prev) {
    const s = B.s, card = C[entry.card], p = entry.p;
    S.whoosh();
    renderHands();
    await castCard(p, entry.i, entry.card);
    setFeed(describe(entry), p);
    if (entry.card === 'rewind') { S.rewind(); flashScreen('rgba(90,200,250,.35)'); }
    else if (card.cost >= 5) { S.big(); shake(el('battleRoot')); flashScreen(p === 0 ? 'rgba(255,200,61,.3)' : 'rgba(255,75,92,.3)'); }
    const jobs = [];
    let anyGood = false, anyBad = false;
    for (let q = 0; q < 2; q++) {
      for (let c = 0; c < 3; c++) {
        const reel = B.reels[q][c];
        const from = prev.digits[q][c], to = s.digits[q][c];
        if (from !== to && to !== null) {
          const scramble = !!card.random;
          jobs.push(reel.change(to, ms(scramble ? 900 : 380 + Math.abs(to - from) * 70), scramble).then(() => {
            const delta = to - from;
            const goodForMe = (q === 0) === (delta < 0);
            if (goodForMe) anyGood = true; else anyBad = true;
            reel.flash(delta < 0 ? 'hit-good' : 'hit-bad');
            floater(reel.el, `${delta > 0 ? '+' : ''}${delta}`, delta < 0 ? 'good' : 'bad');
            renderTotals(true);
          }));
        }
        if (prev.mods[q][c] !== s.mods[q][c]) reel.setMod(s.mods[q][c]);
        if (prev.frozen[q][c] !== s.frozen[q][c]) { reel.setFrozen(s.frozen[q][c]); if (s.frozen[q][c]) reel.flash('landed'); }
      }
    }
    for (let q = 0; q < 2; q++) {
      const d = s.hot[q] - prev.hot[q] + (q === p ? card.cost : 0);
      if (d) floater(el(`hot${q}`).querySelector('.count'), `${d > 0 ? '+' : ''}${d} 🌭`, (d > 0) === (q === 0) ? 'good' : 'bad');
    }
    await Promise.all(jobs);
    if (jobs.length) (anyGood && !anyBad ? S.good : anyBad && !anyGood ? S.bad : S.click)();
    renderHands();
    renderTotals(false);
    await wait(550);
  }

  // ---------- flow
  async function runWindow() {
    const s = B.s;
    for (;;) {
      const p = s.actor;
      setActive(p);
      if (p === 1) setFeed(`${B.opp.name} is thinking…`, 1);
      else if (s.log.length && s.log[s.log.length - 1].type === 'pass') setFeed(`${B.opp.name} passed — your move`, 0);
      else if (!s.log.length) setFeed('Your move — play an ability or pass', 0);
      const act = p === 0 ? await humanTurn() : await aiTurn();
      if (!B || B.aborted) throw ABORT;
      if (act.type === 'pass') {
        S.pass();
        const closed = E.pass(s, p);
        if (p === 0) setFeed('You passed', 0);
        if (closed) { setFeed(s.landed < 3 ? 'Both passed — next reel!' : 'Both passed — showdown!', null); break; }
        if (p === 1) await wait(250);
      } else {
        const prev = { digits: s.digits.map((r) => r.slice()), mods: s.mods.map((r) => r.slice()), frozen: s.frozen.map((r) => r.slice()), hot: s.hot.slice() };
        const entry = E.play(s, p, act.i, act.target);
        await animatePlay(entry, prev);
      }
    }
    setActive(null);
    renderHands();
  }

  async function playRound() {
    const s = B.s;
    E.newRound(s);
    B.sel = null;
    renderMid(); renderHands(); renderPips();
    B.reels.flat().forEach((r) => { r.setMod(null); r.setFrozen(false); r.spin(); });
    renderTotals(false);
    [0, 1].forEach((p) => el(`tot${p}`).classList.remove('winner', 'loser'));
    const matchPoint = s.score.includes(E.WIN_ROUNDS - 1);
    banner(`ROUND ${s.round}`, 'white', matchPoint ? 'match point!' : `first to ${E.WIN_ROUNDS} wins`);
    setFeed('Reels spinning…', null);
    await wait(1300);
    for (let c = 0; c < 3; c++) {
      await wait(c === 0 ? 150 : 350);
      E.landColumn(s);
      const dur = 1050 + c * 180;
      B.reels[0][c].land(s.digits[0][c], ms(dur), true);
      setTimeout(() => B && B.reels && B.reels[1][c].land(s.digits[1][c], ms(dur), false), ms(160));
      setTimeout(() => S.land(), ms(dur));
      await wait(dur + 220);
      B.reels[0][c].setMod(null); B.reels[1][c].setMod(null);
      renderTotals(true);
      E.startWindow(s);
      renderMid(); renderHands();
      await runWindow();
    }
    await showdown();
  }

  async function showdown() {
    const s = B.s;
    const r = E.endRound(s);
    const [t0, t1] = [el('tot0'), el('tot1')];
    t0.classList.remove('leading'); t1.classList.remove('leading');
    if (r.winner === 0) { t0.classList.add('winner'); t1.classList.add('loser'); banner('ROUND WON!', 'green', `${r.totals[0]} beats ${r.totals[1]}`); S.win(); }
    else if (r.winner === 1) { t1.classList.add('winner'); t0.classList.add('loser'); banner('ROUND LOST', 'red', `${r.totals[1]} beats ${r.totals[0]}`); S.lose(); }
    else { banner('PUSH!', 'white', `tied at ${r.totals[0]} — no point`); S.pass(); }
    setFeed(r.winner === 0 ? 'You take the round!' : r.winner === 1 ? `${B.opp.name} takes the round` : 'Tie — nobody scores', r.winner);
    renderPips();
    await wait(2100);
  }

  async function startBattle({ boss }) {
    const opp = boss
      ? { ...LR.BOSS, deck: [...LR.BOSS.deck], profile: LR.AI.makeProfile(LR.BOSS.profile.skill) }
      : makeOpponent(save.trophies);
    const s = E.newMatch([save.deck.slice(), opp.deck.slice()], Math.random() < 0.5 ? 0 : 1);
    B = { s, opp, boss, sel: null, resolve: null, reels: null, aborted: false, autoplay: window.__LR_AUTOPLAY || false };
    const mine = B;
    show('battle');
    buildBattle();
    B.reels.flat().forEach((r) => r.showUnknown());
    setFeed(`${opp.name} ${opp.boss ? 'wants to see your best' : 'joins the table'}`, 1);
    banner(boss ? '👑 BOSS FIGHT' : 'BATTLE!', boss ? '' : 'white', `vs ${opp.name}`, 1500);
    try {
      await wait(1500);
      while (!s.over) await playRound();
      await wait(300);
      finishMatch(s.winner === 0);
    } catch (e) {
      if (e !== ABORT) throw e;
      if (mine.forfeit) finishMatch(false, true);
    }
  }

  function askForfeit() {
    modal(`<h2>Forfeit?</h2><p style="text-align:center;color:var(--muted);font-weight:700;margin-top:8px">Leaving counts as a loss.</p>
      <div class="actions"><button class="btn ghost small" id="mStay">Keep playing</button><button class="btn red small" id="mQuit">Forfeit</button></div>`, (m) => {
      $('#mStay', m).onclick = closeModal;
      $('#mQuit', m).onclick = () => {
        closeModal();
        if (!B) return;
        B.forfeit = true; B.aborted = true;
        if (B.resolve) { const r = B.resolve; B.resolve = null; clearInterval(B.timerId); r({ type: 'pass' }); }
      };
    });
  }

  function finishMatch(won, forfeited = false) {
    const s = B.s, opp = B.opp, boss = B.boss;
    const before = { coins: save.coins, trophies: save.trophies };
    let coins, trophies = 0, note = '';
    const a = LR.arenaFor(save.trophies);
    if (boss) {
      coins = won ? (save.bossWins ? 120 : 300) : 15;
      if (won) { save.bossWins++; note = save.bossWins === 1 ? 'First boss win — huge payday!' : 'The Golden Frank bows again.'; }
      else note = 'The Golden Frank has Rewind too — bait it out first.';
    } else if (won) {
      coins = 40 + a * 10;
      trophies = irand(27, 33);
    } else {
      coins = forfeited ? 0 : 10;
      trophies = -Math.min(save.trophies, irand(17, 22));
    }
    const underdog = won && deckPower(opp.deck) - deckPower(save.deck) >= 2;
    if (underdog) { coins += 20; save.underdogWins++; note = 'Underdog win! Your weaker deck beat a stronger one (+20 🪙)'; }
    save.coins += coins;
    save.trophies = Math.max(0, save.trophies + trophies);
    save.bestTrophies = Math.max(save.bestTrophies, save.trophies);
    if (won) save.wins++; else save.losses++;
    persist();
    const newArena = LR.arenaFor(save.trophies) > a;
    if (newArena) note = `New arena unlocked: ${LR.ARENAS[LR.arenaFor(save.trophies)].icon} ${LR.ARENAS[LR.arenaFor(save.trophies)].name}!`;

    if (won) { S.fanfare(); rain(['🌭', '🌭', '🪙', '🏆'], 50); } else S.lose();
    setActive(null);
    modal(`
      <div class="result">
        <div class="big ${won ? 'win' : 'lose'}">${won ? 'VICTORY!' : forfeited ? 'FORFEIT' : 'DEFEAT'}</div>
        <div class="score">${s.score[0]} – ${s.score[1]} <span style="color:var(--muted);font-size:.7em">vs ${opp.name}</span></div>
        <div class="rewards">
          <div class="reward"><b id="rwCoins">+0</b><span>🪙 coins</span></div>
          ${boss ? '' : `<div class="reward"><b id="rwTr">${trophies >= 0 ? '+' : ''}0</b><span>🏆 trophies</span></div>`}
        </div>
        ${note ? `<div class="note">${note}</div>` : ''}
        <div class="actions">
          <button class="btn ghost small" id="mHome">Home</button>
          <button class="btn small" id="mAgain">${boss ? 'Fight again' : 'Next battle'}</button>
        </div>
      </div>`, (m) => {
      countUp($('#rwCoins', m), 0, coins, 900);
      if (!boss) { const t = $('#rwTr', m); const k = trophies; countUp(t, 0, k, 900); if (k >= 0) setTimeout(() => { t.textContent = `+${k}`; }, 950); }
      setTimeout(() => { $('#rwCoins', m).textContent = `+${coins}`; }, 950);
      for (let k = 0; k < Math.min(8, Math.ceil(coins / 10)); k++) S.coin(0.15 + k * 0.09);
      $('#mHome', m).onclick = () => { closeModal(); B = null; show('home'); renderTop(before); };
      $('#mAgain', m).onclick = () => { closeModal(); startBattle({ boss }); renderTop(); };
    });
    renderTop();
  }

  // ------------------------------------------------------------------ boot
  document.querySelectorAll('#tabbar button').forEach((b) => (b.onclick = () => { S.click(); deckPick = { card: null, slot: null }; show(b.dataset.tab); }));
  $('#muteBtn').onclick = () => { save.muted = !save.muted; S.setMuted(save.muted); persist(); renderTop(); };
  $('#modalBg').addEventListener('click', (e) => { if (e.target.id === 'modalBg' && !B) closeModal(); });
  window.addEventListener('keydown', (e) => {
    if (!B || current !== 'battle' || $('#modalBg').classList.contains('show')) return;
    if (['1', '2', '3'].includes(e.key)) onCardClick(+e.key - 1);
    else if (e.key === ' ' || e.key === 'p') { e.preventDefault(); humanPass(); }
    else if (e.key === 'Enter' && B.sel !== null) onCardClick(B.sel);
    else if (e.key === 'Escape' && B.sel !== null) { B.sel = null; renderHands(); clearTargets(); }
  });
  S.setMuted(save.muted);
  show('home');
  if (!save.seenHelp) {
    modal(`<h2>Welcome to Low Roller!</h2>${rulesHTML()}<div class="actions"><button class="btn" id="mGo">Let's roll</button></div>`, (m) => {
      $('#mGo', m).onclick = () => { save.seenHelp = true; persist(); closeModal(); };
    });
  }

  // Debug / test hook.
  window.__LR = {
    get B() { return B; }, get save() { return save; },
    speed(x) { SPEED = x; },
    autoplay(on) { window.__LR_AUTOPLAY = on; if (B) B.autoplay = on; },
    start(boss = false) { return startBattle({ boss }); },
    reset() { localStorage.removeItem(SAVE_KEY); save = load(); show('home'); },
    give(coins) { save.coins += coins; persist(); renderTop(); },
  };
})();
