/* FR-101 : animation du tracé de chaque lettre, sur réglure Seyès. Rien n'est envoyé ni enregistré. */
(function () {
  "use strict";
  var LANG = document.documentElement.lang || "fr";
  var T = window.I18N[LANG] || window.I18N.fr;
  function tr(k, v) { var s = T[k] || k; if (v) Object.keys(v).forEach(function (x) { s = s.replace("{" + x + "}", v[x]); }); return s; }
  function $(q) { return document.querySelector(q); }
  var NS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (e) { e.textContent = tr(e.getAttribute("data-t")); });
  document.title = tr("title");

  var M = null, order = [], cur = 0, slow = false, run = 0;
  // cadre calculé sur le modèle (unités de police) : u = 1 pour 1000 unités par cadratin
  var W = 2000, TOP = 1550, BOT = -850, H = TOP - BOT, u = 1, DESC = -500;
  var svg = $("#stage-svg"), canvas = $("#pad"), stage = $("#stage");

  // courbe lisse passant par les points (Catmull-Rom)
  function smooth(p) {
    if (p.length === 1) return "M" + p[0][0] + " " + p[0][1];
    var d = "M" + p[0][0] + " " + p[0][1];
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += " C" + c1[0].toFixed(1) + " " + c1[1].toFixed(1) + " " + c2[0].toFixed(1) + " " + c2[1].toFixed(1) + " " + p2[0] + " " + p2[1];
    }
    return d;
  }

  function seyes(g, ox) {
    var xh = M.xHeight;
    if (LANG === "fr") {
      // réglure Seyès : un interligne = hauteur des petites lettres, marge rouge
      for (var k = -3; k <= 3; k++) {
        var y = k * xh; if (y > TOP || y < BOT) continue;
        el("line", { x1: ox - W, x2: ox + 2 * W, y1: y, y2: y, "class": k === 0 ? "main" : "" }, g);
      }
      el("line", { x1: ox + 40 * u, x2: ox + 40 * u, y1: BOT, y2: TOP, "class": "marg" }, g);
      return;
    }
    // autres pays : réglure à 4 lignes (jambages, ligne d'écriture, petites lettres, majuscules), bande des petites lettres teintée
    el("rect", { x: ox - W, y: 0, width: 3 * W, height: xh, "class": "band" }, g);
    [DESC, 0, xh, M.capHeight || 2 * xh].forEach(function (y, i) {
      el("line", { x1: ox - W, x2: ox + 2 * W, y1: y, y2: y, "class": i === 1 ? "main" : "" }, g);
    });
  }

  function draw(ch) {
    var my = ++run, G = M.glyphs[ch];
    svg.innerHTML = "";
    svg.style.setProperty("--u", u);
    var ox = -(W - G.adv) / 2;
    svg.setAttribute("viewBox", ox + " " + (-TOP) + " " + W + " " + H);
    svg.setAttribute("aria-label", tr(/[0-9]/.test(ch) ? "digitLabel" : (ch !== ch.toLowerCase()) ? "upperLabel" : "letter", { c: ch }));
    var root = el("g", { transform: "scale(1,-1)" }, svg);
    seyes(el("g", { "class": "seyes" }, root), ox);
    var id = "clip" + my;
    el("path", { d: G.outline }, el("clipPath", { id: id }, el("defs", {}, root)));
    el("path", { d: G.outline, "class": "ghost" }, root);
    var inkG = el("g", { "clip-path": "url(#" + id + ")" }, root);
    var marks = el("g", {}, root);
    var th = M.thickness * 1.6;
    var paths = G.strokes.map(function (s) {
      var p = el("path", { d: smooth(s), "class": "ink", "stroke-width": th }, inkG);
      var len = s.length > 1 ? p.getTotalLength() : 0;
      p.style.strokeDasharray = len + " " + (len + 10); p.style.strokeDashoffset = len;
      if (s.length === 1) { p.remove(); p = el("circle", { cx: s[0][0], cy: s[0][1], r: 0, fill: "#1E3A8A" }, inkG); }
      return { el: p, len: len, pts: s };
    });
    // points de départ numérotés et première flèche
    G.strokes.forEach(function (s, i) {
      var a = s[0], b = s[Math.min(s.length - 1, 3)] || a;
      if (s.length > 1) {
        var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 210 * u, x = a[0] + Math.cos(ang) * L, y = a[1] + Math.sin(ang) * L;
        var hx = Math.cos(ang), hy = Math.sin(ang), px = -hy, py = hx;
        el("path", { d: "M" + (a[0] + hx * 95 * u) + " " + (a[1] + hy * 95 * u) + " L" + x + " " + y + " M" + (x - (hx * 55 - px * 45) * u) + " " + (y - (hy * 55 - py * 45) * u) + " L" + x + " " + y + " L" + (x - (hx * 55 + px * 45) * u) + " " + (y - (hy * 55 + py * 45) * u), "class": "arrow" }, marks);
      }
      if (s.length === 1) a = [a[0] - 250 * u, a[1]]; // le point (i, j) : la pastille se met à côté pour ne pas le cacher
      el("circle", { cx: a[0], cy: a[1], r: 62 * u, "class": "startdot" }, marks);
      el("text", { x: a[0], y: -a[1], transform: "scale(1,-1)", "class": "startnum", "font-size": 80 * u }, marks).textContent = i + 1;
    });
    var tip = el("circle", { r: th * 0.55, "class": "tip", cx: -9999, cy: -9999 }, root);
    $("#big").textContent = ch;

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var speed = (slow ? 380 : 800) * u; // unités de police par seconde
    var i = 0;
    function next() {
      if (my !== run) return;
      if (i >= paths.length) { tip.setAttribute("cx", -9999); return; }
      var P = paths[i++];
      if (P.len === 0) { P.el.setAttribute("r", th * 0.75); setTimeout(next, 350); return; }
      if (reduce) { P.el.style.strokeDashoffset = 0; next(); return; }
      var t0 = null, dur = P.len / speed * 1000;
      function step(ts) {
        if (my !== run) return;
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur), l = P.len * k, pt = P.el.getPointAtLength(l);
        P.el.style.strokeDashoffset = P.len - l;
        tip.setAttribute("cx", pt.x); tip.setAttribute("cy", pt.y);
        if (k < 1) requestAnimationFrame(step); else setTimeout(next, 380);
      }
      requestAnimationFrame(step);
    }
    setTimeout(next, 600);
    clearPad();
    Array.prototype.forEach.call(document.querySelectorAll(".chips button"), function (b) { b.setAttribute("aria-current", b.dataset.c === ch ? "true" : "false"); });
  }

  // à toi : écrire au doigt
  var ctx2 = canvas.getContext("2d"), drawing = false, last = null;
  function fit() { var r = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; canvas.width = r.width * dpr; canvas.height = r.height * dpr; ctx2.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function clearPad() { ctx2.clearRect(0, 0, canvas.width, canvas.height); }
  function pos(e) { var r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  canvas.addEventListener("pointerdown", function (e) { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
  canvas.addEventListener("pointermove", function (e) {
    if (!drawing) return; var p = pos(e), r = stage.getBoundingClientRect();
    ctx2.strokeStyle = "#1E3A8A"; ctx2.lineCap = "round"; ctx2.lineJoin = "round"; ctx2.lineWidth = r.width / W * M.thickness * 1.3;
    ctx2.beginPath(); ctx2.moveTo(last[0], last[1]); ctx2.lineTo(p[0], p[1]); ctx2.stroke(); last = p; e.preventDefault();
  });
  ["pointerup", "pointercancel"].forEach(function (t) { canvas.addEventListener(t, function () { drawing = false; }); });
  $("#turn").addEventListener("click", function () {
    var on = this.getAttribute("aria-pressed") !== "true";
    this.setAttribute("aria-pressed", on); stage.classList.toggle("draw", on); $("#erase").hidden = !on;
    if (on) { fit(); run++; var tp = svg.querySelector(".tip"); if (tp) tp.setAttribute("cx", -9999); } else draw(order[cur]);
  });
  $("#erase").addEventListener("click", clearPad);
  window.addEventListener("resize", function () { if (stage.classList.contains("draw")) fit(); });

  $("#replay").addEventListener("click", function () { draw(order[cur]); });
  $("#slow").addEventListener("click", function () { slow = !slow; this.setAttribute("aria-pressed", slow); draw(order[cur]); });
  $("#prev").addEventListener("click", function () { cur = (cur + order.length - 1) % order.length; go(); });
  $("#next").addEventListener("click", function () { cur = (cur + 1) % order.length; go(); });
  function go() { if (location.hash !== "#" + encodeURIComponent(order[cur])) history.replaceState(null, "", "#" + encodeURIComponent(order[cur])); if ($("#turn").getAttribute("aria-pressed") === "true") $("#turn").click(); draw(order[cur]); }

  function chips(box, chars) {
    chars.split("").forEach(function (c) {
      var b = document.createElement("button"); b.type = "button"; b.dataset.c = c; b.setAttribute("aria-label", tr(/[0-9]/.test(c) ? "digitLabel" : (c !== c.toLowerCase()) ? "upperLabel" : "letter", { c: c }));
      var G = M.glyphs[c];
      if (G) {
        var s = el("svg", { viewBox: (-60 * u) + " " + (-TOP) + " " + (G.adv + 120 * u) + " " + H, width: "36", height: "44", "aria-hidden": "true" });
        el("path", { d: G.outline, transform: "scale(1,-1)", fill: "currentColor" }, s); b.appendChild(s);
        b.addEventListener("click", function () { cur = order.indexOf(c); go(); });
      } else { b.textContent = c; b.disabled = true; }
      box.appendChild(b);
    });
  }

  fetch("../models/" + LANG + ".json").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (m) {
    M = m;
    u = M.unitsPerEm / 1000;
    var hi = -1e9, lo = 1e9, wide = 0;
    Object.keys(M.glyphs).forEach(function (c) { var G = M.glyphs[c]; wide = Math.max(wide, G.adv); G.strokes.forEach(function (st) { st.forEach(function (q) { hi = Math.max(hi, q[1]); lo = Math.min(lo, q[1]); }); }); });
    TOP = hi + M.thickness * 1.5; BOT = lo - M.thickness * 1.5;
    DESC = Math.min.apply(null, "gjpqy".split("").filter(function (c) { return M.glyphs[c]; }).map(function (c) { return Math.min.apply(null, M.glyphs[c].strokes.map(function (st) { return Math.min.apply(null, st.map(function (q) { return q[1]; })); })); })); H = TOP - BOT; W = Math.max(2000 * u, wide + 700 * u);
    // alphabet de chaque pays : ñ en espagnol, ä ö ü ß en allemand
    var LOW = { es: "abcdefghijklmnñopqrstuvwxyz", de: "abcdefghijklmnopqrstuvwxyzäöüß" }[LANG] || "abcdefghijklmnopqrstuvwxyz";
    var UP = { es: "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ", de: "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ" }[LANG] || "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var all = LOW + UP + "0123456789";
    order = all.split("").filter(function (c) { return M.glyphs[c]; });
    chips($("#lower"), LOW); chips($("#upper"), UP); chips($("#digits"), "0123456789");
    var h = decodeURIComponent(location.hash.slice(1)); cur = Math.max(0, order.indexOf(h));
    $("#loading").hidden = true; $("#app").hidden = false; draw(order[cur]);
  }).catch(function () { $("#loading").hidden = true; $("#soon").hidden = false; });
})();
