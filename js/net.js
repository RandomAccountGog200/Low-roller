// Low Roller — peer-to-peer online play over WebRTC (PeerJS). No game server needed, so it runs
// from a static host like GitHub Pages. PeerJS's free cloud broker only introduces the two
// browsers; after that every message goes straight between them.
//
// Rooms are peer ids: the host claims `lowroller-v1-room-CODE` and the guest dials it.
// Quick match uses one shared id: whoever claims it waits, whoever finds it taken dials it.
// Once matched the host drops off the broker (peer.disconnect keeps the live connection),
// which frees the shared id for the next pair.
LR.Net = (() => {
  const PREFIX = 'lowroller-v2-';
  const QM_ID = `${PREFIX}quickmatch`;
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CONNECT_MS = 12000, SILENT_MS = 20000, PING_MS = 2000;

  // window.LR_PEER_OPTS can point at your own PeerServer (tests, or if the free broker is down).
  const opts = () => ({ debug: 1, ...(window.LR_PEER_OPTS || {}) });
  let pending = null; // the peer we're using while searching / waiting, so cancel() can kill it

  const available = () => typeof window.Peer === 'function';
  const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const netErr = (msg, type) => Object.assign(new Error(msg), { type });

  function openPeer(id) {
    return new Promise((res, rej) => {
      const p = id ? new Peer(id, opts()) : new Peer(opts());
      pending = p;
      const onOpen = () => { p.off('error', onErr); res(p); };
      const onErr = (e) => { p.off('open', onOpen); p.destroy(); rej(e); };
      p.once('open', onOpen);
      p.once('error', onErr);
    });
  }

  function session(conn, peer, role) {
    const s = { role, closed: false, onMessage: null, onClose: null };
    const early = [];
    let last = Date.now();
    const end = () => {
      if (s.closed) return;
      s.closed = true;
      clearInterval(hb);
      try { conn.close(); } catch (e) { /* already gone */ }
      setTimeout(() => { try { peer.destroy(); } catch (e) { /* already gone */ } }, 300);
      if (s.onClose) s.onClose();
    };
    const hb = setInterval(() => {
      if (Date.now() - last > SILENT_MS) return end();
      try { conn.send({ t: 'ping' }); } catch (e) { /* the close handler deals with it */ }
    }, PING_MS);
    conn.on('data', (m) => {
      last = Date.now();
      if (!m || typeof m !== 'object' || m.t === 'ping') return;
      if (s.onMessage) s.onMessage(m); else early.push(m);
    });
    conn.on('close', end);
    conn.on('error', end);
    peer.on('error', (e) => { if (e && e.type !== 'network' && e.type !== 'server-error') end(); });
    s.send = (m) => { if (!s.closed) try { conn.send(m); } catch (e) { /* ignore */ } };
    s.listen = (fn) => { s.onMessage = fn; while (early.length && s.onMessage === fn) fn(early.shift()); };
    s.close = () => { s.onClose = null; end(); };
    if (pending === peer) pending = null;
    return s;
  }

  // Wait on an open peer for the first guest. Later arrivals are told the table is full.
  function waitForGuest(peer) {
    return new Promise((res) => {
      let taken = false;
      peer.on('connection', (c) => {
        c.on('open', () => {
          if (taken) { c.send({ t: 'busy' }); setTimeout(() => c.close(), 400); return; }
          taken = true;
          c.send({ t: 'welcome' });
          peer.disconnect(); // leave the broker (frees the id) but keep this connection
          res(session(c, peer, 'host'));
        });
      });
    });
  }

  async function dial(targetId) {
    const peer = await openPeer();
    return new Promise((res, rej) => {
      let settled = false;
      const fail = (msg, type) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.destroy();
        if (pending === peer) pending = null;
        rej(netErr(msg, type));
      };
      const timer = setTimeout(() => fail("Couldn't reach the other player", 'timeout'), CONNECT_MS);
      peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'Room not found' : 'Connection failed', e.type));
      const c = peer.connect(targetId, { reliable: true, serialization: 'json' });
      c.on('data', (m) => {
        if (settled || !m) return;
        if (m.t === 'busy') return fail('That room is already full', 'busy');
        if (m.t === 'welcome') {
          settled = true;
          clearTimeout(timer);
          peer.disconnect();
          res(session(c, peer, 'guest'));
        }
      });
      c.on('close', () => fail('Connection closed', 'closed'));
    });
  }

  async function hostRoom(onCode) {
    for (let k = 0; k < 5; k++) {
      const code = newCode();
      let peer;
      try { peer = await openPeer(`${PREFIX}room-${code}`); } catch (e) {
        if (e.type === 'unavailable-id') continue;
        throw e;
      }
      onCode(code);
      return waitForGuest(peer);
    }
    throw netErr("Couldn't make a room code, try again", 'unavailable-id');
  }

  const joinRoom = (code) => dial(`${PREFIX}room-${cleanCode(code)}`);

  async function quickMatch(onStatus, isCancelled) {
    for (let k = 0; k < 12 && !isCancelled(); k++) {
      try {
        const peer = await openPeer(QM_ID);
        onStatus('waiting');
        return await waitForGuest(peer);
      } catch (e) {
        if (e.type !== 'unavailable-id') throw e;
      }
      if (isCancelled()) break;
      onStatus('joining');
      try { return await dial(QM_ID); } catch (e) {
        if (!['peer-unavailable', 'busy', 'timeout', 'closed'].includes(e.type)) throw e;
      }
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 1200));
    }
    throw netErr(isCancelled() ? 'Cancelled' : 'Nobody to match with right now, try a room code', 'cancelled');
  }

  function cancel() {
    if (pending) { try { pending.destroy(); } catch (e) { /* ignore */ } pending = null; }
  }

  // Tiny seeded PRNG so both browsers roll the same reels.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return { available, hostRoom, joinRoom, quickMatch, cancel, cleanCode, rng };
})();
