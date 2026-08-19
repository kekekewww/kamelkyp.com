interface PlaybackRegistration {
  pause: () => void;
  token: symbol;
}

export class PlaybackCoordinator {
  private activeId: string | null = null;
  private readonly registrations = new Map<string, PlaybackRegistration>();

  register(id: string, pause: () => void): () => void {
    const token = Symbol(id);
    this.registrations.set(id, { pause, token });

    return () => {
      if (this.registrations.get(id)?.token !== token) return;
      this.registrations.delete(id);
      if (this.activeId === id) this.activeId = null;
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
  }
}
