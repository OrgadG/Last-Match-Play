/* Small, locally synthesized foley. No samples, downloads or audio libraries. */
(function(root) {
  'use strict';
  function createSound(env = root) {
    let enabled = true, paused = false, context, master, lastScratch = -Infinity;
    const voices = new Set(), buffers = new Map();
    try { enabled = env.localStorage.getItem('last-match-sound') !== 'off'; } catch {}
    function stop(channel) {
      for (const voice of [...voices]) if (!channel || voice.channel === channel) {
        try { voice.source.stop(); } catch {}
        voice.source.disconnect(); voices.delete(voice);
      }
    }
    function unlock() {
      if (!enabled || paused) return;
      try {
        if (!context) {
          const Context = env.AudioContext || env.webkitAudioContext;
          if (!Context) return;
          context = new Context(); master = context.createGain();
          master.gain.value = .45; master.connect(context.destination);
        }
        if (context.state !== 'running') context.resume().catch(() => {});
      } catch { /* Audio unavailability must never interrupt gameplay. */ }
    }
    function pause() {
      paused = true;
      if (context) { master.gain.value = 0; context.suspend().catch(() => {}); }
    }
    function resume() {
      paused = false;
      if (master) master.gain.value = enabled && !paused ? .45 : 0;
      if (context && enabled) context.resume().catch(() => {});
    }
    function setEnabled(value) {
      enabled = value;
      if (master) master.gain.value = enabled && !paused ? .45 : 0;
      if (!enabled) stop(); else unlock();
      try { env.localStorage.setItem('last-match-sound', enabled ? 'on' : 'off'); } catch {}
    }
    function makeBuffer(kind, computer) {
      const duration = {turn:.18,select:.075,burn:.8,crumble:.13,win:3.6,lose:.3}[kind];
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      let smooth = 0, seed = 719;
      const fanfare = [[0,523.25],[.11,659.25],[.22,783.99],[.35,1046.5],
        [1.12,659.25],[1.24,783.99],[1.35,1174.66],
        [2.12,783.99],[2.24,987.77],[2.35,1046.5],[2.35,1318.51],[2.35,1567.98]];
      for (let i=0;i<data.length;i++) {
        const t=i/context.sampleRate, progress=t/duration;
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const noise=seed/2147483648-1;
        smooth = smooth*.75 + noise*.25;
        const edge = Math.min(1,t/.008) * Math.min(1,(duration-t)/.035);
        let value=0;
        if(kind==='turn') value=Math.sin(2*Math.PI*(computer?660:440)*t)*.055*Math.exp(-progress*5);
        if(kind==='select') value=(noise-smooth)*.065*Math.exp(-progress*2)*(1+.3*Math.sin(t*(computer?6700:3900)));
        if(kind==='burn') {
          const ignition=.13*Math.exp(-t*35);
          const crackle=.035 + (noise>.96 ? .14 : 0);
          value=(computer ? smooth*.8+noise*.2 : smooth*.5+noise*.5)*(ignition+crackle)*(1-progress*.65);
        }
        if(kind==='crumble') value=smooth*.15*Math.exp(-progress*3);
        if(kind==='lose') value=(smooth*.23+Math.sin(2*Math.PI*(140*t-90*t*t))*.035)*Math.exp(-progress*5);
        if(kind==='win') {
          for (const [onset,frequency] of fanfare) {
            const age=t-onset;
            if(age>=0) value+=(Math.sin(2*Math.PI*frequency*age)+.18*Math.sin(4*Math.PI*frequency*age))*.045*Math.min(1,age/.012)*Math.exp(-age*3.8);
          }
          for (const onset of [.35,1.35,2.35]) {
            const age=t-onset;
            if(age>=0 && age<1.2) {
              const attack=Math.min(1,age/.006);
              const pop=(noise*.12+Math.sin(2*Math.PI*95*age)*.055)*Math.exp(-age*22);
              const crackle=(noise-smooth)*.035*Math.exp(-age*4.5)*(noise>.65?1:.2);
              value+=(pop+crackle)*attack;
            }
          }
        }
        data[i]=value*edge;
      }
      return buffer;
    }
    function play(kind, computer = false) {
      if (!enabled || paused || !context || context.state !== 'running') return;
      if (!['turn','select','burn','crumble','win','lose'].includes(kind)) return;
      if (kind==='select') {
        if (context.currentTime-lastScratch < .09) return;
        lastScratch=context.currentTime;
      }
      const channel=kind==='select'?'selection':kind;
      stop(channel);
      while (voices.size>=3) stop(voices.values().next().value.channel);
      const key=kind+computer;
      if (!buffers.has(key)) buffers.set(key,makeBuffer(kind,computer));
      const source=context.createBufferSource(); source.buffer=buffers.get(key); source.connect(master);
      const voice={source,channel}; voices.add(voice);
      source.onended=()=>{ source.disconnect(); voices.delete(voice); };
      source.start();
    }
    return {unlock,play,stop,pause,resume,setEnabled,get enabled(){return enabled;}};
  }
  if(typeof module!=='undefined' && module.exports) module.exports={createSound};
  else root.LastMatchSound=createSound(root);
})(typeof globalThis!=='undefined'?globalThis:this);
