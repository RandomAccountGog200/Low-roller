# Low Roller 🌭

Spin three reels — lowest total wins. Outplay bigger decks with hotdogs and brains.

**Play:** https://randomaccountgog200.github.io/Low-roller/

## Modes

- **Battle** – vs AI opponents, climb trophy arenas.
- **Boss Fight** – The Golden Frank.
- **🌐 Play Online** – real-time multiplayer against other people:
  - **Quick match** – paired with anyone else who is searching.
  - **Create room** – get a 5-letter code / invite link to send a friend.
  - **Join** – type a friend's room code (or just open their invite link).

## How multiplayer works

The game is a static site, so there is no game server. Players connect browser-to-browser over
WebRTC using [PeerJS](https://peerjs.com/) (vendored in `js/vendor/`). PeerJS's free public broker only
introduces the two browsers; after that all moves go directly between them.

Both browsers run the same rules engine with a shared random seed (picked by the host), and only
exchange moves. Before each move both sides fingerprint the board; if they ever disagree the match
is voided instead of silently diverging.

To use your own PeerServer instead of the public one, set `window.LR_PEER_OPTS`
(e.g. `{ host, port, path, secure }`) before `js/net.js` loads.

## Hosting on GitHub Pages

`.github/workflows/pages.yml` deploys the site on every push to `main`. If the first run fails
with a Pages error, open **Settings → Pages** in the repo, set **Source** to **GitHub Actions**, and
re-run the workflow.
