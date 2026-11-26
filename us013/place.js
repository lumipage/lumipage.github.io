/* US-013 : page d'une destination (QR du livre) et page passeport. Tampons gardés sur l'appareil seulement. */
(function () {
  "use strict";
  var LANG = document.documentElement.lang || "en";
  var T = window.I18N[LANG] || window.I18N.en, S = window.SOUNDS[LANG] || window.SOUNDS.en;
  function tr(k, v) { var s = T[k] || window.I18N.en[k] || k; if (v) Object.keys(v).forEach(function (x) { s = s.replace("{" + x + "}", v[x]); }); return s; }
  function $(q) { return document.querySelector(q); }
  function load() { try { return JSON.parse(localStorage.getItem("us013.passport") || "{}") || {}; } catch (e) { return {}; } }
  function save(p) { try { localStorage.setItem("us013.passport", JSON.stringify(p)); } catch (e) {} }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function nice(iso) { var p = iso.split("-").map(Number); return new Intl.DateTimeFormat(LANG, { day: "numeric", month: "long", year: "numeric" }).format(new Date(p[0], p[1] - 1, p[2])); }
  function byN(n) { for (var i = 0; i < window.DEST.length; i++) if (window.DEST[i].n === n) return window.DEST[i]; return null; }

  Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (el) { el.textContent = tr(el.getAttribute("data-t")); });
  var page = document.body.getAttribute("data-page");

  if (page === "dest") {
    var n = +document.body.getAttribute("data-n"), d = byN(n);
    document.title = d.name[LANG] + " | " + tr("destOf", { n: n });
    $("#d-of").textContent = tr("destOf", { n: n });
    $("#d-name").textContent = d.name[LANG];
    $("#d-level").textContent = T.levels[d.lvl];
    $("#d-hear").textContent = d.mix.map(function (k) { return S[k]; }).join(", ");

    // ambiance
    var amb = null, play = $("#d-play"), vol = $("#d-vol");
    function setPlay(on) { play.setAttribute("aria-pressed", on ? "true" : "false"); $("#d-play-label").textContent = tr(on ? "stopAmb" : "playAmb"); }
    play.addEventListener("click", function () {
      if (amb) { amb.stop(); amb = null; setPlay(false); return; }
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
      amb = window.Ambient(d.mix); amb.setVolume(+vol.value); if (amb.ctx.resume) amb.ctx.resume();
      setPlay(true);
    });
    vol.addEventListener("input", function () { if (amb) amb.setVolume(+vol.value); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && amb) { amb.stop(); amb = null; setPlay(false); } });
    setPlay(false);

    // tampon
    var wrap = $("#d-stampwrap"), btn = $("#d-stamp"), info = $("#d-stamped");
    function show(anim) {
      var p = load();
      if (p[n]) {
        btn.hidden = true; info.hidden = false;
        $("#d-visa-date").textContent = nice(p[n]);
        $("#d-stamped-text").textContent = tr("stampedOn", { d: nice(p[n]) });
        wrap.classList.toggle("anim", !!anim);
      } else { btn.hidden = false; info.hidden = true; }
    }
    btn.addEventListener("click", function () { var p = load(); p[n] = today(); save(p); show(true); });
    $("#d-unstamp").addEventListener("click", function () { var p = load(); delete p[n]; save(p); show(false); });
    $("#d-visa-name").textContent = d.name[LANG].split(",")[0];
    show(false);
  }

  if (page === "passport") {
    var p = load(), k = Object.keys(p).filter(function (x) { return byN(+x); }).length;
    $("#p-count").textContent = tr("stampedCount", { k: k });
    // carte
    var M = window.MAP, ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + M.w + " " + M.h); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", tr("mapLabel"));
    var land = document.createElementNS(ns, "path"); land.setAttribute("d", M.land); land.setAttribute("class", "land"); svg.appendChild(land);
    window.DEST.forEach(function (d) {
      var a = document.createElementNS(ns, "a"), c = document.createElementNS(ns, "circle"), xy = M.pins[d.n];
      a.setAttribute("href", "../" + d.n + "/"); a.setAttribute("aria-label", d.n + ". " + d.name[LANG]);
      c.setAttribute("cx", xy[0]); c.setAttribute("cy", xy[1]); c.setAttribute("r", p[d.n] ? 9 : 7);
      c.setAttribute("class", "pin" + (p[d.n] ? " on" : ""));
      a.appendChild(c); svg.appendChild(a);
    });
    $("#p-map").appendChild(svg);
    // liste par niveau
    ["e", "m", "h"].forEach(function (lv) {
      var h = document.createElement("h2"); h.textContent = T.levels[lv]; $("#p-list").appendChild(h);
      var ol = document.createElement("ol"); ol.className = "dlist";
      window.DEST.filter(function (d) { return d.lvl === lv; }).forEach(function (d) {
        var li = document.createElement("li"), a = document.createElement("a");
        a.href = "../" + d.n + "/";
        a.innerHTML = '<span class="num"></span><span class="nm"></span><span class="mk" aria-hidden="true"></span>';
        a.children[0].textContent = d.n; a.children[1].textContent = d.name[LANG];
        if (p[d.n]) { li.className = "on"; a.children[2].textContent = "✓"; var so = tr("stampedOn", { d: nice(p[d.n]) }); a.setAttribute("aria-label", d.n + ". " + d.name[LANG] + ", " + so.charAt(0).toLowerCase() + so.slice(1)); }
        li.appendChild(a); ol.appendChild(li);
      });
      $("#p-list").appendChild(ol);
    });
  }
})();
