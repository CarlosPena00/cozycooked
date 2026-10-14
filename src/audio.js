// Thin audio wrapper. Every call is safe: missing sounds, a locked AudioContext or no audio at all just do nothing.
import { SOUNDS, EVENT_SOUNDS, MUSIC_VOLUME } from './data.js';
import { loadSave, writeSave } from './save.js';

let game = null;
const loops = new Map(); // name -> looping sound (cooking sounds)
// Our own copy of the mute setting: with WebAudio, reading game.sound.mute right after setting it still returns
// the old value, which saved the setting inverted.
let muted = false;

// Phaser's WebAudio mute is scheduled (setValueAtTime) and only lands once the AudioContext runs, so before the first
// user gesture game.sound.mute still reads the old value. Setting the gain's current value applies it right away.
function applyMute() {
  game.sound.mute = muted;
  const gain = game.sound.masterMuteNode?.gain;
  if (gain) gain.value = muted ? 0 : 1;
}

export const audio = {
  init(phaserGame) {
    game = phaserGame;
    muted = loadSave().muted;
    applyMute();
  },

  preload(scene) {
    for (const [name, files] of Object.entries(SOUNDS)) scene.load.audio(name, files);
  },

  get muted() {
    return muted;
  },

  toggleMute() {
    if (!game) return;
    muted = !muted;
    applyMute();
    writeSave({ muted });
  },

  play(name, config) {
    try {
      if (game?.cache.audio.exists(name)) game.sound.play(name, config);
    } catch {
      // Audio is a nice-to-have; never let it break the kitchen.
    }
  },

  // Loops the music track if it exists and is not already playing.
  music(name = 'music') {
    try {
      if (!game?.cache.audio.exists(name) || game.sound.get(name)?.isPlaying) return;
      game.sound.play(name, { loop: true, volume: MUSIC_VOLUME });
    } catch {
      // See play().
    }
  },

  // Starts or stops a looping sound (boiling, sizzling) without restarting it every frame.
  loop(name, on, volume = 0.2) {
    try {
      let sound = loops.get(name);
      if (on && !sound && game?.cache.audio.exists(name)) {
        sound = game.sound.add(name, { loop: true, volume });
        loops.set(name, sound);
      }
      if (!sound || on === sound.isPlaying) return;
      if (on) sound.play();
      else sound.stop();
    } catch {
      // See play().
    }
  },

  stopLoops() {
    for (const sound of loops.values()) sound.stop();
  },

  // Plays the sound mapped to each gameplay event a scene emits (EVENT_SOUNDS in data.js).
  // Listeners are removed when the scene shuts down (scene restarts keep the same emitter).
  bind(scene) {
    const handlers = Object.entries(EVENT_SOUNDS).map(([event, [name, volume, rate = 1]]) => [event, () => audio.play(name, { volume, rate })]);
    for (const [event, fn] of handlers) scene.events.on(event, fn);
    scene.events.once('shutdown', () => {
      for (const [event, fn] of handlers) scene.events.off(event, fn);
    });
  },
};
