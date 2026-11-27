/**
 * Music playback (presentation layer) on Tone.js.
 *
 * The composition is data (`src/audio/composition.ts`); this file only schedules it. Tone's
 * transport owns the clock, so the track starts where Tone is now — a stage change never
 * replays the notes that elapsed while the menu was open (docs/adr.md D40, which supersedes
 * D32's simulated-time scheduler for the same reason: a paused menu must not queue a burst).
 */

import * as Tone from 'tone';

import type { AudioContextLike } from './sfx.ts';
import { composeTrack, loopLengthMs, notesFor, type TrackSpec } from './composition.ts';

export interface MusicPlayer {
  /** Start (or restart) the track for a stage. Silent when no audio context is unlocked yet. */
  start(levelId: string): void;
  stop(): void;
  playing(): boolean;
  /** Name of the track currently scheduled, for the HUD. */
  trackName(): string | null;
  dispose(): void;
}

export interface MusicPlayerOptions {
  /** The shared AudioContext the pointer gesture unlocked, so music and SFX use one context.
   * Null until a gesture happens, which is when playback stays silent.
   */
  getContext?: () => AudioContextLike | null;
  /** Voice volumes in dB; mixed low so the soundtrack sits under the impact blips. */
  leadVolume?: number;
  bassVolume?: number;
}

export function createMusicPlayer(options: MusicPlayerOptions = {}): MusicPlayer {
  let spec: TrackSpec | null = null;
  let part: Tone.Part | null = null;
  let lead: Tone.PolySynth | null = null;
  let bass: Tone.Synth | null = null;
  let playing = false;

  function buildVoices(context: AudioContextLike): void {
    // Reuse the gesture-unlocked context so one browser gesture covers sound and music.
    Tone.setContext(context as unknown as Parameters<typeof Tone.setContext>[0]);
    if (lead) return;
    lead = new Tone.PolySynth(Tone.Synth, {
      volume: options.leadVolume ?? -16,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.12, sustain: 0.25, release: 0.35 },
    }).connect(Tone.getDestination());
    bass = new Tone.Synth({
      volume: options.bassVolume ?? -22,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.3, release: 0.4 },
    }).connect(Tone.getDestination());
  }

  function clearPart(): void {
    if (part) {
      part.stop();
      part.dispose();
      part = null;
    }
  }

  return {
    start(levelId: string): void {
      // No gesture yet means no context: stay silent rather than fighting the browser policy.
      const context = options.getContext?.();
      if (!context || context.state !== 'running') return;
      buildVoices(context);

      spec = composeTrack(levelId);
      clearPart();
      const transport = Tone.getTransport();
      // In a headless environment Tone has no context, so its transport cannot schedule.
      // Bail out silently rather than claiming a track that will never sound.
      if (typeof transport.start !== 'function') return;
      if (transport.bpm) transport.bpm.value = spec.bpm;
      transport.loop = true;
      transport.loopStart = 0;
      transport.loopEnd = loopLengthMs(spec) / 1000;

      const events = notesFor(spec).map((note) => ({
        time: note.timeMs / 1000,
        note,
      }));
      part = new Tone.Part((time, event) => {
        const voice = event.note.voice === 'bass' ? bass : lead;
        if (!voice) return;
        voice.triggerAttackRelease(event.note.name, event.note.durationMs / 1000, time, event.note.gain);
      }, events);
      part.start(0);
      transport.start();
      playing = true;
    },

    stop(): void {
      clearPart();
      const transport = Tone.getTransport();
      transport.stop?.();
      transport.cancel?.();
      playing = false;
    },

    playing(): boolean {
      return playing;
    },

    trackName(): string | null {
      return spec ? spec.name : null;
    },

    dispose(): void {
      clearPart();
      lead?.dispose();
      bass?.dispose();
      lead = null;
      bass = null;
      playing = false;
    },
  };
}
