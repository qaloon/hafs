/* مشغل التلاوات والمقاطع الصوتية */

export class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.isPlaying = false;
    this.onStatusChange = null;

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      if (this.onStatusChange) this.onStatusChange(true);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      if (this.onStatusChange) this.onStatusChange(false);
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this.onStatusChange) this.onStatusChange(false);
    });
  }

  toggle(url) {
    if (this.isPlaying) {
      this.audio.pause();
    } else if (url) {
      if (this.audio.src !== url) {
        this.audio.src = url;
      }
      this.audio.play().catch(e => console.log('Audio playback prevented:', e));
    }
  }
}
