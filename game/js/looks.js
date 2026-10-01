// What things look like: hero costume colours, player identity colours, and the colours reserved for threats.
// Enemy tells keep colours no hero effect uses, so a telegraph always reads as a telegraph:
//   standard  white glint            parry it or evade it
//   heavy     Sentinel magenta       a perfect Evade, or get clear
//   unblockable  violet with "!!"    move out of it
export const HOSTILE = '#ff2e7e';
export const TELL = { standard: '#ffffff', heavy: '#ff2e7e', unblockable: '#a64dff' };
export const INK = '#120d1a';
// Player identity: the ground ring, the name tag and the HUD plate (the costumes clash, so identity lives here)
export const PLAYER_COLORS = ['#ffd23f', '#3fd0ff', '#7dff6a', '#ff8a3d'];

// Each hero: costume (base, trim, under), energy (their power's colour), and the look of skin and hair.
// Storm and Psylocke are kept for later versions; this one plays Cyclops, Wolverine and Jean Grey.
export const HERO_LOOKS = {
  cyclops: { name: 'Cyclops', base: '#1f3f8a', trim: '#f2c12e', under: '#1a2442', energy: '#ff3a24', skin: '#e2b896', hair: '#5a3a22', visor: '#ff2a1f' },
  wolverine: { name: 'Wolverine', base: '#f5c518', trim: '#1d4fb8', under: '#1b2a52', energy: '#ff8a1f', skin: '#d9a77f', hair: '#2a1d16', claw: '#eef3f8' },
  jean: { name: 'Jean Grey', base: '#2e9e5b', trim: '#f2c12e', under: '#1d5c37', energy: '#ffb02e', skin: '#f1c7a8', hair: '#c8321e' },
  storm: { name: 'Storm', base: '#22232b', trim: '#e9c46a', under: '#15161c', energy: '#bfe6ff', skin: '#7a4e34', hair: '#f4f6fb' },
  psylocke: { name: 'Psylocke', base: '#2a3a9e', trim: '#c4282f', under: '#1c2266', energy: '#c04dff', skin: '#f0cbb0', hair: '#5b2a8c' },
};
// Power colours on effects: optic red, claw steel with rage orange, Phoenix gold telekinesis, team-up white-gold
export const POWER_COLORS = { optic: '#ff3a24', claws: '#dfe9f5', rage: '#ff8a1f', tk: '#ffb02e', team: '#fff1b8', plain: '#ffffff' };
