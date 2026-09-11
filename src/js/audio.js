/* audio.js — 极简的程序化音效（WebAudio）
   避免带任何二进制音频，全部靠合成器现场生成。
*/
const Audio = (function () {
  let ctx = null;
  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
    }
    return ctx;
  }
  function beep(freq = 440, dur = 0.08, type = "square", vol = 0.06) {
    const c = ensure(); if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(c.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.stop(c.currentTime + dur);
  }
  return {
    spawn:      () => beep(520, 0.06, "square", 0.05),
    build:      () => beep(300, 0.09, "triangle", 0.06),
    skill:      () => { beep(660, 0.09, "square", 0.07); setTimeout(()=>beep(880,0.09,"square",0.06),80); },
    hit:        () => beep(180, 0.03, "sawtooth", 0.03),
    die:        () => beep(120, 0.15, "sawtooth", 0.05),
    win:        () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.12,"square",0.08), i*100)); },
    lose:       () => { [523,440,349,262].forEach((f,i)=>setTimeout(()=>beep(f,0.15,"triangle",0.08), i*120)); },
    energy_full:() => { [880,880,880].forEach((f,i)=>setTimeout(()=>beep(f,0.06,"square",0.06), i*80)); },
    resume:     () => { const c = ensure(); if (c && c.state === "suspended") c.resume(); },
  };
})();

window.Audio2 = Audio;
