// Low Roller — tiny synthesized sound kit (no audio files).
LR.Sound = (() => {
  let ctx = null, master = null, muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  function tone(freq, dur, { type = 'sine', vol = 0.5, at = 0, slide = 0, attack = 0.005 } = {}) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { vol = 0.3, at = 0, hp = 1200 } = {}) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + at;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  return {
    get muted() { return muted; },
    setMuted(m) { muted = m; },
    tick(at = 0)  { tone(1800 + Math.random() * 300, 0.025, { type: 'square', vol: 0.05, at }); },
    land()   { tone(180, 0.12, { type: 'triangle', vol: 0.5, slide: -80 }); noise(0.06, { vol: 0.15, hp: 2500 }); },
    click()  { tone(900, 0.05, { type: 'triangle', vol: 0.25 }); },
    select() { tone(660, 0.06, { type: 'triangle', vol: 0.25 }); tone(990, 0.06, { type: 'triangle', vol: 0.2, at: 0.05 }); },
    deny()   { tone(160, 0.14, { type: 'sawtooth', vol: 0.18 }); },
    whoosh() { noise(0.25, { vol: 0.25, hp: 700 }); tone(300, 0.25, { vol: 0.15, slide: 500 }); },
    good()   { tone(523, 0.1, { type: 'triangle', vol: 0.3 }); tone(784, 0.14, { type: 'triangle', vol: 0.3, at: 0.08 }); },
    bad()    { tone(392, 0.12, { type: 'sawtooth', vol: 0.15 }); tone(262, 0.2, { type: 'sawtooth', vol: 0.15, at: 0.1 }); },
    rewind() { tone(1200, 0.35, { type: 'sine', vol: 0.3, slide: -1000 }); noise(0.3, { vol: 0.1, hp: 3000 }); },
    big()    { tone(90, 0.5, { type: 'sine', vol: 0.7, slide: -40 }); noise(0.4, { vol: 0.25, hp: 200 }); },
    hotdog() { tone(700, 0.07, { type: 'sine', vol: 0.2 }); tone(1050, 0.08, { type: 'sine', vol: 0.15, at: 0.05 }); },
    pass()   { tone(440, 0.08, { type: 'sine', vol: 0.15 }); },
    turn()   { tone(880, 0.08, { type: 'sine', vol: 0.25 }); tone(1320, 0.1, { type: 'sine', vol: 0.2, at: 0.07 }); },
    coin(at = 0) { tone(1318, 0.08, { type: 'square', vol: 0.08, at }); tone(1976, 0.12, { type: 'square', vol: 0.08, at: at + 0.06 }); },
    win() { [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.25, { type: 'triangle', vol: 0.35, at: k * 0.11 })); },
    lose() { [392, 349, 311, 262].forEach((f, k) => tone(f, 0.3, { type: 'sawtooth', vol: 0.12, at: k * 0.16 })); },
    fanfare() {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, k) => tone(f, 0.3, { type: 'triangle', vol: 0.3, at: k * 0.12 }));
      noise(0.8, { vol: 0.1, at: 0.8, hp: 4000 });
    },
  };
})();
