/*
 * Enhanced battle player: controls, synced log and keyboard shortcuts over the replay API of client_fr_play.swf.
 * Page -> SWF (methods of the Ruffle element #battle): mtPause, mtResume, mtSpeed(x), mtSeek(n) (forward only),
 * mtState(), mtShot(). SWF -> page: mtReady({total, checkpoints, waves}), mtProgress(idx, wave), mtEnd(), mtStuck(idx).
 * Page data: mtLog (one {i, w, t} per history entry, t = "" for technical ones), mtAt (?at=, or null) and mtSides
 * (army and trooper names of input sides 0 and 1, coloured in the log).
 * Loaded before the battle embed: it wraps swfobject.embedSWF so that a backward seek can replay the same embed.
 * Calls into the SWF are never made from inside one of its callbacks (deferred with setTimeout).
 * The look lives in /css/player.css (.mtp-* classes only).
 */
(function () {
  var w = window;
  var d = document;
  var embed = w.swfobject && w.swfobject.embedSWF;
  if (!embed) return;

  var SPEEDS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32];
  var SPEED_TEXT = ["×1/8", "×1/4", "×1/2", "×1", "×2", "×4", "×8", "×16", "×32"];
  var READY_MS = 10000;
  var JUMP = 10;
  var log = w.mtLog || [];
  var sides = w.mtSides || [[], []];
  var events = []; // history indexes of the log lines shown (non-empty text)
  for (var k = 0; k < log.length; k++) if (log[k].t) events.push(log[k].i);

  /** Public state (also read by the end-to-end tests). */
  var info = (w.mtPlayer = { ready: null, idx: 0, wave: 0, first: null, players: 0 });
  var speed = 1;
  var beforeX2 = 1;
  var paused = false;
  var ended = false;
  var off = false;
  var seeking = false;
  var pending = typeof w.mtAt === "number" && w.mtAt > 0 ? { seek: w.mtAt, speed: 1, paused: false } : null;
  var embedArgs = null;
  var readyTimer = null;
  var seekTimer = null;
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
        if (p.seek > 0) startSeek(p.seek);
        else setSeeking(false);
      }, 0);
    }
    update();
  };

  w.mtProgress = function (idx, wave) {
    info.idx = idx;
    info.wave = wave;
    if (info.first === null) info.first = idx;
    setSeeking(false);
    stuck(false);
    update();
  };

  w.mtEnd = function () {
    ended = true;
    setSeeking(false);
    update();
  };

  w.mtStuck = function () {
    stuck(true);
  };

  // --- actions ---

  function total() {
    return info.ready ? info.ready.total : 0;
  }
  function currentIdx() {
    var s = state();
    return s ? s.idx : info.idx;
  }

  /** Goes to history index n: forward through mtSeek, backward by recreating the Ruffle player. */
  function seek(n) {
    if (!info.ready) return;
    n = Math.max(0, Math.min(total(), Math.floor(n)));
    var s = state();
    var idx = s ? s.idx : info.idx;
    var done = s ? s.ended : ended;
    stuck(false);
    if (n > idx && !done) startSeek(n);
    else if (n < idx) recreate(n);
  }

  function startSeek(n) {
    call("mtSeek", n);
    setSeeking(true);
  }

  /** Seek veil: on until the landing mtProgress, or until mtState says the seek is over. */
  function setSeeking(v) {
    seeking = v;
    clearInterval(seekTimer);
    if (v) {
      seekTimer = setInterval(function () {
        var s = state();
        if (s && !s.seeking) setSeeking(false);
      }, 400);
    }
    veil();
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
    seeking = true;
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
  function toggleX2() {
    if (speed === 2) setSpeed(beforeX2 === 2 ? 1 : beforeX2);
    else {
      beforeX2 = speed;
      setSpeed(2);
    }
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
    // within the first entries of a wave, it goes to the previous one
    if (wave >= 1 && idx > waves[wave - 1] + 2) seek(waves[wave - 1]);
    else if (wave >= 2) seek(waves[wave - 2]);
    else seek(0);
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
    ui.linkrow.style.display = "";
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
    if (off || !info.ready || e.ctrlKey || e.metaKey || e.altKey) return;
    // the speed slider keeps its own arrows
    if (editable(e.target) && !(e.target === (ui && ui.range) && !/^Arrow/.test(e.key))) return;
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
    else if (key === "Escape" && ui && !ui.help.hidden) act = toggleHelp;
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
    toggleClass(ui.game, "mtp-off", v);
    veil();
  }

  function toggleClass(n, cls, on) {
    var list = (" " + n.className + " ").replace(" " + cls + " ", " ");
    n.className = (list + (on ? cls : "")).replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
  }

  function stuck(show) {
    if (ui) ui.stuck.hidden = !show;
  }

  /** Loading / seeking overlay over the stage. */
  function veil() {
    if (!ui) return;
    var text = off ? "" : !info.ready ? (info.players > 1 ? "Retour en arrière…" : "Préparation du combat…") : seeking ? "Avance rapide…" : "";
    ui.veil.hidden = !text;
    ui.veilText.textContent = text;
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
    if (ui) ui.help.hidden = !ui.help.hidden;
  }

  function node(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function button(text, cls, title, onClick, id) {
    var b = node("button", "mtp-btn" + (cls ? " " + cls : ""), text);
    b.type = "button";
    if (title) {
      b.title = title;
      b.setAttribute("aria-label", title);
    }
    if (id) b.id = id;
    b.addEventListener("click", onClick);
    return b;
  }

  /** The log is hidden when it does not match the SWF's history (one line per entry). */
  function checkLog() {
    toggleClass(ui.game, "mtp-nolog", log.length !== info.ready.total);
    toggleClass(ui.log, "mtp-nolog", log.length !== info.ready.total);
    drawTrack();
  }

  function drawTrack() {
    var t = total();
    var waves = info.ready.waves;
    ui.segs.innerHTML = "";
    ui.segList = [];
    for (var k = 0; k <= waves.length && t > 0; k++) {
      var from = k === 0 ? 0 : waves[k - 1];
      var to = k < waves.length ? waves[k] : t;
      if (to <= from) continue;
      var seg = node("span", "mtp-seg" + (k % 2 ? " mtp-odd" : ""), k === 0 ? "" : String(k));
      seg.style.left = (from / t) * 100 + "%";
      seg.style.width = ((to - from) / t) * 100 + "%";
      seg.title = k === 0 ? "Déploiement" : "Vague " + k;
      seg.setAttribute("data-wave", String(k));
      ui.segs.appendChild(seg);
      ui.segList.push(seg);
    }
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
    toggleClass(ui.bar, "mtp-wait", !ready);
    var t = total();
    var idx = Math.min(info.idx, t);
    var waves = ready ? info.ready.waves.length : 0;
    ui.play.textContent = ended ? "↺" : paused ? "▶" : "❚❚";
    ui.play.title = ended ? "Revoir (Espace)" : paused ? "Lecture (Espace)" : "Pause (Espace)";
    var si = SPEEDS.indexOf(speed);
    ui.range.value = String(si);
    ui.speedValue.textContent = SPEED_TEXT[si];
    ui.x2.setAttribute("aria-pressed", speed === 2 ? "true" : "false");
    var pct = t > 0 ? (idx / t) * 100 : 0;
    ui.cursor.style.left = pct + "%";
    for (var j = 0; ui.segList && j < ui.segList.length; j++) {
      var sw = Number(ui.segList[j].getAttribute("data-wave"));
      toggleClass(ui.segList[j], "mtp-curwave", sw > 0 && sw === info.wave);
    }
    var id = typeof w.battleID === "string" ? w.battleID : "";
    ui.where.textContent = ready
      ? "Combat #" + id + " · événement " + idx + " / " + t + (waves ? " · vague " + info.wave + " / " + waves : "")
      : "Combat #" + id + " · chargement…";
    if (idx !== shownIdx) {
      shownIdx = idx;
      highlight(idx);
    }
    veil();
  }

  /** Line idx - 1 (the last applied entry) is current; later lines are faded, the next one marked. */
  function highlight(idx) {
    var cur = eventAt(idx - 1);
    for (var i = 0; i < ui.lines.length; i++) {
      var li = ui.lines[i];
      var c = "mtp-line" + (li.getAttribute("data-wave") ? " mtp-wave" : "");
      if (i === cur) c += " mtp-cur";
      else if (i > cur) c += " mtp-future" + (i === cur + 1 ? " mtp-next" : "");
      li.className = c;
    }
    var at = ui.lines[cur];
    if (at && ui.log.open) {
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

  /** A log line, the army and trooper names coloured by side. */
  var nameRe = null;
  var nameSide = {};
  (function () {
    var all = [];
    for (var s = 0; s < 2; s++) {
      for (var i = 0; sides[s] && i < sides[s].length; i++) {
        var n = String(sides[s][i]);
        if (n && !(n in nameSide)) {
          nameSide[n] = s;
          all.push(n);
        }
      }
    }
    all.sort(function (a, b) {
      return b.length - a.length;
    });
    if (all.length) nameRe = new RegExp(all.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|"), "g");
  })();
  function fillLine(li, text) {
    if (!nameRe) return void li.appendChild(d.createTextNode(text));
    var last = 0;
    text.replace(nameRe, function (m, at) {
      if (at > last) li.appendChild(d.createTextNode(text.slice(last, at)));
      li.appendChild(node("span", "mtp-name mtp-side" + nameSide[m], m));
      last = at + m.length;
      return m;
    });
    if (last < text.length) li.appendChild(d.createTextNode(text.slice(last)));
  }

  function build() {
    var bar = d.getElementById("mtp-bar");
    var logBox = d.getElementById("mtp-log");
    var screen = d.querySelector(".mtp-screen");
    var game = d.querySelector(".mtp-game");
    var frame = game && game.querySelector(".swfframe");
    if (!bar || !logBox || !screen || !game || !frame) return;
    ui = { bar: bar, screen: screen, stage: screen.firstChild, game: game, lines: [] };

    // title bar: the original <h1> (absent on mission and raid pages) with the capture and link buttons
    var title = frame.querySelector("h1");
    if (!title) {
      title = node("h1", "", "Revoir le combat");
      frame.insertBefore(title, frame.firstChild);
    }
    var titleText = node("span", "mtp-title__text");
    while (title.firstChild) titleText.appendChild(title.firstChild);
    title.className = "mtp-title";
    title.appendChild(titleText);
    var actions = node("span", "mtp-title__actions");
    var shot = button("", "mtp-green mtp-xs", "Capture d'écran (C)", captureSoon, "mtp-shot");
    shot.appendChild(node("span", "mtp-cam"));
    actions.appendChild(shot);
    actions.appendChild(button("Partager", "mtp-green mtp-xs", "Copier le lien vers ce moment du combat", copyLink, "mtp-link"));
    title.appendChild(actions);

    // overlays on the stage
    ui.veil = node("div", "mtp-veil");
    var vbox = node("div", "mtp-veil__box");
    ui.veilText = node("div", "mtp-veil__text");
    vbox.appendChild(ui.veilText);
    vbox.appendChild(node("div", "mtp-progress"));
    ui.veil.appendChild(vbox);
    screen.appendChild(ui.veil);
    ui.stuck = node("div", "mtp-stuck");
    ui.stuck.appendChild(node("span", "", "Le combat semble bloqué."));
    ui.stuck.appendChild(button("Vague suivante", "mtp-xs", "Passer à la vague suivante", nextWave));
    ui.stuck.hidden = true;
    screen.appendChild(ui.stuck);

    // timeline + info line
    var track = node("div", "mtp-track");
    track.id = "mtp-track";
    track.title = "Aller à ce moment du combat";
    ui.segs = node("div", "mtp-segs");
    ui.cursor = node("div", "mtp-cursor");
    track.appendChild(ui.segs);
    track.appendChild(ui.cursor);
    track.addEventListener("click", function (e) {
      var r = track.getBoundingClientRect();
      if (r.width > 0) seek(Math.round(((e.clientX - r.left) / r.width) * total()));
    });
    bar.appendChild(track);
    var meta = node("div", "mtp-meta");
    ui.where = node("span", "mtp-where");
    ui.msg = node("span", "mtp-msg");
    meta.appendChild(ui.where);
    meta.appendChild(ui.msg);
    bar.appendChild(meta);

    // transport
    var transport = node("div", "mtp-transport");
    var jump = function (delta) {
      return function () {
        seek(currentIdx() + delta);
      };
    };
    transport.appendChild(button("«««", "", "Début du combat (Début)", function () { seek(0); }, "mtp-start"));
    transport.appendChild(button("««", "", "Vague précédente (P)", prevWave, "mtp-prevwave"));
    transport.appendChild(button("«", "mtp-wide", JUMP + " événements en arrière", jump(-JUMP)));
    transport.appendChild(button("‹", "", "Événement précédent (←)", prevEvent, "mtp-prev"));
    ui.play = button("❚❚", "mtp-play", "Pause (Espace)", togglePause, "mtp-play");
    transport.appendChild(ui.play);
    transport.appendChild(button("›", "", "Événement suivant (→)", nextEvent, "mtp-next"));
    transport.appendChild(button("»", "mtp-wide", JUMP + " événements en avant", jump(JUMP)));
    transport.appendChild(button("»»", "", "Vague suivante (N)", nextWave, "mtp-nextwave"));
    transport.appendChild(button("»»»", "", "Fin du combat (Fin)", function () { seek(total()); }, "mtp-end"));
    bar.appendChild(transport);

    // speed, x2, help
    var second = node("div", "mtp-secondary");
    second.appendChild(node("span", "mtp-speed__label", "Vitesse"));
    var scale = node("span", "mtp-scale");
    ui.range = node("input", "mtp-range");
    ui.range.type = "range";
    ui.range.id = "mtp-speed";
    ui.range.min = "0";
    ui.range.max = String(SPEEDS.length - 1);
    ui.range.step = "1";
    ui.range.setAttribute("aria-label", "Vitesse");
    var onRange = function () {
      setSpeed(SPEEDS[Number(ui.range.value)] || 1);
    };
    ui.range.addEventListener("input", onRange);
    ui.range.addEventListener("change", onRange);
    scale.appendChild(ui.range);
    second.appendChild(scale);
    ui.speedValue = node("span", "mtp-speed__value");
    second.appendChild(ui.speedValue);
    ui.x2 = button("×2", "mtp-xs", "Vitesse ×2", toggleX2, "mtp-x2");
    second.appendChild(ui.x2);
    var help = button("?", "mtp-help-btn mtp-xs", "Raccourcis clavier (?)", toggleHelp, "mtp-helpbtn");
    second.appendChild(help);
    bar.appendChild(second);

    ui.linkrow = node("div", "mtp-linkrow");
    ui.linkbox = node("input", "mtp-linkbox");
    ui.linkbox.readOnly = true;
    ui.linkbox.setAttribute("aria-label", "Lien vers ce moment du combat");
    ui.linkrow.appendChild(ui.linkbox);
    ui.linkrow.style.display = "none";
    bar.appendChild(ui.linkrow);

    ui.help = node("div", "mtp-help");
    ui.help.id = "mtp-help";
    ui.help.hidden = true;
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
    ui.help.appendChild(node("div", "mtp-help__title", "Raccourcis clavier"));
    ui.help.appendChild(table);
    bar.appendChild(ui.help);

    // log: a disclosure under the player
    var details = d.createElement("details");
    details.id = "mtp-log";
    details.className = "mtp-log";
    details.open = true;
    details.appendChild(node("summary", "", "Journal du combat"));
    var list = node("ol", "mtp-lines");
    var lastWave = 0;
    for (var i = 0; i < log.length; i++) {
      if (!log[i].t) continue;
      var li = node("li", "mtp-line");
      li.setAttribute("data-i", String(log[i].i));
      li.appendChild(node("span", "mtp-num", String(log[i].i)));
      fillLine(li, log[i].t);
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
    details.appendChild(list);
    details.addEventListener("toggle", function () {
      shownIdx = -1;
      update();
    });
    logBox.parentNode.replaceChild(details, logBox);
    ui.log = details;
    ui.list = list;

    if (info.ready) checkLog();
    setOff(off);
    update();
    fit();
    w.addEventListener("resize", fit);
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", build);
  else build();
})();
