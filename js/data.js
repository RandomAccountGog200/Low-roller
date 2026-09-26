// Low Roller — static game data: abilities, rarities, arenas, opponents.
window.LR = window.LR || {};

// target: 'own'   -> pick one of YOUR landed digits
//         'enemy' -> pick one of the ENEMY's landed digits
//         null    -> no target, just play it
LR.CARDS = {
  // ---------- COMMON (starter cards, everyone owns these) ----------
  nudge:   { name: 'Nudge',       icon: '🤏', cost: 1, rarity: 'common', target: 'own',
             desc: '-1 to one of your digits.' },
  jinx:    { name: 'Jinx',        icon: '🧿', cost: 2, rarity: 'common', target: 'enemy',
             desc: '+2 to one enemy digit.' },
  reroll:  { name: 'Reroll',      icon: '🎲', cost: 2, rarity: 'common', target: 'own', random: true,
             desc: 'Respin one of your digits.' },
  rewind:  { name: 'Rewind',      icon: '⏪', cost: 3, rarity: 'common', target: null,
             desc: "Undo the enemy's last ability. Play it right after they do." },

  // ---------- RARE ----------
  lucky:   { name: 'Lucky Charm', icon: '🍀', cost: 3, rarity: 'rare', target: null,
             desc: 'Your next reel lands 0–4.' },
  hex:     { name: 'Hex',         icon: '💀', cost: 3, rarity: 'rare', target: null,
             desc: "The enemy's next reel lands 5–9." },
  freeze:  { name: 'Freeze',      icon: '🧊', cost: 1, rarity: 'rare', target: 'own',
             desc: "Lock one of your digits. Enemy abilities can't touch it this round." },
  snack:   { name: 'Snack Break', icon: '🥤', cost: 0, rarity: 'rare', target: null,
             desc: 'Gain 1 hotdog.' },
  squash:  { name: 'Squash',      icon: '🔨', cost: 3, rarity: 'rare', target: 'own',
             desc: '-3 to one of your digits.' },

  // ---------- EPIC ----------
  heist:   { name: 'Heist',       icon: '🦝', cost: 4, rarity: 'epic', target: 'own',
             desc: 'Swap one of your digits with the enemy digit in the same column.' },
  zero:    { name: 'Zero Out',    icon: '🕳️', cost: 4, rarity: 'epic', target: 'own',
             desc: 'Set one of your digits to 0.' },
  maxout:  { name: 'Max Out',     icon: '📈', cost: 4, rarity: 'epic', target: 'enemy',
             desc: 'Set an enemy digit to 9.' },
  chaos:   { name: 'Chaos Spin',  icon: '🌪️', cost: 3, rarity: 'epic', target: null, random: true,
             desc: 'Respin EVERY landed digit on the board. Frozen ones stay.' },
  thief:   { name: 'Hotdog Thief',icon: '🦹', cost: 3, rarity: 'epic', target: null,
             desc: 'Steal 2 hotdogs from the enemy.' },

  // ---------- LEGENDARY ----------
  jackpot: { name: 'Jackpot',     icon: '💰', cost: 5, rarity: 'legendary', target: null,
             desc: '-3 to ALL of your digits.' },
  tsunami: { name: 'Tsunami',     icon: '🌊', cost: 5, rarity: 'legendary', target: null,
             desc: '+3 to ALL enemy digits.' },
  timewarp:{ name: 'Time Warp',   icon: '⏳', cost: 4, rarity: 'legendary', target: null, random: true,
             desc: 'Respin all your digits and keep the lower of old vs new.' },
  blackhole:{ name: 'Black Hole', icon: '🌀', cost: 8, rarity: 'legendary', target: null,
             desc: 'Set ALL of your digits to 0.' },
};
for (const id in LR.CARDS) LR.CARDS[id].id = id;

LR.RARITY = {
  common:    { label: 'Common',    price: 0,    order: 0 },
  rare:      { label: 'Rare',      price: 150,  order: 1 },
  epic:      { label: 'Epic',      price: 400,  order: 2 },
  legendary: { label: 'Legendary', price: 1000, order: 3 },
};

LR.STARTER_OWNED = ['nudge', 'jinx', 'reroll', 'rewind'];
LR.STARTER_DECK  = ['nudge', 'jinx', 'rewind'];

LR.ARENAS = [
  { min: 0,    name: 'Hot Dog Stand',    icon: '🌭' },
  { min: 150,  name: 'Food Truck Alley', icon: '🚚' },
  { min: 400,  name: 'Ballpark Grill',   icon: '⚾' },
  { min: 750,  name: 'Mustard Mountain', icon: '⛰️' },
  { min: 1200, name: 'The Golden Bun',   icon: '👑' },
];
LR.arenaFor = (t) => {
  let i = 0;
  LR.ARENAS.forEach((a, k) => { if (t >= a.min) i = k; });
  return i;
};

LR.OPP_NAMES = [
  'Frank Furter', 'Relish Rick', 'Mustard Max', 'Bun Voyage', 'Sir Sausage', 'Pickle Pete',
  'Sauerkraut Sam', 'Big Bratwurst', 'Chili Cheese Chad', 'Ketchup Kid', 'Onion Oona',
  'Corn Dog Carl', 'Wiener Wanda', 'Grill Sergeant', 'Deli Dolly', 'Toppings Tom',
  'Sesame Sue', 'Dijon Don', 'Frankie Fries', 'Slaw Dawg', 'Sriracha Rae', 'Bratty Bea',
];
LR.OPP_AVATARS = ['🐶', '🐱', '🦊', '🐸', '🐵', '🐼', '🐯', '🐷', '🐻', '🐨', '🦝', '🐔', '🦄', '🐙'];

LR.BOSS = {
  name: 'The Golden Frank', avatar: '👑', trophies: 9999, boss: true,
  deck: ['blackhole', 'heist', 'rewind'],
  profile: { skill: 0.97 },
};
