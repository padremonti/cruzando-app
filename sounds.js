// ══════════════════════════════════════════════════
// CruzAndo · sounds.js · Web Audio API · v1.0
// Sin dependencias externas. Incluir en todas las páginas.
// ══════════════════════════════════════════════════

(function() {

let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

const S = {

  navTap: () => {
    const c=ctx(),t=c.currentTime,o=c.createOscillator(),g=c.createGain();
    o.type='sine'; o.frequency.setValueAtTime(800,t);
    o.frequency.exponentialRampToValueAtTime(500,t+0.06);
    g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.08);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.1);
  },

  unfold: () => {
    const c=ctx(),t=c.currentTime;
    [0,0.04,0.09].forEach((delay,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type='sine'; const bf=300+i*120;
      o.frequency.setValueAtTime(bf,t+delay);
      o.frequency.exponentialRampToValueAtTime(bf*1.4,t+delay+0.12);
      g.gain.setValueAtTime(0,t+delay);
      g.gain.linearRampToValueAtTime(0.06,t+delay+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.18);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.22);
    });
  },

  fold: () => {
    const c=ctx(),t=c.currentTime;
    [0,0.04].forEach((delay,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type='sine'; const bf=500-i*80;
      o.frequency.setValueAtTime(bf,t+delay);
      o.frequency.exponentialRampToValueAtTime(bf*0.6,t+delay+0.1);
      g.gain.setValueAtTime(0.06,t+delay);
      g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.14);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.16);
    });
  },

  whoosh: () => {
    const c=ctx(),t=c.currentTime,bSz=Math.floor(c.sampleRate*0.18);
    const buf=c.createBuffer(1,bSz,c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<bSz;i++) d[i]=(Math.random()*2-1)*Math.sin((i/bSz)*Math.PI)*Math.exp(-i/(bSz*0.4));
    const src=c.createBufferSource(); src.buffer=buf;
    const f=c.createBiquadFilter(); f.type='bandpass';
    f.frequency.setValueAtTime(800,t); f.frequency.exponentialRampToValueAtTime(200,t+0.18); f.Q.value=0.8;
    const g=c.createGain(); g.gain.setValueAtTime(0.08,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t+0.22);
  },

  drawerOpen: () => {
    const c=ctx(),t=c.currentTime,bSz=Math.floor(c.sampleRate*0.15);
    const buf=c.createBuffer(1,bSz,c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<bSz;i++) d[i]=(Math.random()*2-1)*(i/bSz)*Math.exp(-i/(bSz*0.5));
    const src=c.createBufferSource(); src.buffer=buf;
    const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=600;
    const g=c.createGain(); g.gain.setValueAtTime(0.07,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t+0.2);
    const o=c.createOscillator(),og=c.createGain();
    o.type='sine'; o.frequency.value=440;
    og.gain.setValueAtTime(0.05,t+0.1); og.gain.exponentialRampToValueAtTime(0.001,t+0.3);
    o.connect(og); og.connect(c.destination); o.start(t+0.1); o.stop(t+0.32);
  },

  beadTap: () => {
    const c=ctx(),t=c.currentTime;
    [1,1.5,2.0].forEach((ratio,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type=i===0?'sine':'triangle'; o.frequency.value=520*ratio;
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.08/(i+1),t+0.004);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.35-i*0.05);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.4);
    });
  },

  mysteryClear: () => {
    const c=ctx(),t=c.currentTime;
    [392,494,587].forEach((freq,i)=>{
      const delay=i*0.09,o=c.createOscillator(),g=c.createGain();
      o.type='sine'; o.frequency.value=freq;
      g.gain.setValueAtTime(0,t+delay); g.gain.linearRampToValueAtTime(0.08,t+delay+0.02);
      g.gain.setValueAtTime(0.07,t+delay+0.2); g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.7);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.8);
    });
  },

  playStart: () => {
    const c=ctx(),t=c.currentTime,bSz=Math.floor(c.sampleRate*0.025);
    const buf=c.createBuffer(1,bSz,c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<bSz;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(bSz*0.12));
    const src=c.createBufferSource(); src.buffer=buf;
    const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=500;
    const g=c.createGain(); g.gain.value=0.2;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t+0.03);
  },

  heartTap: () => {
    const c=ctx(),t=c.currentTime;
    [[880,0],[1109,0.07],[880,0.12]].forEach(([freq,delay])=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type='sine'; o.frequency.value=freq;
      g.gain.setValueAtTime(0,t+delay); g.gain.linearRampToValueAtTime(0.09,t+delay+0.01);
      g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.14);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.16);
    });
  },

  reflectionSaved: () => {
    const c=ctx(),t=c.currentTime;
    [[523,0],[659,0.12]].forEach(([freq,delay])=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type='sine'; o.frequency.value=freq;
      g.gain.setValueAtTime(0,t+delay); g.gain.linearRampToValueAtTime(0.07,t+delay+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.35);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.4);
    });
  },

  goalReached: () => {
    const c=ctx(),t=c.currentTime;
    [[523,0],[659,0.1],[784,0.2],[1047,0.35]].forEach(([freq,delay])=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type='triangle'; o.frequency.value=freq;
      g.gain.setValueAtTime(0,t+delay); g.gain.linearRampToValueAtTime(0.1,t+delay+0.02);
      g.gain.setValueAtTime(0.08,t+delay+0.08); g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.3);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.35);
    });
  },

  chestOpen: () => {
    const c=ctx(),t=c.currentTime,bSz=Math.floor(c.sampleRate*0.08);
    const buf=c.createBuffer(1,bSz,c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<bSz;i++) d[i]=(Math.random()*2-1)*(1-i/bSz);
    const src=c.createBufferSource(); src.buffer=buf;
    const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=4000;
    const ng=c.createGain(); ng.gain.value=0.15;
    src.connect(f); f.connect(ng); ng.connect(c.destination); src.start(t); src.stop(t+0.1);
    [[523,0.02],[659,0.1],[784,0.18],[1047,0.28]].forEach(([freq,delay])=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type='sine'; o.frequency.value=freq;
      g.gain.setValueAtTime(0,t+delay); g.gain.linearRampToValueAtTime(0.1,t+delay+0.01);
      g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.6);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.65);
    });
  },

  blockClear: () => {
    const c=ctx(),t=c.currentTime;
    [[392,0],[494,0],[587,0],[784,0.12],[988,0.12]].forEach(([freq,delay])=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type='triangle'; o.frequency.value=freq;
      g.gain.setValueAtTime(0,t+delay); g.gain.linearRampToValueAtTime(0.07,t+delay+0.02);
      g.gain.setValueAtTime(0.06,t+delay+0.1); g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.55);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.6);
    });
  },

  levelClear: () => {
    const c=ctx(),t=c.currentTime;
    [[392,0,'triangle'],[523,0.1,'sine'],[659,0.2,'sine'],
     [784,0.35,'sine'],[1047,0.5,'sine'],[784,0.65,'triangle'],
     [1047,0.8,'sine'],[1047,0.9,'sine']].forEach(([freq,delay,type])=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type=type; o.frequency.value=freq;
      g.gain.setValueAtTime(0,t+delay); g.gain.linearRampToValueAtTime(0.09,t+delay+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.35);
      o.connect(g); g.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.4);
    });
  },

  purchase: () => {
    const c=ctx(),t=c.currentTime,bSz=Math.floor(c.sampleRate*0.04);
    const buf=c.createBuffer(1,bSz,c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<bSz;i++) d[i]=Math.sin(2*Math.PI*4000*i/c.sampleRate)*Math.exp(-i/(bSz*0.08))*0.3;
    const src=c.createBufferSource(); src.buffer=buf;
    const g=c.createGain(); g.gain.value=0.25;
    src.connect(g); g.connect(c.destination); src.start(t); src.stop(t+0.05);
    [[659,0.06],[784,0.14],[1047,0.22]].forEach(([freq,delay])=>{
      const o=c.createOscillator(),og=c.createGain();
      o.type='sine'; o.frequency.value=freq;
      og.gain.setValueAtTime(0,t+delay); og.gain.linearRampToValueAtTime(0.08,t+delay+0.01);
      og.gain.exponentialRampToValueAtTime(0.001,t+delay+0.28);
      o.connect(og); og.connect(c.destination); o.start(t+delay); o.stop(t+delay+0.3);
    });
  },

  cantosSwipe: () => {
    const c=ctx(),t=c.currentTime,o=c.createOscillator(),g=c.createGain();
    o.type='sine'; o.frequency.setValueAtTime(660,t);
    o.frequency.exponentialRampToValueAtTime(440,t+0.12);
    g.gain.setValueAtTime(0.07,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.15);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.17);
  },

};

// API pública
window.CZSound = function(name) {
  if (localStorage.getItem('cruzando_sounds') === 'off') return;
  if (!S[name]) return;
  try { S[name](); } catch(e) {}
};
window.CZS = S;

})();
