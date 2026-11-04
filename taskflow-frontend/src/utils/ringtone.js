let context = null;
let timer = null;

// two short tones, like a classic phone ring
const playPattern = () => {
  if (!context) return;
  [0, 0.5].forEach((offset) => {
    const start = context.currentTime + offset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = 480;
    oscillator.connect(gain);
    gain.connect(context.destination);

    // fade in and out so it does not click
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);

    oscillator.start(start);
    oscillator.stop(start + 0.45);
  });
};

export const stopRingtone = () => {
  clearInterval(timer);
  timer = null;
};

export const startRingtone = () => {
  try {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
    }
    context.resume?.(); // browsers start audio "suspended" until the user has clicked on the page
    stopRingtone();
    playPattern();
    timer = setInterval(playPattern, 2500);
  } catch (error) {
    console.error("Could not play the ringtone:", error);
  }
};