/* US-013 : ambiances sonores composées en direct par le téléphone (Web Audio).
   Aucun enregistrement, aucun fichier son : rien à télécharger, aucun droit à vérifier.
   Les mélodies sont tirées au hasard dans une gamme à chaque écoute : jamais un air existant. */
(function () {
  "use strict";

  function Ambient(mix) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC();
    var running = true, timers = [];
    var R = Math.random;
    function rnd(a, b) { return a + R() * (b - a); }
    function pick(a) { return a[(R() * a.length) | 0]; }
    function later(fn, sec) { var id = setTimeout(function () { if (running) fn(); }, sec * 1000); timers.push(id); }
    function every(fn, a, b) { (function loop() { later(function () { fn(); loop(); }, rnd(a, b)); })(); }

    // sortie : volume -> compresseur -> haut-parleur
    var master = ctx.createGain(); master.gain.value = 0;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    var analyser = ctx.createAnalyser(); analyser.fftSize = 2048; comp.connect(analyser);
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);

    // réverbération maison (bruit à décroissance exponentielle)
    var verb = ctx.createConvolver();
    (function () {
      var len = ctx.sampleRate * 2.2, b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 3); }
      verb.buffer = b;
    })();
    var verbOut = ctx.createGain(); verbOut.gain.value = 0.35; verb.connect(verbOut); verbOut.connect(master);

    // bruits de base
    function noiseBuf(kind) {
      var len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      var b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (var i = 0; i < len; i++) {
        var w = R() * 2 - 1;
        if (kind === "white") d[i] = w * 0.5;
        else if (kind === "pink") { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      }
      return b;
    }
    var NB = { white: noiseBuf("white"), pink: noiseBuf("pink"), brown: noiseBuf("brown") };
    function noise(kind) { var s = ctx.createBufferSource(); s.buffer = NB[kind]; s.loop = true; s.loopStart = R() * 2; s.start(ctx.currentTime, R() * 3); return s; }
    function filt(type, f, q) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q) x.Q.value = q; return x; }
    function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
    function pan(p) { if (!ctx.createStereoPanner) return gain(1); var s = ctx.createStereoPanner(); s.pan.value = p; return s; }
    function chain() { for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
    function drift(param, lo, hi, a, b) { every(function () { param.setTargetAtTime(rnd(lo, hi), ctx.currentTime, rnd(a, b) / 3); }, a, b); }
    function out(node, wet) { node.connect(master); if (wet) { var s = gain(wet); node.connect(s); s.connect(verb); } }

    // un son court : oscillateur avec enveloppe
    function osc(type, f, t, dur, peak, dest, att) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + (att || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
      return o;
    }
    function burst(kind, t, dur, peak, dest, ftype, f, q) {
      var s = ctx.createBufferSource(); s.buffer = NB[kind];
      var fl = filt(ftype || "bandpass", f || 1000, q || 1), g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + Math.min(0.01, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      chain(s, fl, g, dest); s.start(t, R() * 3); s.stop(t + dur + 0.05);
      return fl;
    }
    // cloche : partiels inharmoniques
    function bell(f, t, dur, peak, dest, parts) {
      (parts || [[0.5, 0.5], [1, 1], [1.19, 0.6], [1.5, 0.4], [2, 0.5], [2.52, 0.25], [3.01, 0.15]]).forEach(function (p) {
        osc("sine", f * p[0], t, dur * (1.2 - p[0] / 4 > 0.3 ? 1.2 - p[0] / 4 : 0.3), peak * p[1] / 3, dest, 0.002);
      });
    }
    // corde pincée (Karplus-Strong calculé d'avance)
    var plucks = {};
    function pluckBuf(f, bright) {
      var key = Math.round(f) + "_" + bright;
      if (plucks[key]) return plucks[key];
      var sr = ctx.sampleRate, len = Math.floor(sr * 2.5), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      var N = Math.max(2, Math.round(sr / f)), buf = new Float32Array(N), i;
      for (i = 0; i < N; i++) buf[i] = R() * 2 - 1;
      var damp = bright ? 0.498 : 0.493, prev = 0;
      for (i = 0; i < len; i++) { var k = i % N, v = buf[k]; d[i] = v; buf[k] = damp * (v + prev); prev = v; }
      return (plucks[key] = b);
    }
    function pluck(f, t, peak, dest, bright, cut) {
      var s = ctx.createBufferSource(), g = gain(peak); s.buffer = pluckBuf(f, bright);
      s.connect(g); g.connect(dest); s.start(t); if (cut) { g.gain.setValueAtTime(peak, t + cut); g.gain.exponentialRampToValueAtTime(0.0001, t + cut + 0.08); s.stop(t + cut + 0.1); }
    }
    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    var L = {
      // ---------- fonds ----------
      wind: function () { var f = filt("bandpass", 500, 0.7), g = gain(0.35); chain(noise("pink"), f, g); out(g); drift(f.frequency, 250, 900, 2, 5); drift(g.gain, 0.12, 0.45, 2, 6); },
      desert: function () { var f = filt("bandpass", 1100, 0.9), g = gain(0.25); chain(noise("pink"), f, g); out(g); drift(f.frequency, 700, 1800, 2, 5); drift(g.gain, 0.08, 0.35, 2, 5); },
      forest: function () {
        var f = filt("bandpass", 650, 0.6), g = gain(0.22); chain(noise("pink"), f, g); out(g); drift(g.gain, 0.12, 0.3, 3, 7);
        var h = filt("highpass", 3500), g2 = gain(0.03); chain(noise("white"), h, g2); out(g2); drift(g2.gain, 0.005, 0.05, 1, 3);
      },
      waves: function () {
        var lp = filt("lowpass", 700), g = gain(0); chain(noise("brown"), lp, g); out(g);
        var hp = filt("highpass", 2500), g2 = gain(0); chain(noise("white"), hp, g2); out(g2, 0.2);
        (function wave() {
          var t = ctx.currentTime, up = rnd(1.5, 2.5), down = rnd(3, 5), p = rnd(0.5, 0.9);
          g.gain.setTargetAtTime(p, t, up / 3); g.gain.setTargetAtTime(0.08, t + up, down / 3);
          g2.gain.setTargetAtTime(p * 0.09, t + up * 0.8, 0.3); g2.gain.setTargetAtTime(0.0, t + up + 0.6, down / 4);
          lp.frequency.setTargetAtTime(1200, t, up / 2); lp.frequency.setTargetAtTime(500, t + up, down / 2);
          later(wave, up + down + rnd(0, 1.5));
        })();
      },
      harbor: function () {
        var lp = filt("lowpass", 380), g = gain(0.35); chain(noise("brown"), lp, g); out(g);
        every(function () { burst("brown", ctx.currentTime, rnd(0.3, 0.7), rnd(0.25, 0.5), master, "bandpass", rnd(250, 600), 2); }, 0.6, 1.8);
      },
      canal: function () {
        var lp = filt("lowpass", 500), g = gain(0.18); chain(noise("brown"), lp, g); out(g);
        every(function () { burst("brown", ctx.currentTime, rnd(0.2, 0.5), rnd(0.2, 0.45), master, "bandpass", rnd(350, 800), 3); }, 0.4, 1.4);
      },
      lake: function () {
        var lp = filt("lowpass", 450), g = gain(0.25); chain(noise("brown"), lp, g); out(g);
        every(function () { burst("brown", ctx.currentTime, rnd(0.25, 0.6), rnd(0.3, 0.55), master, "bandpass", rnd(300, 700), 3); }, 0.9, 2.6);
      },
      stream: function () {
        var bp = filt("bandpass", 2200, 0.7), g = gain(0.22); chain(noise("white"), bp, g); out(g); drift(g.gain, 0.12, 0.28, 0.2, 0.6);
        var bp2 = filt("bandpass", 900, 0.8), g2 = gain(0.25); chain(noise("pink"), bp2, g2); out(g2); drift(g2.gain, 0.15, 0.35, 0.3, 0.9);
        every(function () { var t = ctx.currentTime, f = rnd(600, 1500); var o = osc("sine", f, t, 0.06, 0.05, master); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.05); }, 0.05, 0.35);
      },
      fountain: function () {
        var hp = filt("highpass", 1400), bp = filt("peaking", 4000, 1), g = gain(0.16); bp.gain.value = 6; chain(noise("white"), hp, bp, g); out(g); drift(g.gain, 0.11, 0.2, 0.4, 1.2);
        every(function () { burst("white", ctx.currentTime, rnd(0.04, 0.12), rnd(0.04, 0.1), master, "bandpass", rnd(1500, 4000), 4); }, 0.05, 0.3);
      },
      waterfall: function () {
        var lp = filt("lowpass", 2600), g = gain(0.2); chain(noise("pink"), lp, g); out(g); drift(g.gain, 0.17, 0.23, 1, 3);
        var lp2 = filt("lowpass", 160), g2 = gain(0.25); chain(noise("brown"), lp2, g2); out(g2);
      },
      rain: function () {
        var hp = filt("highpass", 2600), g = gain(0.13); chain(noise("white"), hp, g); out(g); drift(g.gain, 0.09, 0.16, 1, 4);
        var lp = filt("lowpass", 900), g2 = gain(0.12); chain(noise("pink"), lp, g2); out(g2);
        every(function () { var t = ctx.currentTime; for (var i = 0; i < 4; i++) burst("white", t + R() * 0.2, 0.012, rnd(0.05, 0.18), master, "bandpass", rnd(2500, 7000), 2); }, 0.08, 0.25);
      },
      city: function () {
        var lp = filt("lowpass", 230), g = gain(0.5); chain(noise("brown"), lp, g); out(g); drift(g.gain, 0.35, 0.6, 2, 5);
        every(function () {
          var t = ctx.currentTime, d = rnd(2.5, 4), s = ctx.createBufferSource(); s.buffer = NB.pink; s.loop = true;
          var f = filt("bandpass", 300, 1.2), gg = ctx.createGain(), p = pan(R() < 0.5 ? -1 : 1);
          gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(rnd(0.15, 0.35), t + d / 2); gg.gain.linearRampToValueAtTime(0, t + d);
          f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(rnd(550, 800), t + d / 2); f.frequency.linearRampToValueAtTime(240, t + d);
          if (p.pan) { p.pan.setValueAtTime(p.pan.value, t); p.pan.linearRampToValueAtTime(-p.pan.value, t + d); }
          chain(s, f, gg, p, master); s.start(t, R() * 3); s.stop(t + d + 0.1);
        }, 3, 9);
      },
      crowd: function () {
        for (var v = 0; v < 5; v++) (function () {
          var f = filt("bandpass", rnd(450, 1400), 4), g = gain(0), p = pan(rnd(-0.8, 0.8));
          chain(noise("pink"), f, g, p, master);
          every(function () {
            var t = ctx.currentTime, talk = R() < 0.7;
            g.gain.setTargetAtTime(talk ? rnd(0.15, 0.4) : 0, t, 0.04);
            f.frequency.setTargetAtTime(rnd(350, 1500), t, 0.05);
          }, 0.08, 0.3);
        })();
      },
      insects: function () {
        for (var k = 0; k < 3; k++) (function () {
          var o = ctx.createOscillator(), am = ctx.createOscillator(), amg = gain(0.5), mod = gain(0.5), g = gain(0), p = pan(rnd(-0.7, 0.7));
          o.frequency.value = rnd(3800, 6200); am.frequency.value = rnd(18, 45); am.type = "square";
          am.connect(amg); amg.connect(mod.gain); chain(o, mod, g, p, master); o.start(); am.start();
          drift(g.gain, 0.02, 0.08, 1, 4);
        })();
        every(function () { var t = ctx.currentTime, f = rnd(4200, 5200), n = 2 + (R() * 3 | 0); for (var i = 0; i < n; i++) osc("sine", f, t + i * 0.07, 0.04, 0.05, master); }, 0.4, 1.5);
      },
      savanna: function () {
        L.wind();
        every(function () { var t = ctx.currentTime, f = rnd(4000, 5000); for (var i = 0; i < 3; i++) osc("sine", f, t + i * 0.09, 0.05, 0.035, master); }, 0.6, 2.2);
      },
      // ---------- événements ----------
      gulls: function () {
        every(function () {
          var n = 1 + (R() * 3 | 0), t = ctx.currentTime, p = pan(rnd(-0.9, 0.9)), f = filt("bandpass", 1500, 1.5); chain(f, p); out(p, 0.3);
          for (var i = 0; i < n; i++) {
            var tt = t + i * rnd(0.35, 0.55), base = rnd(1200, 1500), o = ctx.createOscillator(), g = ctx.createGain();
            o.type = "sawtooth"; o.frequency.setValueAtTime(base, tt); o.frequency.linearRampToValueAtTime(base * 1.35, tt + 0.07); o.frequency.exponentialRampToValueAtTime(base * 0.62, tt + 0.38);
            g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.09, tt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.4);
            chain(o, g, f); o.start(tt); o.stop(tt + 0.45);
          }
        }, 3, 9);
      },
      songbirds: function () {
        every(function () {
          var t = ctx.currentTime, p = pan(rnd(-0.9, 0.9)), n = 3 + (R() * 6 | 0), base = rnd(2600, 4800), shape = R();
          out(p, 0.25);
          for (var i = 0; i < n; i++) {
            var tt = t + i * rnd(0.08, 0.16), f = base * rnd(0.85, 1.2), o = osc("sine", f, tt, rnd(0.05, 0.12), 0.06, p, 0.01);
            o.frequency.exponentialRampToValueAtTime(f * (shape < 0.5 ? 1.5 : 0.7), tt + 0.08);
          }
        }, 0.8, 3.5);
      },
      crows: function () {
        every(function () {
          var t = ctx.currentTime, n = 1 + (R() * 3 | 0), p = pan(rnd(-0.8, 0.8)), f = filt("bandpass", 1100, 2.5); chain(f, p); out(p, 0.4);
          for (var i = 0; i < n; i++) { var tt = t + i * 0.45, o = osc("sawtooth", rnd(380, 460), tt, 0.32, 0.18, f, 0.02); o.frequency.linearRampToValueAtTime(320, tt + 0.3); }
        }, 5, 12);
      },
      templebell: function () {
        every(function () { var p = pan(rnd(-0.3, 0.3)); out(p, 0.5); bell(rnd(98, 118), ctx.currentTime, 9, 0.5, p, [[0.5, 0.6], [1, 1], [1.007, 0.8], [2.0, 0.4], [2.76, 0.3], [5.4, 0.1]]); }, 14, 22);
      },
      churchbells: function () {
        var notes = [0, 2, 4, 5].map(function (s) { return 523 * Math.pow(2, -s / 12); });
        every(function () {
          var t = ctx.currentTime, p = pan(rnd(-0.4, 0.4)), lp = filt("lowpass", 3000); chain(lp, p); out(p, 0.6);
          var n = 4 + (R() * 6 | 0);
          for (var i = 0; i < n; i++) bell(notes[i % notes.length], t + i * 0.7, 4, 0.25, lp);
        }, 12, 25);
      },
      bikebells: function () {
        every(function () {
          var t = ctx.currentTime, p = pan(rnd(-0.9, 0.9)); out(p, 0.15);
          for (var i = 0; i < 2; i++) bell(2650, t + i * 0.14, 0.6, 0.18, p, [[1, 1], [1.56, 0.7], [2.28, 0.4]]);
        }, 4, 11);
      },
      trambell: function () {
        every(function () { var t = ctx.currentTime, p = pan(rnd(-0.6, 0.6)); out(p, 0.3); for (var i = 0; i < 2; i++) bell(880, t + i * 0.32, 1.2, 0.2, p, [[1, 1], [1.5, 0.6], [2.38, 0.4], [3.2, 0.2]]); }, 8, 18);
      },
      cablecar: function () {
        every(function () {
          var t = ctx.currentTime, p = pan(rnd(-0.5, 0.5)); out(p, 0.3);
          var rhythm = [0, 0.18, 0.36, 0.72, 0.9, 1.26, 1.44, 1.62];
          rhythm.slice(0, 3 + (R() * 6 | 0)).forEach(function (d) { bell(1040, t + d, 0.9, 0.16, p, [[1, 1], [1.48, 0.6], [2.3, 0.35]]); });
        }, 7, 16);
      },
      foghorn: function () {
        every(function () {
          var t = ctx.currentTime, lp = filt("lowpass", 380); out(lp, 0.6);
          [82, 123].forEach(function (f) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sawtooth"; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.5); g.gain.setValueAtTime(0.2, t + 2.8); g.gain.linearRampToValueAtTime(0, t + 3.8); chain(o, g, lp); o.start(t); o.stop(t + 4); });
        }, 14, 28);
      },
      shiphorn: function () {
        every(function () {
          var t = ctx.currentTime, lp = filt("lowpass", 600); out(lp, 0.6);
          [110, 138.6].forEach(function (f) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sawtooth"; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14, t + 0.3); g.gain.setValueAtTime(0.14, t + 1.8); g.gain.linearRampToValueAtTime(0, t + 2.4); chain(o, g, lp); o.start(t); o.stop(t + 2.5); });
        }, 18, 40);
      },
      cowbells: function () {
        for (var c = 0; c < 3; c++) (function () {
          var f0 = rnd(520, 820), p = pan(rnd(-0.9, 0.9)), g = gain(rnd(0.3, 1)); chain(g, p); out(p, 0.3);
          every(function () { var t = ctx.currentTime; bell(f0, t, 0.7, 0.18, g, [[1, 1], [1.48, 0.7], [2.32, 0.5], [3.1, 0.3]]); if (R() < 0.5) bell(f0, t + rnd(0.15, 0.3), 0.6, 0.1, g, [[1, 1], [1.48, 0.7], [2.32, 0.5]]); }, 0.6, 3.5);
        })();
      },
      geyser: function () {
        every(function () {
          var t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = NB.white; s.loop = true;
          var f = filt("bandpass", 900, 0.6), g = ctx.createGain();
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 2); g.gain.setValueAtTime(0.5, t + 6); g.gain.linearRampToValueAtTime(0, t + 10);
          f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1600, t + 2.5); f.frequency.linearRampToValueAtTime(700, t + 10);
          chain(s, f, g); out(g, 0.3); s.start(t); s.stop(t + 10.2);
          burst("brown", t, 6, 0.5, master, "lowpass", 140, 0.7);
        }, 18, 32);
      },
      coqui: function () {
        for (var k = 0; k < 3; k++) (function () {
          var p = pan(rnd(-0.9, 0.9)), g = gain(rnd(0.4, 1)), f1 = rnd(1050, 1250), f2 = rnd(1900, 2250); chain(g, p); out(p, 0.25);
          every(function () { var t = ctx.currentTime; osc("sine", f1, t, 0.1, 0.12, g, 0.005); var o = osc("sine", f2 * 0.92, t + 0.14, 0.16, 0.12, g, 0.005); o.frequency.linearRampToValueAtTime(f2, t + 0.28); }, 0.7, 2.2);
        })();
      },
      loon: function () {
        every(function () {
          var t = ctx.currentTime, o = ctx.createOscillator(), o2 = ctx.createOscillator(), v = ctx.createOscillator(), vg = gain(9), g = ctx.createGain(), p = pan(rnd(-0.6, 0.6));
          o.type = "sine"; o2.type = "triangle";
          [o, o2].forEach(function (x, i) { var m = i ? 2 : 1; x.frequency.setValueAtTime(600 * m, t); x.frequency.linearRampToValueAtTime(930 * m, t + 1); x.frequency.setValueAtTime(930 * m, t + 2.2); x.frequency.linearRampToValueAtTime(760 * m, t + 2.8); });
          v.frequency.value = 5; v.connect(vg); vg.connect(o.frequency);
          var g2 = gain(0.15); o2.connect(g2); g2.connect(g); o.connect(g);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.3); g.gain.setValueAtTime(0.12, t + 2.4); g.gain.linearRampToValueAtTime(0, t + 3);
          chain(g, p); out(p, 0.8); [o, o2, v].forEach(function (x) { x.start(t); x.stop(t + 3.1); });
        }, 9, 18);
      },
      footsteps: function () {
        (function walk() {
          var t = ctx.currentTime, n = 6 + (R() * 8 | 0), step = rnd(0.5, 0.62);
          for (var i = 0; i < n; i++) for (var k = 0; k < 3; k++) burst("white", t + i * step + k * 0.018, 0.05, rnd(0.04, 0.09), master, "bandpass", rnd(700, 1600), 1.2);
          later(walk, n * step + rnd(3, 8));
        })();
      },
      // ---------- musiques (motifs inventés au hasard dans une gamme) ----------
      accordion: function () {
        var bus = filt("lowpass", 2400), g = gain(0.5); chain(bus, g); out(g, 0.35);
        var trem = ctx.createOscillator(), tg = gain(0.12); trem.frequency.value = 6; trem.connect(tg); tg.connect(g.gain); trem.start();
        var major = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
        function reed(m, t, d, v) { [-4, 4].forEach(function (c) { var o = ctx.createOscillator(), e = ctx.createGain(); o.type = "sawtooth"; o.frequency.value = mtof(m) * Math.pow(2, c / 1200); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.03); e.gain.setValueAtTime(v, t + d - 0.05); e.gain.linearRampToValueAtTime(0, t + d); chain(o, e, bus); o.start(t); o.stop(t + d + 0.02); }); }
        (function phrase() {
          var key = pick([60, 65, 67]), beat = 60 / 138, t = ctx.currentTime + 0.1, bars = 8, idx = 4;
          var prog = [0, 0, 7, 7, 5, 0, 7, 0];
          for (var b = 0; b < bars; b++) {
            var root = key - 24 + prog[b], tb = t + b * 3 * beat;
            reed(root, tb, beat * 0.8, 0.06);
            [4, 7].forEach(function (iv) { reed(root + 12 + iv, tb + beat, beat * 0.5, 0.025); reed(root + 12 + iv, tb + 2 * beat, beat * 0.5, 0.025); });
            for (var e = 0; e < 6; e++) {
              if (R() < 0.15) continue;
              idx = Math.max(0, Math.min(major.length - 1, idx + pick([-2, -1, -1, 1, 1, 2])));
              reed(key + major[idx], tb + e * beat / 2, beat / 2 * 0.95, 0.045);
            }
          }
          later(phrase, bars * 3 * beat + rnd(1.5, 4));
        })();
      },
      samba: function () {
        var bus = filt("lowpass", 3500), g = gain(0.7); chain(bus, g); out(g, 0.3);
        var tamb = [1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
        (function bar() {
          var t = ctx.currentTime + 0.05, s = 60 / 100 / 4;
          for (var i = 0; i < 16; i++) {
            var tt = t + i * s;
            if (i === 4 || i === 12) { var o = osc("sine", 75, tt, 0.4, i === 12 ? 0.5 : 0.3, bus, 0.002); o.frequency.exponentialRampToValueAtTime(50, tt + 0.3); }
            burst("white", tt, 0.05, i % 4 === 0 ? 0.12 : 0.05, bus, "highpass", 5000, 0.7);
            if (tamb[i]) osc("triangle", 1900, tt, 0.06, 0.12, bus, 0.001);
            if (i % 2 === 1 && R() < 0.6) burst("white", tt, 0.08, 0.06, bus, "bandpass", 2500, 1.5);
          }
          later(bar, 16 * s - 0.02);
        })();
      },
      jazz: function () {
        var bus = filt("lowpass", 3000), g = gain(0.8); chain(bus, g); out(g, 0.4);
        var changes = [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [48, 52, 55, 59]]; // ii-V-I en do
        (function chorus() {
          var t = ctx.currentTime + 0.05, beat = 60 / 120;
          for (var b = 0; b < 16; b++) {
            var ch = changes[(b / 4 | 0) % 4];
            for (var k = 0; k < 4; k++) {
              var tt = t + (b * 4 + k) * beat;
              pluck(mtof(ch[(k + (R() * 2 | 0)) % 4] - 24), tt, 0.5, bus, false, beat * 0.9);
              burst("white", tt, 0.18, 0.04, bus, "bandpass", 6000, 0.8);
              if (k === 1 || k === 3) ch.forEach(function (m) { osc("triangle", mtof(m), tt + beat * 0.66, 0.35, 0.025, bus, 0.005); });
            }
          }
          later(chorus, 64 * beat - 0.02);
        })();
      },
      violin: function () {
        var bus = filt("lowpass", 3400), pk = filt("peaking", 2400, 1.5), g = gain(0.5); pk.gain.value = 5; chain(bus, pk, g); out(g, 0.5);
        var scale = [62, 64, 65, 67, 69, 70, 73, 74, 76, 77];
        (function phrase() {
          var t = ctx.currentTime + 0.1, idx = 4, n = 6 + (R() * 6 | 0);
          for (var i = 0; i < n; i++) {
            idx = Math.max(0, Math.min(scale.length - 1, idx + pick([-2, -1, 1, 1, 2])));
            var d = pick([0.45, 0.9, 0.9, 1.35]), o = ctx.createOscillator(), e = ctx.createGain(), v = ctx.createOscillator(), vg = gain(mtof(scale[idx]) * 0.006);
            o.type = "sawtooth"; o.frequency.value = mtof(scale[idx]); v.frequency.value = 5.5; v.connect(vg); vg.connect(o.frequency);
            e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.1, t + 0.12); e.gain.setValueAtTime(0.1, t + d - 0.1); e.gain.linearRampToValueAtTime(0, t + d);
            chain(o, e, bus); o.start(t); v.start(t); o.stop(t + d + 0.05); v.stop(t + d + 0.05); t += d;
          }
          later(phrase, t - ctx.currentTime + rnd(2, 5));
        })();
      },
      flamenco: function () {
        var bus = gain(0.5); out(bus, 0.35);
        var chords = [[45, 52, 57, 60, 64], [43, 50, 55, 59, 62], [41, 48, 53, 57, 60], [40, 47, 52, 56, 59, 64]];
        (function cycle() {
          var t = ctx.currentTime + 0.05, beat = 60 / 112;
          chords.forEach(function (ch, c) {
            for (var k = 0; k < 4; k++) {
              var tt = t + (c * 4 + k) * beat, rasg = k === 0 && R() < 0.5;
              (rasg ? [0, 0.05, 0.1, 0.15] : [0]).forEach(function (off) { ch.forEach(function (m, s) { pluck(mtof(m), tt + off + s * 0.012, 0.12, bus, true, beat * 1.5); }); });
            }
          });
          later(cycle, 16 * beat + rnd(0.5, 2));
        })();
      },
      fado: function () {
        var bus = gain(0.45); out(bus, 0.4);
        var chords = [[57, 60, 64, 69], [56, 59, 64, 68], [57, 60, 64, 69], [62, 65, 69, 74]];
        (function cycle() {
          var t = ctx.currentTime + 0.05, s = 60 / 76 / 2;
          chords.forEach(function (ch, c) {
            for (var k = 0; k < 8; k++) {
              var tt = t + (c * 8 + k) * s, m = ch[[0, 2, 1, 3, 2, 1, 3, 2][k]];
              if (k === 0) pluck(mtof(ch[0] - 12), tt, 0.25, bus, false);
              if (k === 6 && R() < 0.5) { for (var r = 0; r < 6; r++) pluck(mtof(ch[3] + 12), tt + r * 0.06, 0.08, bus, true, 0.1); }
              else pluck(mtof(m + 12), tt, 0.14, bus, true);
            }
          });
          later(cycle, 32 * s + rnd(0.5, 2.5));
        })();
      },
      ukulele: function () {
        var bus = gain(0.5); out(bus, 0.25);
        var chords = [[67, 60, 64, 72], [67, 62, 67, 71], [69, 60, 64, 69], [69, 60, 65, 69]]; // C G Am F, accord G C E A
        var pattern = [[0, "d"], [1, "d"], [1.5, "u"], [2.5, "u"], [3, "d"], [3.5, "u"]];
        (function cycle() {
          var t = ctx.currentTime + 0.05, beat = 60 / 96;
          chords.forEach(function (ch, c) {
            pattern.forEach(function (p) {
              var tt = t + (c * 4 + p[0]) * beat, order = p[1] === "d" ? ch : ch.slice().reverse();
              order.forEach(function (m, s) { pluck(mtof(m), tt + s * 0.01, 0.1, bus, true, beat * 0.9); });
            });
          });
          later(cycle, 16 * beat);
        })();
      },
      gamelan: function () {
        var bus = gain(0.6); out(bus, 0.5);
        var pelog = [293, 316, 345, 420, 451, 586, 632];
        var cycle = []; for (var i = 0; i < 8; i++) cycle.push(pick(pelog));
        (function loop() {
          var t = ctx.currentTime + 0.05, s = 60 / 84;
          cycle.forEach(function (f, i) {
            var tt = t + i * s;
            bell(f, tt, 1.8, 0.25, bus, [[1, 1], [2.64, 0.3], [4.1, 0.15]]);
            bell(f * 2, tt + s / 2, 1.2, 0.12, bus, [[1, 1], [2.7, 0.25]]);
          });
          bell(68, t + 8 * s - 0.1, 6, 0.5, bus, [[1, 1], [1.006, 0.9], [2.01, 0.3]]);
          if (R() < 0.25) cycle[(R() * 8) | 0] = pick(pelog);
          later(loop, 8 * s);
        })();
      },
      panflute: function () {
        var bus = gain(0.6); out(bus, 0.6);
        var scale = [64, 67, 69, 71, 74, 76, 79, 81];
        (function phrase() {
          var t = ctx.currentTime + 0.1, idx = 3, n = 4 + (R() * 5 | 0);
          for (var i = 0; i < n; i++) {
            idx = Math.max(0, Math.min(scale.length - 1, idx + pick([-2, -1, 1, 1, 2])));
            var f = mtof(scale[idx]), d = pick([0.4, 0.8, 0.8, 1.2]), o = ctx.createOscillator(), e = ctx.createGain(), v = ctx.createOscillator(), vg = gain(f * 0.008);
            o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.08);
            v.frequency.value = 5; v.connect(vg); vg.connect(o.frequency);
            e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.12, t + 0.06); e.gain.setValueAtTime(0.1, t + d - 0.12); e.gain.linearRampToValueAtTime(0, t + d);
            chain(o, e, bus); o.start(t); v.start(t); o.stop(t + d + 0.05); v.stop(t + d + 0.05);
            burst("white", t, d, 0.03, bus, "bandpass", f * 2, 3);
            t += d;
          }
          later(phrase, t - ctx.currentTime + rnd(1.5, 4));
        })();
      },
      bagpipe: function () {
        var bus = filt("lowpass", 3200), g = gain(0.5); chain(bus, g); out(g, 0.3);
        [57 - 12, 57 - 24].forEach(function (m) { var o = ctx.createOscillator(), e = gain(0.05); o.type = "sawtooth"; o.frequency.value = mtof(m); chain(o, e, bus); o.start(); });
        var scale = [67, 69, 71, 73, 74, 76, 78, 79, 81];
        (function tune() {
          var t = ctx.currentTime + 0.1, beat = 60 / 92, idx = 1, n = 16;
          for (var i = 0; i < n; i++) {
            idx = Math.max(0, Math.min(scale.length - 1, idx + pick([-2, -1, 0, 1, 1, 2])));
            var d = pick([0.5, 0.5, 1, 1.5]) * beat;
            osc("square", mtof(79), t, 0.04, 0.03, bus, 0.003);
            var o = ctx.createOscillator(), e = ctx.createGain(); o.type = "sawtooth"; o.frequency.value = mtof(scale[idx]);
            e.gain.setValueAtTime(0.06, t + 0.035); e.gain.setValueAtTime(0.06, t + d - 0.01); e.gain.linearRampToValueAtTime(0, t + d);
            chain(o, e, bus); o.start(t + 0.03); o.stop(t + d + 0.02); t += d;
          }
          later(tune, t - ctx.currentTime);
        })();
      },
      framedrum: function () {
        var bus = gain(0.8); out(bus, 0.3);
        var pats = [["D", 0, "T", 0, "D", "D", "T", 0], ["D", 0, "T", "T", "D", 0, "T", 0], ["D", "T", 0, "T", "D", 0, "T", "T"]];
        (function bar() {
          var t = ctx.currentTime + 0.05, s = 60 / 104 / 2, p = pick(pats);
          p.forEach(function (x, i) {
            var tt = t + i * s;
            if (x === "D") { var o = osc("sine", 95, tt, 0.35, 0.45, bus, 0.002); o.frequency.exponentialRampToValueAtTime(60, tt + 0.25); burst("brown", tt, 0.1, 0.2, bus, "lowpass", 300); }
            if (x === "T") burst("white", tt, 0.07, 0.25, bus, "bandpass", 2200, 1.2);
            if (R() < 0.15) burst("white", tt, 0.25, 0.05, bus, "highpass", 7000);
          });
          later(bar, 8 * s - 0.02);
        })();
      }
    };

    mix.forEach(function (k) { if (L[k]) L[k](); });

    return {
      ctx: ctx, analyser: analyser,
      setVolume: function (v) { master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); },
      stop: function () {
        running = false; timers.forEach(clearTimeout);
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        setTimeout(function () { try { ctx.close(); } catch (e) {} }, 700);
      }
    };
  }
  window.Ambient = Ambient;
})();
