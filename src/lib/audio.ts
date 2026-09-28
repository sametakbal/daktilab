let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, ms: number, gain: number, type: OscillatorType = "sine"): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ac.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + ms / 1000);
}

export const playError = () => tone(160, 120, 0.08, "square");
export const playTick = (accent = false) => tone(accent ? 1500 : 1000, 40, accent ? 0.12 : 0.07);
