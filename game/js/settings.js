// Player settings, remembered in this browser where storage is allowed (the game works the same without it).
export const SETTINGS = {
  volume: 0.8, music: 0.7, shake: true, impactPanels: true, sfxWords: true, quality: 'high', rumble: true,
  holdToggle: false,   // every hold (Power, Attack charge) can be a toggle instead
};
const KEY = 'xmen-team-edition-settings';
export function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); for (const k of Object.keys(SETTINGS)) if (k in s && typeof s[k] === typeof SETTINGS[k]) SETTINGS[k] = s[k]; }
  catch (e) { /* private window or blocked storage: defaults */ }
}
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch (e) { /* not saved, still applied */ }
}
