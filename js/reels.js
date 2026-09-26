// Low Roller — slot-machine reel widget. Digits roll downward and land with a little overshoot.
// Timing is setTimeout-driven (not transitionend) so game flow never stalls on a hidden tab.
LR.Reel = class Reel {
  constructor(side, col) {
    this.side = side; this.col = col; this.value = null;
    this.el = document.createElement('div');
    this.el.className = `reel side-${side}`;
    this.el.innerHTML = `<div class="strip"></div><div class="shade"></div><div class="badge"></div><div class="ice"></div>`;
    this.strip = this.el.querySelector('.strip');
    this.badge = this.el.querySelector('.badge');
    this.showUnknown();
  }

  static cell(d) { return `<div class="cell d${d}">${d}</div>`; }
  static rnd() { return Math.floor(Math.random() * 10); }

  fill(list) { this.strip.innerHTML = list.map((d) => LR.Reel.cell(d)).join(''); }

  // Shows cell index i in the middle of the window.
  pos(i, dur = 0, ease = 'linear') {
    this.strip.style.transition = dur ? `transform ${dur}ms ${ease}` : 'none';
    this.strip.style.transform = `translateY(calc(var(--h) * ${-i} + var(--h) * 0.25))`;
  }

  showUnknown() {
    this.el.classList.remove('spinning');
    this.value = null;
    this.strip.innerHTML = `<div class="cell"></div><div class="cell unknown">?</div><div class="cell"></div>`;
    this.pos(1);
  }

  spin() {
    this.value = null;
    const list = [];
    for (let k = 0; k < 3; k++) for (let d = 9; d >= 0; d--) list.push(d);
    this.fill(list);
    this.strip.style.transition = 'none';
    this.strip.style.transform = '';
    this.el.classList.add('spinning');
  }

  set(d) {
    this.el.classList.remove('spinning');
    this.value = d;
    this.fill([(d + 1) % 10, d, (d + 9) % 10]);
    this.pos(1);
  }

  // Rolls the strip so `list[1]` ends in the window; list is ordered top -> bottom.
  roll(list, dur, ease, ticks) {
    this.el.classList.remove('spinning');
    this.fill(list);
    const start = list.length - 2;
    this.pos(start);
    void this.strip.offsetHeight; // commit the start position before animating
    this.pos(1, dur, ease);
    if (ticks) {
      const n = start - 1;
      for (let k = 1; k <= n; k++) {
        // ease-out: position p(t) ~ 1-(1-t)^3  =>  t = 1-(1-p)^(1/3)
        const t = 1 - Math.pow(1 - k / n, 1 / 3);
        LR.Sound.tick((t * dur) / 1000);
      }
    }
    return new Promise((res) => setTimeout(res, dur));
  }

  async land(d, dur, ticks) {
    const n = 16 + this.col * 5;
    const list = [Reel.rnd(), d];
    for (let k = 0; k < n; k++) list.push(Reel.rnd());
    await this.roll(list, dur, 'cubic-bezier(.12,.75,.28,1.06)', ticks);
    this.value = d;
    this.flash('landed');
  }

  // Animate from one value to another, stepping through the digits in between (or through random
  // digits when `scramble` is set, e.g. for respins).
  async change(to, dur, scramble) {
    const from = this.value ?? 0;
    const seq = [];
    if (scramble) {
      seq.push(from);
      for (let k = 0; k < 9; k++) seq.push(Reel.rnd());
      seq.push(to);
    } else {
      const step = to > from ? 1 : -1;
      for (let v = from; v !== to; v += step) seq.push(v);
      seq.push(to);
    }
    // seq runs old -> new; the strip is laid out top -> bottom so reverse it.
    const list = [Reel.rnd(), ...seq.reverse(), Reel.rnd()];
    await this.roll(list, dur, 'cubic-bezier(.2,.7,.3,1.1)', false);
    this.value = to;
  }

  flash(cls) {
    this.el.classList.remove(cls);
    void this.el.offsetWidth;
    this.el.classList.add(cls);
    setTimeout(() => this.el.classList.remove(cls), 900);
  }

  setMod(mod) {
    this.el.classList.toggle('mod-lucky', mod === 'lucky');
    this.el.classList.toggle('mod-hex', mod === 'hex');
    this.badge.textContent = mod === 'lucky' ? '🍀 0–4' : mod === 'hex' ? '💀 5–9' : '';
  }
  setFrozen(f) { this.el.classList.toggle('frozen', !!f); }
};
