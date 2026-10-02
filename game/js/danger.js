// The Danger Room's move list, for the client: how each move of a hero's table is input, its frame data, and a short
// demo that reaches it from a standing start (a trial without a target route, played by the trial pilot,
// sim/trials.js). The demos run in the Danger Room's world, so what they show is what the simulation does.
import { MOVESETS } from './sim/moves/index.js';

const ARROW = { fwd: '→', back: '←', up: '↑', down: '↓' };
// How a move is input, in words
export function moveInput(set, id) {
  const m = set.moves[id], I = m.input, a = d => ARROW[d] ? ARROW[d] + ' ' : '';
  const ci = set.chain.indexOf(id), ai = set.airChain ? set.airChain.indexOf(id) : -1;
  if (m.module) {
    if (I.btn === 'evade') return 'Evade';
    if (I.btn === 'sig') return 'Signature';
    return I.ctx === 'tap' ? 'Power (tap)' : I.ctx === 'hold' ? 'Power (hold, aim, let go)' : '↓ Power in the air';
  }
  if (ci >= 0) return `Attack ×${ci + 1}`;
  if (ai >= 0) return `Attack ×${ai + 1} in the air`;
  if (I.ctx === 'alt') return `Attack ×${set.chain.indexOf(set.alt.at)}, pause, Attack`;
  if (I.ctx === 'hold') return 'Hold Attack';
  if (I.ctx === 'counter') return `${I.btn === 'power' ? 'Power' : 'Attack'} after a perfect Evade`;
  if (I.ctx === 'dash') return 'Attack while running';
  if (I.btn === 'pair') return I.ctx === 'stunned' ? 'Attack + Power by a stunned Sentinel' : `${a(I.dir)}Attack + Power ${I.ctx === 'air' ? 'in the air, ' : ''}beside a Sentinel`;
  if (I.btn === 'power') return `${a(I.dir)}Power (tap)`;
  if (I.btn === 'sig') return `${a(I.dir)}Signature (${m.cost / 100} bar${m.cost > 100 ? 's' : ''})`;
  if (I.ctx === 'air') return `${a(I.dir)}Attack in the air`;
  return `${a(I.dir)}Attack`;
}
// A demo that reaches the move: { inputs, setup } in the trials' notation (sim/trials.js)
export function moveDemo(set, id) {
  const m = set.moves[id], I = m.input, ci = set.chain.indexOf(id), ai = set.airChain ? set.airChain.indexOf(id) : -1;
  const A = n => Array(n).fill('A');
  if (m.module) {
    if (I.btn === 'evade') return { inputs: ['E'] };
    if (I.btn === 'sig') return { inputs: ['S'], setup: { rage: 100 } };   // (Berserk needs its rage)
    return { inputs: I.ctx === 'tap' ? ['P'] : I.ctx === 'hold' ? ['hP'] : ['J', 'dP'] };
  }
  if (ci >= 0) return { inputs: A(ci + 1) };
  if (ai >= 0) return { inputs: ['J', ...A(ai + 1)] };
  if (I.ctx === 'alt') return { inputs: [...A(set.chain.indexOf(set.alt.at)), 'z', 'w' + (set.alt.pause + 2), 'A'] };
  if (I.ctx === 'hold') return { inputs: ['hA'] };
  if (I.ctx === 'counter') return { inputs: ['C', I.btn === 'power' ? 'P' : 'A'] };
  if (I.ctx === 'dash') return { inputs: ['rA'], setup: { dist: 6 } };
  if (I.btn === 'pair') {
    if (I.ctx === 'stunned') return { inputs: ['AP'], setup: { stunned: true } };
    if (I.ctx === 'air') return { inputs: ['uA', 'J', 'AP'] };
    return { inputs: [({ back: 'b', up: 'u' }[I.dir] || '') + 'AP'] };
  }
  const d = { fwd: 'f', back: 'b', up: 'u', down: 'd' }[I.dir] || '';
  if (I.btn === 'power') return { inputs: [d + 'P'] };
  if (I.btn === 'sig') return { inputs: [d + 'S'], setup: { meter: m.cost } };
  if (I.ctx === 'air') return { inputs: ['J', d + 'A'] };
  return { inputs: [d + 'A'] };
}
// The rows of a hero's move list, in the grammar's order
export function moveRows(hero) {
  const set = MOVESETS[hero];
  return Object.entries(set.moves).map(([id, m]) => ({
    id, slot: m.slot, input: moveInput(set, id), module: !!m.module,
    frames: m.module ? '' : `${m.su} / ${m.ac} / ${m.rc}`, react: m.module ? '' : m.react, dmg: m.module ? '' : m.dmg,
  }));
}
