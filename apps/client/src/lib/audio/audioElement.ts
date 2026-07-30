let audio: HTMLAudioElement | null = null;

// single <audio> element for the whole app, created once, reused everywhere
export function getAudioElement(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "metadata";
  }
  return audio;
}
