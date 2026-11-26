/* US-013 : sudoku du jour et chronomètre. Aucune donnée envoyée : tout reste dans le navigateur. */
(function () {
  "use strict";
  var LANG = document.documentElement.lang || "en";
  var T = window.I18N[LANG] || window.I18N.en;
  var EPOCH = Date.UTC(2026, 10, 30); // lundi 30/11/2026, jour 0 de daily.json

  function tr(key, vars) {
    var s = T[key] || window.I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }
  function $(sel) { return document.querySelector(sel); }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function fmt(ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    s = s % 60;
    var mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
  }
  function localDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // textes statiques
  document.title = tr("htmlTitle");
  Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (el) { el.textContent = tr(el.getAttribute("data-t")); });

  // ---------- onglets ----------
  var tabs = { sudoku: $("#tab-sudoku"), timer: $("#tab-timer") };
  var panels = { sudoku: $("#panel-sudoku"), timer: $("#panel-timer") };
  function show(name) {
    Object.keys(tabs).forEach(function (k) {
      tabs[k].setAttribute("aria-selected", k === name ? "true" : "false");
      panels[k].hidden = k !== name;
    });
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    sudoku.onVisibility();
  }
  tabs.sudoku.addEventListener("click", function () { show("sudoku"); });
  tabs.timer.addEventListener("click", function () { show("timer"); });

  // ---------- solveur (pour retrouver la solution de la grille du jour) ----------
  function solve(p) {
    var g = p.split("").map(Number);
    var R = [], C = [], B = [], i;
    for (i = 0; i < 9; i++) { R[i] = C[i] = B[i] = 0; }
    for (i = 0; i < 81; i++) if (g[i]) {
      var r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0), bit = 1 << g[i];
      R[r] |= bit; C[c] |= bit; B[b] |= bit;
    }
    function rec() {
      var best = -1, bestMask = 0, bestN = 10;
      for (var k = 0; k < 81; k++) if (!g[k]) {
        var r = (k / 9) | 0, c = k % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
        var free = ~(R[r] | C[c] | B[b]) & 0x3FE, n = 0, x = free;
        while (x) { x &= x - 1; n++; }
        if (n < bestN) { best = k; bestMask = free; bestN = n; if (n < 2) break; }
      }
      if (best < 0) return true;
      var rr = (best / 9) | 0, cc = best % 9, bb = ((rr / 3) | 0) * 3 + ((cc / 3) | 0);
      for (var v = 1; v <= 9; v++) if (bestMask & (1 << v)) {
        var bit = 1 << v;
        g[best] = v; R[rr] |= bit; C[cc] |= bit; B[bb] |= bit;
        if (rec()) return true;
        g[best] = 0; R[rr] &= ~bit; C[cc] &= ~bit; B[bb] &= ~bit;
      }
      return false;
    }
    return rec() ? g : null;
  }

  // ---------- sudoku du jour ----------
  var sudoku = (function () {
    var board = $("#board"), wrap = $("#board-wrap"), pad = $("#pad"), msg = $("#msg");
    var tEl = $("#s-time"), pauseBtn = $("#s-pause"), notesBtn = $("#s-notes"), mistakes = $("#s-mistakes");
    var cells = [], st = null, puzzle = "", sol = null, level = "e", today = "", sel = -1;
    var tickId = 0, lastTick = 0, noteMode = false;

    for (var i = 0; i < 81; i++) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "cell"; b.dataset.i = i;
      if (((i / 9) | 0) === 2 || ((i / 9) | 0) === 5) b.classList.add("rb");
      board.appendChild(b); cells.push(b);
    }
    for (var d = 1; d <= 9; d++) {
      var p = document.createElement("button");
      p.type = "button"; p.textContent = d; p.dataset.d = d; p.setAttribute("aria-label", tr("digit", { d: d }));
      pad.appendChild(p);
    }

    function key() { return "us013.sudoku." + today; }
    function save() { if (st) store(key(), st); }

    function load(data) {
      today = localDate(new Date());
      var parts = today.split("-").map(Number);
      var n = Math.round((Date.UTC(parts[0], parts[1] - 1, parts[2]) - EPOCH) / 86400000);
      var g = data.grids[((n % data.grids.length) + data.grids.length) % data.grids.length];
      level = g[0]; puzzle = g.slice(1); sol = solve(puzzle);
      st = store(key());
      if (!st || st.p !== puzzle) st = { p: puzzle, v: puzzle.split("").map(Number), n: new Array(81).fill(0), ms: 0, done: false, h: [] };
      st.paused = false;
      cleanup();
      $("#s-level").textContent = T.levels[level];
      $("#s-date").textContent = new Intl.DateTimeFormat(LANG, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
      $("#cleared-small").textContent = new Intl.DateTimeFormat(LANG, { day: "numeric", month: "numeric", year: "numeric" }).format(new Date());
      wrap.classList.remove("done", "paused"); pauseBtn.disabled = false; pauseBtn.textContent = tr("pause");
      sel = -1; render(); renderTime(); onVisibility();
      if (st.done) finish(true);
    }

    function cleanup() { // garde 14 jours au plus sur l'appareil
      try {
        var ks = [];
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("us013.sudoku.") === 0) ks.push(k); }
        ks.sort(); while (ks.length > 14) localStorage.removeItem(ks.shift());
      } catch (e) {}
    }

    function render() {
      var cur = sel >= 0 ? st.v[sel] : 0, showBad = mistakes.checked;
      var sr = (sel / 9) | 0, sc = sel % 9, sb = ((sr / 3) | 0) * 3 + ((sc / 3) | 0);
      var counts = new Array(10).fill(0);
      for (var i = 0; i < 81; i++) {
        var c = cells[i], v = st.v[i], given = puzzle[i] !== "0";
        var r = (i / 9) | 0, col = i % 9, bx = ((r / 3) | 0) * 3 + ((col / 3) | 0);
        if (v) counts[v]++;
        c.className = "cell" + (r === 2 || r === 5 ? " rb" : "") + (given ? " given" : v ? " user" : "");
        if (sel >= 0) {
          if (i === sel) c.classList.add("sel");
          else if (cur && v === cur) c.classList.add("same");
          else if (r === sr || col === sc || bx === sb) c.classList.add("peer");
        }
        if (showBad && v && !given && sol && v !== sol[i]) c.classList.add("bad");
        if (v) c.textContent = v;
        else if (st.n[i]) {
          var h = '<span class="notes" aria-hidden="true">';
          for (var d = 1; d <= 9; d++) h += "<span>" + (st.n[i] & (1 << d) ? d : "") + "</span>";
          c.innerHTML = h + "</span>";
        } else c.textContent = "";
        c.setAttribute("aria-label", tr("cellLabel", { r: r + 1, c: col + 1 }) + ", " + (v ? v + (given ? " (" + tr("cellGiven") + ")" : "") : tr("cellEmpty")));
        c.disabled = !!st.done;
      }
      Array.prototype.forEach.call(pad.children, function (b) {
        b.classList.toggle("used", counts[+b.dataset.d] >= 9);
        b.disabled = !!st.done;
      });
    }

    function renderTime() { tEl.textContent = fmt(st ? st.ms : 0); }

    function running() { return st && !st.done && !st.paused && !panels.sudoku.hidden && document.visibilityState === "visible"; }
    function onVisibility() {
      if (!st) return;
      clearInterval(tickId); tickId = 0;
      if (running()) {
        lastTick = Date.now();
        tickId = setInterval(function () {
          var now = Date.now(); st.ms += now - lastTick; lastTick = now; renderTime();
          if (localDate(new Date()) !== today && window.__daily) load(window.__daily);
        }, 500);
      }
      save();
    }

    function setPaused(p) {
      if (st.done) return;
      st.paused = p; wrap.classList.toggle("paused", p);
      pauseBtn.textContent = tr(p ? "resume" : "pause");
      onVisibility();
    }

    function input(d) {
      if (sel < 0 || st.done || st.paused || puzzle[sel] !== "0") return;
      st.h.push([sel, st.v[sel], st.n[sel]]);
      if (st.h.length > 300) st.h.shift();
      if (noteMode && d) {
        if (st.v[sel]) return;
        st.n[sel] ^= 1 << d;
      } else {
        st.v[sel] = st.v[sel] === d ? 0 : d;
        if (st.v[sel]) { // efface la note de ce chiffre chez les voisines
          var r = (sel / 9) | 0, c = sel % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
          for (var i = 0; i < 81; i++) {
            var ri = (i / 9) | 0, ci = i % 9;
            if (ri === r || ci === c || ((ri / 3) | 0) * 3 + ((ci / 3) | 0) === b) st.n[i] &= ~(1 << d);
          }
        }
      }
      if (!d) st.n[sel] = 0;
      check(); render(); save();
    }

    function check() {
      msg.className = "msg"; msg.textContent = "";
      if (st.v.indexOf(0) !== -1) return;
      var ok = sol && st.v.every(function (v, i) { return v === sol[i]; });
      if (ok) { st.done = true; finish(false); }
      else { msg.className = "msg warn"; msg.textContent = tr("wrongFull"); }
    }

    function finish(quiet) {
      clearInterval(tickId); tickId = 0; sel = -1;
      $("#cleared-big").textContent = tr("stampLabel");
      if (quiet) wrap.classList.add("done");
      else { void wrap.offsetWidth; wrap.classList.add("done"); }
      msg.className = "msg"; msg.textContent = tr("solvedIn", { t: fmt(st.ms) }) + ". " + tr("nextOne");
      pauseBtn.disabled = true; render(); save();
    }

    board.addEventListener("click", function (e) {
      var c = e.target.closest(".cell"); if (!c) return;
      sel = +c.dataset.i; render();
    });
    pad.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) input(+b.dataset.d); });
    $("#s-erase").addEventListener("click", function () { input(0); });
    $("#s-undo").addEventListener("click", function () {
      if (st.done || st.paused || !st.h.length) return;
      var h = st.h.pop(); st.v[h[0]] = h[1]; st.n[h[0]] = h[2]; sel = h[0]; check(); render(); save();
    });
    notesBtn.addEventListener("click", function () { noteMode = !noteMode; notesBtn.setAttribute("aria-pressed", noteMode); });
    pauseBtn.addEventListener("click", function () { setPaused(!st.paused); });
    mistakes.addEventListener("change", function () { store("us013.mistakes", mistakes.checked); render(); });
    mistakes.checked = !!store("us013.mistakes");

    var dlg = $("#restart-dlg");
    $("#s-restart").addEventListener("click", function () {
      if (dlg.showModal) dlg.showModal(); else if (window.confirm(tr("restartConfirm"))) restart();
    });
    $("#restart-yes").addEventListener("click", function () { dlg.close(); restart(); });
    $("#restart-no").addEventListener("click", function () { dlg.close(); });
    function restart() {
      st = { p: puzzle, v: puzzle.split("").map(Number), n: new Array(81).fill(0), ms: 0, done: false, h: [], paused: false };
      wrap.classList.remove("done", "paused"); pauseBtn.disabled = false; pauseBtn.textContent = tr("pause");
      msg.textContent = ""; sel = -1; render(); renderTime(); onVisibility();
    }

    document.addEventListener("keydown", function (e) {
      if (panels.sudoku.hidden || !st || dlg.open) return;
      var k = e.key;
      if (/^[1-9]$/.test(k)) { input(+k); e.preventDefault(); }
      else if (k === "Backspace" || k === "Delete" || k === "0") { input(0); e.preventDefault(); }
      else if (k.indexOf("Arrow") === 0) {
        if (sel < 0) sel = 40;
        var r = (sel / 9) | 0, c = sel % 9;
        if (k === "ArrowUp") r = (r + 8) % 9; if (k === "ArrowDown") r = (r + 1) % 9;
        if (k === "ArrowLeft") c = (c + 8) % 9; if (k === "ArrowRight") c = (c + 1) % 9;
        sel = r * 9 + c; render(); cells[sel].focus(); e.preventDefault();
      } else if (k === "n" || k === "N") { notesBtn.click(); }
    });

    return { load: load, onVisibility: onVisibility, fail: function () { msg.className = "msg warn"; msg.textContent = tr("loadError"); } };
  })();

  // ---------- chronomètre ----------
  (function () {
    var face = $("#c-time"), go = $("#c-go"), lapBtn = $("#c-lap"), list = $("#c-laps"), empty = $("#c-empty");
    var c = store("us013.timer") || { run: false, at: 0, acc: 0, laps: [] };
    var raf = 0, lock = null;
    function now() { return c.acc + (c.run ? Date.now() - c.at : 0); }
    function draw() {
      var ms = now(), main = fmt(ms), tenth = Math.floor(ms / 100) % 10;
      face.innerHTML = main + "<small>." + tenth + "</small>";
      if (c.run) raf = requestAnimationFrame(draw);
    }
    function drawLaps() {
      list.innerHTML = "";
      c.laps.forEach(function (ms, i) {
        var li = document.createElement("li");
        li.innerHTML = "<span></span><strong></strong>";
        li.firstChild.textContent = tr("lapN", { n: i + 1 }); li.lastChild.textContent = fmt(ms);
        list.appendChild(li);
      });
      empty.hidden = c.laps.length > 0; $("#c-clear").hidden = c.laps.length === 0;
    }
    function ui() {
      go.textContent = tr(c.run ? "stop" : "start");
      go.classList.toggle("primary", !c.run);
      lapBtn.disabled = !c.run && now() === 0;
      store("us013.timer", c);
      if (c.run) { cancelAnimationFrame(raf); draw(); wake(true); } else { cancelAnimationFrame(raf); draw(); wake(false); }
    }
    function wake(on) {
      try {
        if (on && "wakeLock" in navigator && !lock && document.visibilityState === "visible") {
          navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { lock = null; }); }).catch(function () {});
        } else if (!on && lock) { lock.release(); lock = null; }
      } catch (e) {}
    }
    go.addEventListener("click", function () {
      if (c.run) { c.acc = now(); c.run = false; } else { c.at = Date.now(); c.run = true; }
      ui();
    });
    $("#c-reset").addEventListener("click", function () { c.run = false; c.acc = 0; ui(); });
    lapBtn.addEventListener("click", function () { c.laps.push(now()); if (c.laps.length > 60) c.laps.shift(); drawLaps(); ui(); });
    $("#c-clear").addEventListener("click", function () { c.laps = []; drawLaps(); ui(); });
    document.addEventListener("visibilitychange", function () { if (c.run) wake(true); sudoku.onVisibility(); });
    drawLaps(); ui();
  })();

  // ---------- démarrage ----------
  show(location.hash === "#timer" ? "timer" : "sudoku");
  fetch("../data/daily.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { window.__daily = d; sudoku.load(d); })
    .catch(function () { sudoku.fail(); });
})();
