/*
 * Enhanced battle player: control bar, synced log and keyboard shortcuts over the replay API of client_fr_play.swf.
 * Page -> SWF (methods of the Ruffle element #battle): mtPause, mtResume, mtSpeed(x), mtSeek(n) (forward only),
 * mtState(), mtShot(). SWF -> page: mtReady({total, checkpoints, waves}), mtProgress(idx, wave), mtEnd(), mtStuck(idx).
 * Page data: mtLog (one {i, w, t} per history entry, t = "" for technical ones) and mtAt (?at=, or null).
 * Loaded before the battle embed: it wraps swfobject.embedSWF so that a backward seek can replay the same embed.
 * Calls into the SWF are never made from inside one of its callbacks (deferred with setTimeout).
 */
(function () {
  var w = window;
  var d = document;
  var embed = w.swfobject && w.swfobject.embedSWF;
  if (!embed) return;

  var SPEEDS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32];
  var SPEED_TEXT = ["×1/8", "×1/4", "×1/2", "×1", "×2", "×4", "×8", "×16", "×32"];
  var READY_MS = 10000;
  var log = w.mtLog || [];
  var events = []; // history indexes of the log lines shown (non-empty text)
  for (var k = 0; k < log.length; k++) if (log[k].t) events.push(log[k].i);

  /** Public state (also read by the end-to-end tests). */
  var info = (w.mtPlayer = { ready: null, idx: 0, wave: 0, first: null, players: 0 });
  var speed = 1;
  var paused = false;
  var ended = false;
  var off = false;
  var pending = typeof w.mtAt === "number" && w.mtAt > 0 ? { seek: w.mtAt, speed: 1, paused: false } : null;
  var embedArgs = null;
  var readyTimer = null;
  var ui = null;

  w.swfobject.embedSWF = function (url, id) {
    if (id === "swf_battle") {
      embedArgs = Array.prototype.slice.call(arguments);
      started();
    }
    return embed.apply(this, arguments);
  };

  function started() {
    info.players++;
    info.ready = null;
    info.first = null;
    ended = false;
    clearTimeout(readyTimer);
    readyTimer = setTimeout(function () {
      if (!info.ready) setOff(true);
    }, READY_MS);
    update();
  }

  function el() {
    return d.getElementById("battle");
  }
  function call(name, arg) {
    var e = el();
    if (!e || typeof e[name] !== "function") return undefined;
    try {
      return arguments.length > 1 ? e[name](arg) : e[name]();
    } catch (x) {
      return undefined;
    }
  }
  function state() {
    var s = info.ready ? call("mtState") : null;
    return s && typeof s.idx === "number" ? s : null;
  }

  // --- SWF callbacks ---

  w.mtReady = function (r) {
    var list = function (a) {
      var out = [];
      for (var i = 0; a && i < a.length; i++) out.push(a[i] | 0);
      return out;
    };
    info.ready = { total: r.total | 0, checkpoints: list(r.checkpoints), waves: list(r.waves) };
    info.idx = 0;
    info.wave = 0;
    clearTimeout(readyTimer);
    setOff(false);
    if (ui) checkLog();
    var p = pending;
    pending = null;
    if (p) {
      setTimeout(function () {
        if (p.speed !== 1) call("mtSpeed", p.speed);
        if (p.paused) call("mtPause");
        if (p.seek > 0) call("mtSeek", p.seek);
      }, 0);
    }
    update();
  };

  w.mtProgress = function (idx, wave) {
    info.idx = idx;
    info.wave = wave;
    if (info.first === null) info.first = idx;
    stuck(false);
    update();
  };

  w.mtEnd = function () {
    ended = true;
    update();
  };

  w.mtStuck = function () {
    stuck(true);
  };

  // --- actions ---

  function total() {
    return info.ready ? info.ready.total : 0;
  }

  /** Goes to history index n: forward through mtSeek, backward by recreating the Ruffle player. */
  function seek(n) {
    if (!info.ready) return;
    n = Math.max(0, Math.min(total(), Math.floor(n)));
    var s = state();
    var idx = s ? s.idx : info.idx;
    var done = s ? s.ended : ended;
    stuck(false);
    if (n > idx && !done) call("mtSeek", n);
    else if (n < idx) recreate(n);
  }

  function recreate(n) {
    var e = el();
    if (!e || !embedArgs || !e.parentNode) return;
    var s = state();
    pending = { seek: n, speed: speed, paused: s ? s.paused : paused };
    var holder = d.createElement("div");
    holder.id = "swf_battle";
    holder.className = "swf";
    e.parentNode.replaceChild(holder, e);
    info.idx = n;
    w.swfobject.embedSWF.apply(w.swfobject, embedArgs);
  }

  function togglePause() {
    var s = state();
    if (!s) return;
    if (s.ended) {
      paused = false;
      recreate(0);
    } else if (s.paused) {
      call("mtResume");
      paused = false;
    } else {
      call("mtPause");
      paused = true;
    }
    update();
  }

  function setSpeed(x) {
    speed = x;
    call("mtSpeed", x);
    update();
  }
  function stepSpeed(dir) {
    var i = SPEEDS.indexOf(speed) + dir;
    if (i >= 0 && i < SPEEDS.length) setSpeed(SPEEDS[i]);
  }

  function nextEvent() {
    var idx = currentIdx();
    for (var i = 0; i < events.length; i++) if (events[i] > idx) return seek(events[i]);
    seek(total());
  }
  function prevEvent() {
    var idx = currentIdx();
    for (var i = events.length - 1; i >= 0; i--) if (events[i] < idx - 1) return seek(events[i]);
    seek(0);
  }
  function nextWave() {
    var idx = currentIdx();
    var waves = info.ready ? info.ready.waves : [];
    for (var i = 0; i < waves.length; i++) if (waves[i] > idx) return seek(waves[i]);
    seek(total());
  }
  function prevWave() {
    var waves = info.ready ? info.ready.waves : [];
    var s = state();
    var idx = s ? s.idx : info.idx;
    var wave = s ? s.wave : info.wave;
    // within the first entries of a wave, P goes to the previous one
    if (wave >= 1 && idx > waves[wave - 1] + 2) seek(waves[wave - 1]);
    else if (wave >= 2) seek(waves[wave - 2]);
    else seek(0);
  }
  function currentIdx() {
    var s = state();
    return s ? s.idx : info.idx;
  }

  function capture() {
    var b64 = call("mtShot");
    if (!b64) return message("Capture impossible");
    var bin = w.atob(b64);
    var canvas = d.createElement("canvas");
    canvas.width = 720;
    canvas.height = 440;
    var ctx = canvas.getContext("2d");
    var img = ctx.createImageData(720, 440);
    var px = img.data;
    // ARGB (BitmapData.getPixels) to RGBA, opaque
    for (var i = 0, n = Math.min(bin.length, px.length); i < n; i += 4) {
      px[i] = bin.charCodeAt(i + 1);
      px[i + 1] = bin.charCodeAt(i + 2);
      px[i + 2] = bin.charCodeAt(i + 3);
      px[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    var idx = currentIdx();
    canvas.toBlob(function (blob) {
      if (!blob) return message("Capture impossible");
      var a = d.createElement("a");
      a.href = w.URL.createObjectURL(blob);
      a.download = "minitroopers-combat-" + idx + ".png";
      d.body.appendChild(a);
      a.click();
      d.body.removeChild(a);
      setTimeout(function () {
        w.URL.revokeObjectURL(a.href);
      }, 5000);
      message("Capture enregistrée");
    }, "image/png");
  }
  function captureSoon() {
    message("Capture…");
    setTimeout(capture, 30);
  }

  /** This page's URL with `at=<idx>` (other query parameters kept). */
  function linkAt(idx) {
    var href = w.location.href.split("#")[0];
    var q = href.indexOf("?");
    var base = q < 0 ? href : href.slice(0, q);
    var parts = q < 0 ? [] : href.slice(q + 1).split(/[&;]/);
    var keep = [];
    for (var i = 0; i < parts.length; i++) if (parts[i] && !/^at(=|$)/.test(parts[i])) keep.push(parts[i]);
    if (idx > 0) keep.push("at=" + idx);
    return base + (keep.length ? "?" + keep.join("&") : "");
  }
  function copyLink() {
    var text = linkAt(currentIdx());
    ui.linkbox.value = text;
    ui.linkbox.style.display = "";
    ui.linkbox.focus();
    ui.linkbox.select();
    var done = function () {
      message("Lien copié !");
    };
    try {
      if (w.navigator.clipboard && w.navigator.clipboard.writeText) w.navigator.clipboard.writeText(text).then(done, function () {});
      else if (d.execCommand && d.execCommand("copy")) done();
    } catch (x) {
      /* the link stays selected in the field */
    }
  }

  // --- keyboard ---

  function editable(t) {
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable === true;
  }

  function onKey(e) {
    if (off || !info.ready || e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
    var key = e.key;
    var act = null;
    if (key === " " || key === "Spacebar" || key === "k" || key === "K") act = togglePause;
    else if (key === "ArrowRight") act = e.shiftKey ? nextWave : nextEvent;
    else if (key === "ArrowLeft") act = e.shiftKey ? prevWave : prevEvent;
    else if (key === "n" || key === "N") act = nextWave;
    else if (key === "p" || key === "P") act = prevWave;
    else if (key === "Home") act = function () { seek(0); };
    else if (key === "End") act = function () { seek(total()); };
    else if (key === "+" || key === "=" || key === "Add") act = function () { stepSpeed(1); };
    else if (key === "-" || key === "_" || key === "Subtract") act = function () { stepSpeed(-1); };
    else if (key === "c" || key === "C") act = captureSoon;
    else if (key === "?") act = toggleHelp;
    else if (key === "Escape" && ui && ui.help.style.display !== "none") act = toggleHelp;
    if (!act) return;
    // Window capture phase: before Ruffle sees the key (the SWF's own Space skips a wave).
    e.preventDefault();
    e.stopPropagation();
    act();
  }
  w.addEventListener("keydown", onKey, true);

  // --- view ---

  function setOff(v) {
    off = v;
    if (!ui) return;
    ui.game.className = ui.game.className.replace(/ ?mtp-off/g, "") + (v ? " mtp-off" : "");
  }

  function stuck(show) {
    if (ui) ui.alert.style.display = show ? "" : "none";
  }

  var msgTimer = null;
  function message(text) {
    if (!ui) return;
    ui.msg.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () {
      ui.msg.textContent = "";
    }, 3000);
  }

  function toggleHelp() {
    if (ui) ui.help.style.display = ui.help.style.display === "none" ? "" : "none";
  }

  function node(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function button(text, cls, title, onClick) {
    var b = node("button", "mtp-btn" + (cls ? " " + cls : ""), text);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  /** The log is hidden when it does not match the SWF's history (one line per entry). */
  function checkLog() {
    if (log.length !== info.ready.total && !/mtp-nolog/.test(ui.game.className)) ui.game.className += " mtp-nolog";
    drawTrack();
  }

  function drawTrack() {
    var t = total();
    var waves = info.ready.waves;
    ui.segs.innerHTML = "";
    ui.waves.innerHTML = "";
    for (var k = 0; k <= waves.length && t > 0; k++) {
      var from = k === 0 ? 0 : waves[k - 1];
      var to = k < waves.length ? waves[k] : t;
      if (to <= from) continue;
      var seg = node("div", "mtp-seg" + (k % 2 ? " mtp-odd" : ""));
      seg.style.left = (from / t) * 100 + "%";
      seg.style.width = ((to - from) / t) * 100 + "%";
      seg.title = k === 0 ? "Déploiement" : "Vague " + k;
      ui.segs.appendChild(seg);
    }
    for (var v = 1; v <= waves.length; v++) {
      var b = button(String(v), "mtp-small", "Vague " + v, waveClick(waves[v - 1]));
      b.setAttribute("data-wave", String(v));
      ui.waves.appendChild(b);
    }
    ui.waveRow.style.display = waves.length ? "" : "none";
  }
  function waveClick(n) {
    return function () {
      seek(n);
    };
  }

  /** Last shown log line at or before index i (binary search), or -1. */
  function eventAt(i) {
    var lo = 0;
    var hi = events.length - 1;
    var found = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (events[mid] <= i) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  }

  var shownIdx = -1;
  function update() {
    if (!ui) return;
    var ready = !!info.ready;
    ui.bar.className = "mtp-bar" + (ready ? "" : " mtp-wait");
    var t = total();
    var idx = Math.min(info.idx, t);
    ui.play.textContent = ended ? "Revoir" : paused ? "Lecture" : "Pause";
    for (var i = 0; i < ui.speeds.length; i++) ui.speeds[i].className = "mtp-btn mtp-small" + (SPEEDS[i] === speed ? " mtp-on" : "");
    var pct = t > 0 ? (idx / t) * 100 : 0;
    ui.cursor.style.left = pct + "%";
    ui.played.style.width = pct + "%";
    ui.pos.textContent = ready ? "Événement " + idx + " / " + t : "Chargement…";
    var wb = ui.waves.children;
    for (var j = 0; j < wb.length; j++) wb[j].className = "mtp-btn mtp-small" + (j + 1 === info.wave ? " mtp-on" : "");
    if (idx !== shownIdx) {
      shownIdx = idx;
      highlight(idx);
    }
  }

  /** Line idx - 1 (the last applied entry) is current; later lines are dimmed, the next one marked. */
  function highlight(idx) {
    var cur = eventAt(idx - 1);
    for (var i = 0; i < ui.lines.length; i++) {
      var li = ui.lines[i];
      var c = li.getAttribute("data-wave") ? "mtp-wave" : "";
      if (i === cur) c += " mtp-cur";
      else if (i > cur) c += " mtp-future" + (i === cur + 1 ? " mtp-next" : "");
      li.className = c;
    }
    var at = ui.lines[cur];
    if (at && !ui.log.className.match(/mtp-folded/)) {
      var box = ui.list;
      if (at.offsetTop < box.scrollTop || at.offsetTop + at.offsetHeight > box.scrollTop + box.clientHeight) {
        box.scrollTop = Math.max(0, at.offsetTop - box.clientHeight / 3);
      }
    }
  }

  /** Scales the 720x440 player down to the available width (narrow screens). */
  function fit() {
    if (!ui) return;
    var width = ui.screen.clientWidth;
    var s = width > 0 && width < 720 ? width / 720 : 1;
    ui.stage.style.transform = s < 1 ? "scale(" + s + ")" : "";
    ui.screen.style.height = s < 1 ? Math.round(440 * s) + "px" : "";
  }

  function build() {
    var bar = d.getElementById("mtp-bar");
    var logBox = d.getElementById("mtp-log");
    var screen = d.querySelector(".mtp-screen");
    var game = d.querySelector(".mtp-game");
    if (!bar || !logBox || !screen || !game) return;
    ui = { bar: bar, log: logBox, screen: screen, stage: screen.firstChild, game: game, speeds: [], lines: [] };

    // log
    var head = node("div", "mtp-loghead");
    head.appendChild(node("span", "", "Journal"));
    var fold = button("Masquer", "mtp-small", "Replier le journal", function () {
      var folded = /mtp-folded/.test(logBox.className);
      logBox.className = "mtp-log" + (folded ? "" : " mtp-folded");
      fold.textContent = folded ? "Masquer" : "Afficher";
      shownIdx = -1;
      update();
    });
    head.appendChild(fold);
    logBox.appendChild(head);
    var list = node("ol", "mtp-lines");
    var lastWave = 0;
    for (var i = 0; i < log.length; i++) {
      if (!log[i].t) continue;
      var li = node("li", "", log[i].t);
      li.setAttribute("data-i", String(log[i].i));
      if (log[i].w !== lastWave) li.setAttribute("data-wave", String(log[i].w));
      lastWave = log[i].w;
      list.appendChild(li);
      ui.lines.push(li);
    }
    list.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== list && !t.getAttribute("data-i")) t = t.parentNode;
      if (t && t !== list) seek(Number(t.getAttribute("data-i")));
    });
    logBox.appendChild(list);
    ui.list = list;

    // bar
    ui.alert = node("div", "mtp-alert", "Le combat semble bloqué.");
    ui.alert.appendChild(button("Vague suivante", "", "Passer à la vague suivante", nextWave));
    ui.alert.style.display = "none";
    bar.appendChild(ui.alert);

    var row1 = node("div", "mtp-row");
    ui.play = button("Pause", "mtp-main", "Pause / lecture (Espace)", togglePause);
    ui.play.id = "mtp-play";
    row1.appendChild(ui.play);
    row1.appendChild(node("span", "mtp-label", "Vitesse"));
    var speeds = node("span", "mtp-row");
    speeds.id = "mtp-speeds";
    speeds.style.margin = "0";
    for (var s = 0; s < SPEEDS.length; s++) {
      var sb = button(SPEED_TEXT[s], "mtp-small", "Vitesse " + SPEED_TEXT[s], speedClick(SPEEDS[s]));
      sb.setAttribute("data-speed", String(SPEEDS[s]));
      speeds.appendChild(sb);
      ui.speeds.push(sb);
    }
    row1.appendChild(speeds);
    bar.appendChild(row1);

    var track = node("div", "mtp-track");
    track.id = "mtp-track";
    track.title = "Aller à ce moment du combat";
    ui.segs = node("div");
    ui.played = node("div", "mtp-played");
    ui.cursor = node("div", "mtp-cursor");
    track.appendChild(ui.segs);
    track.appendChild(ui.played);
    track.appendChild(ui.cursor);
    track.addEventListener("click", function (e) {
      var r = track.getBoundingClientRect();
      if (r.width > 0) seek(Math.round(((e.clientX - r.left) / r.width) * total()));
    });
    bar.appendChild(track);

    ui.waveRow = node("div", "mtp-row");
    ui.waveRow.appendChild(node("span", "mtp-label", "Vagues"));
    ui.waves = node("span", "mtp-row");
    ui.waves.id = "mtp-waves";
    ui.waves.style.margin = "0";
    ui.waveRow.appendChild(ui.waves);
    bar.appendChild(ui.waveRow);

    var row3 = node("div", "mtp-row");
    var start = button("Début", "", "Début du combat (Début)", function () {
      seek(0);
    });
    start.id = "mtp-start";
    var end = button("Fin", "", "Fin du combat (Fin)", function () {
      seek(total());
    });
    end.id = "mtp-end";
    var shot = button("Capture", "", "Capture d'écran (C)", captureSoon);
    shot.id = "mtp-shot";
    var link = button("Copier le lien", "", "Lien vers ce moment du combat", copyLink);
    link.id = "mtp-link";
    var helpBtn = button("?", "", "Raccourcis clavier (?)", toggleHelp);
    helpBtn.id = "mtp-helpbtn";
    ui.linkbox = node("input", "field mtp-linkbox");
    ui.linkbox.readOnly = true;
    ui.linkbox.style.display = "none";
    ui.msg = node("span", "mtp-msg");
    ui.pos = node("span", "mtp-pos");
    row3.appendChild(start);
    row3.appendChild(end);
    row3.appendChild(shot);
    row3.appendChild(link);
    row3.appendChild(helpBtn);
    row3.appendChild(ui.linkbox);
    row3.appendChild(ui.msg);
    row3.appendChild(ui.pos);
    bar.appendChild(row3);

    ui.help = node("div", "mtp-help");
    ui.help.id = "mtp-help";
    ui.help.style.display = "none";
    var keys = [
      [["Espace", "K"], "pause / lecture"],
      [["←", "→"], "événement précédent / suivant"],
      [["P", "N"], "vague précédente / suivante (ou Maj + ← / →)"],
      [["Début", "Fin"], "début / fin du combat"],
      [["−", "+"], "vitesse"],
      [["C"], "capture d'écran"],
      [["?"], "cette aide"]
    ];
    var table = node("table");
    for (var h = 0; h < keys.length; h++) {
      var tr = node("tr");
      var td = node("td");
      for (var q = 0; q < keys[h][0].length; q++) {
        if (q) td.appendChild(d.createTextNode(" "));
        td.appendChild(node("kbd", "", keys[h][0][q]));
      }
      tr.appendChild(td);
      tr.appendChild(node("td", "", keys[h][1]));
      table.appendChild(tr);
    }
    ui.help.appendChild(table);
    bar.appendChild(ui.help);

    if (info.ready) checkLog();
    else ui.waveRow.style.display = "none";
    setOff(off);
    update();
    fit();
    w.addEventListener("resize", fit);
  }
  function speedClick(x) {
    return function () {
      setSpeed(x);
    };
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", build);
  else build();
})();
