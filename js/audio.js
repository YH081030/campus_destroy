/* ============================================================
 * 音效 —— WebAudio 程序合成，无外部资源
 * ============================================================ */
"use strict";
const Audio = {
  ctx: null, master: null, noiseBuf: null,
  engineOsc: null, engineGain: null, engineFilter: null,
  init(){
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext||window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i=0;i<len;i++) d[i] = Math.random()*2-1;
    } catch(e){ this.ctx = null; }
  },
  resume(){ if (this.ctx && this.ctx.state==="suspended") this.ctx.resume(); },
  noise(dur, gain, filterFreq, type, freqEnd){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type||"lowpass";
    f.frequency.setValueAtTime(filterFreq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t+dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t+dur+0.05);
  },
  tone(freq, dur, gain, type, freqEnd, delay){
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay||0);
    const o = this.ctx.createOscillator();
    o.type = type||"square";
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t+dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t+dur+0.05);
  },
  shot(kind){
    switch(kind){
      case "pistol": case "rifle": case "lmg": case "smg":
        this.noise(0.09, 0.5, 2200, "lowpass", 300); this.tone(160,0.07,0.25,"square",60); break;
      case "shotgun": this.noise(0.25, 0.9, 1200, "lowpass", 150); this.tone(90,0.2,0.4,"square",40); break;
      case "sniper":  this.noise(0.3, 1.0, 2600, "lowpass", 200); this.tone(120,0.25,0.5,"square",40); break;
      case "cannon": case "rocket":
        this.noise(0.5, 1.0, 900, "lowpass", 120); this.tone(70,0.4,0.6,"sawtooth",30); break;
      case "mg": this.noise(0.08, 0.45, 2000, "lowpass", 300); break;
      default: this.noise(0.08, 0.4, 2000, "lowpass", 300);
    }
  },
  explosion(big){
    const s = big ? 1.2 : 0.7;
    this.noise(0.9*s, 1.0, 700, "lowpass", 60);
    this.tone(50, 0.7*s, 0.8, "sine", 25);
    this.noise(0.4*s, 0.5, 3000, "highpass", 300);
  },
  hit(){ this.noise(0.05, 0.35, 900, "bandpass"); },
  hurt(){ this.tone(220,0.2,0.4,"sawtooth",80); this.noise(0.15,0.4,600,"lowpass"); },
  die(){ this.tone(300,0.4,0.4,"sawtooth",60); this.noise(0.4,0.5,500,"lowpass",80); },
  click(){ this.tone(700,0.05,0.2,"square"); },
  buy(){ this.tone(880,0.08,0.25,"square"); this.tone(1320,0.1,0.25,"square",null,0.08); },
  reload(){ this.tone(400,0.06,0.2,"square",300); this.tone(300,0.06,0.2,"square",200,0.1); },
  portalDown(){ this.tone(200,0.8,0.7,"sawtooth",40); this.noise(0.8,0.8,800,"lowpass",60); },
  bossRoar(){ this.tone(80,1.2,0.9,"sawtooth",40); this.noise(1.0,0.6,400,"lowpass",50); this.tone(50,1.0,0.6,"sine",30,0.15); },
  warn(){ this.tone(600,0.15,0.4,"square"); this.tone(450,0.15,0.4,"square",null,0.18); },
  engine(on){
    if (!this.ctx) return;
    if (on && !this.engineOsc){
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 45;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 220;
      this.engineOsc.connect(this.engineFilter); this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.engineGain.gain.linearRampToValueAtTime(0.10, this.ctx.currentTime+0.3);
    } else if (!on && this.engineOsc){
      const o=this.engineOsc,g=this.engineGain;
      g.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime+0.2);
      setTimeout(()=>{ try{o.stop();}catch(e){} o.disconnect(); g.disconnect(); this.engineFilter.disconnect(); }, 250);
      this.engineOsc = this.engineGain = this.engineFilter = null;
    }
  },
  setEngineRpm(r){ // 0..1
    if (this.engineOsc){
      this.engineOsc.frequency.value = 40 + r*90;
      if (this.engineGain) this.engineGain.gain.value = 0.06 + r*0.1;
    }
  },
};
