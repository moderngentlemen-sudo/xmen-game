// Player settings, remembered in this browser where storage is allowed (the game works the same without it).
// Keyboard bindings: each action takes a list of key codes (KeyboardEvent.code, so a binding means the same place
// on any layout). The arrow keys always move too, and Esc, P, H and Enter stay the menu keys.
export const DEFAULT_KEYS = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
  jump: ['Space'], attack: ['KeyJ'], power: ['KeyK'], evade: ['KeyL', 'ShiftLeft', 'ShiftRight'], sig: ['KeyI', 'KeyE'], team: ['KeyU', 'KeyQ'],
};
export const RESERVED_KEYS = ['Escape', 'Enter', 'KeyP', 'KeyH'];
const copyKeys = k => Object.fromEntries(Object.entries(k).map(([a, l]) => [a, [...l]]));
export const SETTINGS = {
  volume: 0.8, music: 0.7, shake: true, impactPanels: true, sfxWords: true, quality: 'high', rumble: true,
  holdToggle: false,   // every hold (Power, Attack charge) can be a toggle instead
  hints: true,         // first-time hints in the HUD band
  clarity: false,      // fewer particles and thinner trails, so a crowded fight stays readable
  reduceFlashing: false,   // no white impact flashes, dimmer hit lights and flashes, gentler distortion
  keys: copyKeys(DEFAULT_KEYS),
};
const KEY = 'xmen-team-edition-settings';
export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k of Object.keys(SETTINGS)) if (k !== 'keys' && k in s && typeof s[k] === typeof SETTINGS[k]) SETTINGS[k] = s[k];
    if (s.keys && typeof s.keys === 'object') for (const a of Object.keys(DEFAULT_KEYS)) {
      const l = s.keys[a];
      if (Array.isArray(l) && l.every(c => typeof c === 'string' && !RESERVED_KEYS.includes(c))) SETTINGS.keys[a] = [...l];
    }
  } catch (e) { /* private window or blocked storage: defaults */ }
}
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch (e) { /* not saved, still applied */ }
}
// Bind a key to an action: it leaves any other action it was on, and replaces the action's keys
export function bindKey(action, code) {
  if (RESERVED_KEYS.includes(code) || !(action in DEFAULT_KEYS)) return false;
  for (const a of Object.keys(SETTINGS.keys)) SETTINGS.keys[a] = SETTINGS.keys[a].filter(c => c !== code);
  SETTINGS.keys[action] = [code];
  saveSettings();
  return true;
}
export function resetKeys() { SETTINGS.keys = copyKeys(DEFAULT_KEYS); saveSettings(); }
// 'KeyJ' → 'J', 'ShiftLeft' → 'Shift', 'ArrowUp' → '↑'
export function keyLabel(code) {
  if (!code) return '—';
  const named = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'Alt Gr',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`' };
  if (named[code]) return named[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}
