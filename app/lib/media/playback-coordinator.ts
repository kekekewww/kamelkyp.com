interface PlaybackRegistration {
  pause: () => void;
  token: symbol;
}

/**
 * Amplitude channel for audio-reactive visuals (docs/motion-system.md §4.5).
 * `analyser` is null when the source cannot be analysed (embed, non-CORS
 * host); consumers then fall back to the state-only envelope.
 */
export interface LevelSource {
  analyser: AnalyserNode | null;
  playing: boolean;
}

export type LevelListener = (source: LevelSource | null) => void;

export class PlaybackCoordinator {
  private activeId: string | null = null;
  private readonly registrations = new Map<string, PlaybackRegistration>();
  private levelId: string | null = null;
  private level: LevelSource | null = null;
  private readonly levelListeners = new Set<LevelListener>();

  register(id: string, pause: () => void): () => void {
    const token = Symbol(id);
    this.registrations.set(id, { pause, token });

    return () => {
      if (this.registrations.get(id)?.token !== token) return;
      this.registrations.delete(id);
      if (this.activeId === id) this.activeId = null;
      if (this.levelId === id) this.setLevelSource(id, null);
    };
  }

  markPlaying(id: string): void {
    if (this.activeId && this.activeId !== id) {
      this.registrations.get(this.activeId)?.pause();
    }
    this.activeId = id;
  }

  markPaused(id: string): void {
    if (this.activeId === id) this.activeId = null;
  }

  stopAll(): void {
    for (const registration of this.registrations.values()) {
      registration.pause();
    }
    this.activeId = null;
    if (this.levelId !== null) this.setLevelSource(this.levelId, null);
  }

  /**
   * Publish the level source of item `id`. `null` clears it (only when `id`
   * still owns the channel, so a newer player is never cleared by an old one).
   */
  setLevelSource(id: string, source: LevelSource | null): void {
    if (source === null) {
      if (this.levelId !== id) return;
      this.levelId = null;
      this.level = null;
    } else {
      this.levelId = id;
      this.level = source;
    }
    for (const listener of this.levelListeners) listener(this.level);
  }

  /** Current level source (null when nothing has played on this page). */
  getLevelSource(): LevelSource | null {
    return this.level;
  }

  /** Subscribe to level-source changes; the listener is called immediately. */
  subscribeLevel(listener: LevelListener): () => void {
    this.levelListeners.add(listener);
    listener(this.level);
    return () => {
      this.levelListeners.delete(listener);
    };
  }
}
