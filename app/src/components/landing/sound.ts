/**
 * Gestion sonore de la landing : sons UI generes en WebAudio (aucun asset)
 * et lecteur de previews avec fondus. L'AudioContext n'est cree qu'apres le
 * geste utilisateur d'entree (contrainte navigateur).
 */
export class LandingSoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastBlipAt = 0;

  enabled = false;

  /**
   * Debloque l'audio sur le geste d'entree et memorise la preference.
   * @param enabled Son actif ou non.
   */
  unlock(enabled: boolean) {
    this.enabled = enabled;

    if (!enabled || typeof window === "undefined") {
      return;
    }

    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!Ctor) {
        return;
      }

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }

    void this.ctx.resume();
  }

  /**
   * Active/desactive le son UI (et debloque le contexte au besoin).
   * @param enabled Nouvel etat.
   */
  setEnabled(enabled: boolean) {
    if (enabled) {
      this.unlock(true);
      return;
    }

    this.enabled = false;
  }

  /**
   * Joue un petit blip UI (survol, clic).
   * @param frequency Frequence en Hz.
   * @param duration Duree en secondes.
   * @param volume Volume relatif 0..1.
   */
  blip(frequency = 880, duration = 0.05, volume = 0.1) {
    if (!this.enabled || !this.ctx || !this.master) {
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Blip discret de survol, limite en cadence. */
  hoverBlip() {
    const now = performance.now();

    if (now - this.lastBlipAt < 70) {
      return;
    }

    this.lastBlipAt = now;
    this.blip(1240, 0.035, 0.045);
  }

  /** Signature sonore jouee a l'entree dans l'experience. */
  enterSequence() {
    if (!this.enabled || !this.ctx || !this.master) {
      return;
    }

    const now = this.ctx.currentTime;
    const notes = [110, 220, 330, 440];

    notes.forEach((frequency, index) => {
      if (!this.ctx || !this.master) {
        return;
      }

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + index * 0.09;

      osc.type = index === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(frequency * 0.985, start);
      osc.frequency.exponentialRampToValueAtTime(frequency, start + 0.2);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.9);
    });
  }
}

/**
 * Lecteur de preview audio avec fondu d'entree/sortie.
 * Utilise un HTMLAudioElement (streaming) et un tween de volume rAF.
 */
export class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private fadeFrame = 0;
  private targetVolume = 0;

  currentUrl: string | null = null;

  /**
   * Lance la lecture d'une preview en fondu (coupe la precedente).
   * @param url URL presignee du fichier audio.
   * @param volume Volume cible 0..1.
   */
  play(url: string, volume = 0.85) {
    if (this.currentUrl === url && this.audio && !this.audio.paused) {
      this.fadeTo(volume);
      return;
    }

    this.release();

    const audio = new Audio(url);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;

    this.audio = audio;
    this.currentUrl = url;

    void audio.play().catch(() => {
      // Lecture refusee (autoplay/reseau) : on libere sans bruit.
      if (this.audio === audio) {
        this.release();
      }
    });

    this.fadeTo(volume);
  }

  /** Coupe la preview courante en fondu de sortie. */
  stop() {
    if (!this.audio) {
      return;
    }

    const audio = this.audio;

    this.currentUrl = null;
    this.fadeTo(0, () => {
      audio.pause();
      audio.src = "";

      if (this.audio === audio) {
        this.audio = null;
      }
    });
  }

  /** Liberation immediate sans fondu (unmount). */
  release() {
    cancelAnimationFrame(this.fadeFrame);

    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }

    this.currentUrl = null;
  }

  /**
   * Tween de volume vers une cible.
   * @param target Volume cible 0..1.
   * @param onDone Callback en fin de fondu.
   */
  private fadeTo(target: number, onDone?: () => void) {
    cancelAnimationFrame(this.fadeFrame);
    this.targetVolume = target;

    const step = () => {
      const audio = this.audio;

      if (!audio) {
        onDone?.();
        return;
      }

      const delta = this.targetVolume - audio.volume;

      if (Math.abs(delta) < 0.02) {
        audio.volume = this.targetVolume;
        onDone?.();
        return;
      }

      audio.volume += delta * 0.16;
      this.fadeFrame = requestAnimationFrame(step);
    };

    this.fadeFrame = requestAnimationFrame(step);
  }
}
