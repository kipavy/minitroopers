/*
 * Enhanced battle player: controls, synced log and keyboard shortcuts over the replay API of client_fr_play.swf.
 * Page -> SWF (methods of the Ruffle element #battle): mtPause, mtResume, mtSpeed(x), mtGoto(n) (synchronous, both
 * directions), mtState(), mtShot(). SWF -> page: mtReady({total, checkpoints, waves, starts}), mtProgress(idx, wave),
 * mtEnd(), mtStuck(idx). Every seek of the page goes through goto(n) -> mtGoto(n); the Ruffle player is never reloaded.
 * Page data: mtLog (one line of battleLog.ts per history entry: {i, w, t, c, x, s}, t = "" for technical ones) and
 * mtAt (?at=, or null).
 * Loaded before the battle embed: it wraps swfobject.embedSWF to start the readiness timer.
 * Calls into the SWF are never made from inside one of its callbacks (deferred with setTimeout).
 * The look lives in /css/player.css (.mtp-* classes only).
 */
(function () {
  var w = window;
  var d = document;
  var embed = w.swfobject && w.swfobject.embedSWF;
  if (!embed) return;

  // Speed slider: notches of a quarter octave from x1/8 (0) to x32 (32); x1 is notch 12.
  var NOTCHES = 32;
  var notchSpeed = function (v) {
    return Math.pow(2, v / 4 - 3);
  };
  var speedNotch = function (x) {
    return Math.max(0, Math.min(NOTCHES, Math.round((Math.log(x) / Math.LN2 + 3) * 4)));
  };
  var speedText = function (x) {
    if (x >= 1) return "×" + (Math.round(x * 10) / 10);
    var inv = 1 / x;
    return Math.abs(inv - Math.round(inv)) < 0.01 ? "×1/" + Math.round(inv) : "×" + (Math.round(x * 100) / 100);
  };
  var READY_MS = 10000;
  var JUMP = 10;
  var log = w.mtLog || [];
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
  var pendingAt = typeof w.mtAt === "number" && w.mtAt > 0 ? w.mtAt : 0;
  var readyTimer = null;
  var seekTimer = null;
  var ui = null;

  w.swfobject.embedSWF = function (url, id) {
    if (id === "swf_battle") started();
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
    var waves = list(r.waves);
    var starts = list(r.starts);
    // starts[k]: first keyframe after the NewWave waves[k], where wave seeks land without a replay
    info.ready = { total: r.total | 0, checkpoints: list(r.checkpoints), waves: waves, starts: starts.length === waves.length ? starts : waves.slice() };
    info.idx = 0;
    info.wave = 0;
    clearTimeout(readyTimer);
    setOff(false);
    if (ui) checkLog();
    var at = pendingAt;
    pendingAt = 0;
    if (at > 0) {
      setTimeout(function () {
        goto(at);
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

  /**
   * Goes to history index n, in either direction, through mtGoto (pause and speed kept). It lands within the call,
   * reporting mtProgress (and mtEnd at the end) synchronously; a long replay ends on the next frames, under the veil.
   */
  function goto(n) {
    if (!info.ready) return;
    n = Math.max(0, Math.min(total(), Math.floor(n)));
    stuck(false);
    ended = false;
    setSeeking(true);
    if (call("mtGoto", n) === true) setSeeking(false);
    update();
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

  function togglePause() {
    var s = state();
    if (!s) return;
    if (s.ended) {
      // "Revoir": from the start, playing
      if (s.paused) call("mtResume");
      paused = false;
      goto(0);
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
    var v = speedNotch(speed) + dir;
    if (v >= 0 && v <= NOTCHES) setSpeed(notchSpeed(v));
  }
  function toggleX2() {
    if (speed === 2) setSpeed(beforeX2 === 2 ? 1 : beforeX2);
    else {
      beforeX2 = speed;
      setSpeed(2);
    }
  }

  // The current log line is the last shown entry applied (index <= idx - 1); going to line i means applying it:
  // goto(i + 1), so that it becomes the current line.
  function nextEvent() {
    var cur = eventAt(currentIdx() - 1);
    if (cur + 1 < events.length) goto(events[cur + 1] + 1);
    else goto(total());
  }
  function prevEvent() {
    var cur = eventAt(currentIdx() - 1);
    if (cur >= 1) goto(events[cur - 1] + 1);
    else goto(0);
  }
  // Wave seeks land on starts[k], the new wave already deployed.
  function nextWave() {
    var idx = currentIdx();
    var waves = info.ready ? info.ready.waves : [];
    for (var i = 0; i < waves.length; i++) if (waves[i] > idx) return goto(info.ready.starts[i]);
    goto(total());
  }
  function prevWave() {
    var starts = info.ready ? info.ready.starts : [];
    var s = state();
    var idx = s ? s.idx : info.idx;
    var wave = s ? s.wave : info.wave;
    // within the first entries of a wave, it goes to the previous one
    if (wave >= 1 && idx > starts[wave - 1] + 2) goto(starts[wave - 1]);
    else if (wave >= 2) goto(starts[wave - 2]);
    else goto(0);
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

  /**
   * The shared link with `at=<idx>`: the battle's public page (mtShare, /b/fview/<id>) when there is one, since this page
   * may be the attacker's own /b/view/batN that nobody else can open; else this page's URL (other parameters kept).
   */
  function linkAt(idx) {
    var href = typeof w.mtShare === "string" && w.mtShare ? w.mtShare : w.location.href.split("#")[0];
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
    fit();
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
    if (off || !info.ready) return;
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === "/" && !editable(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      toggleHelp();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // the speed slider keeps its own arrows
    if (editable(e.target) && !(e.target === (ui && ui.range) && !/^Arrow/.test(e.key))) return;
    var key = e.key;
    var act = null;
    if (key === " " || key === "Spacebar" || key === "k" || key === "K") act = togglePause;
    else if (key === "ArrowRight") act = e.shiftKey ? function () { goto(currentIdx() + JUMP); } : nextEvent;
    else if (key === "ArrowLeft") act = e.shiftKey ? function () { goto(currentIdx() - JUMP); } : prevEvent;
    else if (key === "n" || key === "N") act = nextWave;
    else if (key === "p" || key === "P") act = prevWave;
    else if (key === "Home") act = function () { goto(0); };
    else if (key === "End") act = function () { goto(total()); };
    else if (key === "PageDown") act = nextWave;
    else if (key === "PageUp") act = prevWave;
    else if (key === "+" || key === "=" || key === "Add" || key === ">") act = function () { stepSpeed(1); };
    else if (key === "-" || key === "_" || key === "Subtract" || key === "<") act = function () { stepSpeed(-1); };
    else if (key === "c" || key === "C") act = captureSoon;
    else if (key === "?") act = toggleHelp;
    else if (key === "Escape" && helpOpen()) act = function () { showHelp(false); };
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
    fit();
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
    var text = off ? "" : !info.ready ? "Préparation du combat…" : seeking ? "Recherche de ce moment…" : "";
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

  // --- help: the site's own tooltip (mt.js.Tip of app.js, #tooltip, same markup as tip() in views/layout.ts), shown
  // while the "?" button is hovered or focused; ? and Ctrl+/ toggle it, Échap closes it

  // BetterTrooper's list inside the site's tooltip frame: keys drawn as keycaps, key | action rows alternating, then
  // the mouse as place | gesture | effect
  var HELP_HTML = (function () {
    var k = function (key) {
      return "<kbd>" + key + "</kbd>";
    };
    var or = " <b class='mtp-or'>ou</b> ";
    var keys = [
      [k("K") + or + k("Espace"), "Pause, reprise"],
      [k("N") + or + k("Pg suiv."), "Vague suivante"],
      [k("←") + " " + k("→"), "Un événement en arrière, en avant"],
      [k("Maj") + " + " + k("←") + " " + k("→"), "Dix événements"],
      [k("Pg préc.") + or + k("P"), "Début de la vague (à son tout début : la précédente)"],
      [k("Début") + " " + k("Fin"), "Début, fin du combat"],
      [k("&lt;") + " " + k("&gt;") + or + k("-") + " " + k("+"), "Plus lent, plus vite (un cran)"],
      [k("C"), "Capture d'écran"],
      [k("Ctrl") + " + " + k("/") + or + k("?"), "Cette liste (de nouveau, ou " + k("Échap") + " : la ferme)"]
    ];
    var mouse = [
      ["Terrain", [["Clic", "Pause, reprise"], ["Clic sur un soldat", "Sa fiche"]]],
      ["Frise", [["Clic", "Début de cette vague"], ["Glisser", "Cet événement précis"], [k("Maj") + " + clic", "Cet événement précis"]]],
      ["Journal", [["Clic sur une ligne", "Y aller"]]]
    ];
    var html = "<div class='tiptop'><div class='tipbottom'><div class='tipbg'><div class='tipcontent'>" +
      "<img src='/img/pixel.gif' class='pixel' /><h1>Raccourcis clavier</h1><table class='mtp-keys'>";
    for (var i = 0; i < keys.length; i++) html += "<tr><th>" + keys[i][0] + "</th><td>" + keys[i][1] + "</td></tr>";
    html += "</table><h1>Souris</h1><table class='mtp-mouse'>";
    for (var m = 0; m < mouse.length; m++) {
      var rows = mouse[m][1];
      html += "<tbody>";
      for (var r = 0; r < rows.length; r++) {
        html += "<tr>" + (r ? "" : "<th rowspan='" + rows.length + "'>" + mouse[m][0] + "</th>") + "<td>" + rows[r][0] + "</td><td>" + rows[r][1] + "</td></tr>";
      }
      html += "</tbody>";
    }
    return html + "</table></div></div></div></div>";
  })();

  function tipApi() {
    var t = w.mt && w.mt.js && w.mt.js.Tip;
    return t && typeof t.show === "function" ? t : null;
  }
  function helpOpen() {
    var t = tipApi();
    return !!(t && ui && t.lastRef === ui.helpBtn);
  }
  /** Shows the tip at `at` (page coordinates, as the tip's own mouse tracking), by default the button's centre. */
  function showHelp(v, at) {
    var t = tipApi();
    if (!t || !ui) return;
    if (v) {
      var r = ui.helpBtn.getBoundingClientRect();
      t.init();
      t.mousePos = at || { x: r.left + r.width / 2 + w.pageXOffset, y: r.top + r.height / 2 + w.pageYOffset };
      t.show(ui.helpBtn, HELP_HTML, "normalTip mtp-tip" + (d.documentElement.clientWidth >= 480 ? " mtp-tip--wide" : ""));
    } else if (helpOpen()) t.hide();
    ui.helpBtn.setAttribute("aria-expanded", helpOpen() ? "true" : "false");
  }
  function toggleHelp() {
    showHelp(!helpOpen());
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
    fit();
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
      var seg = node("span", "mtp-seg" + (k % 2 ? " mtp-odd" : ""));
      // numbered like the waves people see: the opening deployment is wave 1, each NewWave starts the next one
      seg.appendChild(node("span", "mtp-seg__label", String(k + 1)));
      seg.style.left = (from / t) * 100 + "%";
      seg.style.width = ((to - from) / t) * 100 + "%";
      seg.title = "Vague " + (k + 1);
      seg.setAttribute("data-wave", String(k));
      ui.segs.appendChild(seg);
      ui.segList.push(seg);
    }
  }

  /** Where a seek to the wave holding index n lands: starts[k] of that wave, 0 before the first NewWave. */
  function waveStart(n) {
    var waves = info.ready ? info.ready.waves : [];
    var start = 0;
    for (var i = 0; i < waves.length && waves[i] <= n; i++) start = info.ready.starts[i];
    return start;
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
    var shape = ended ? "again" : paused ? "play" : "pause";
    // the clock badges of entries played in advance flash only while the battle plays (BetterTrooper's --still)
    if (ui.list) toggleClass(ui.list, "mtp-still", !ready || paused || ended);
    if (ui.play.getAttribute("data-shape") !== shape) {
      ui.play.setAttribute("data-shape", shape);
      ui.play.innerHTML = "";
      ui.play.appendChild(icon(shape));
    }
    ui.play.title = ended ? "Revoir (Espace)" : paused ? "Lecture (Espace)" : "Pause (Espace)";
    ui.range.value = String(speedNotch(speed));
    ui.speedValue.textContent = speedText(speed);
    ui.x2.setAttribute("aria-pressed", speed === 2 ? "true" : "false");
    var pct = t > 0 ? (idx / t) * 100 : 0;
    ui.cursor.style.left = pct + "%";
    for (var j = 0; ui.segList && j < ui.segList.length; j++) {
      var sw = Number(ui.segList[j].getAttribute("data-wave"));
      toggleClass(ui.segList[j], "mtp-curwave", sw === info.wave);
    }
    var id = typeof w.battleID === "string" ? w.battleID : "";
    ui.where.textContent = ready
      ? "Combat #" + id + " · événement " + idx + " / " + t + " · vague " + (info.wave + 1) + " / " + (waves + 1)
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

  /**
   * Scales the 720x440 player down to the width of its screen: narrow windows, or the log beside it (wide windows,
   * player.css). Beside the player, the log takes its height and scrolls inside.
   */
  function fit() {
    if (!ui) return;
    toggleClass(ui.game, "mtp-side", !!(ui.log && ui.log.open));
    var width = ui.screen.clientWidth;
    var s = width > 0 && width < 720 ? width / 720 : 1;
    ui.stage.style.transform = s < 1 ? "scale(" + s + ")" : "";
    ui.screen.style.height = s < 1 ? Math.round(440 * s) + "px" : "";
    if (!ui.log) return;
    var frame = ui.screen.parentNode;
    var beside = ui.log.open && ui.log.offsetTop === frame.offsetTop && ui.log.offsetLeft > frame.offsetLeft;
    ui.log.style.height = beside ? frame.offsetHeight + "px" : "";
    ui.list.style.height = beside ? Math.max(0, ui.log.clientHeight - ui.summary.offsetHeight) + "px" : "";
  }

  /**
   * A log line as BetterTrooper's: the clock badge, then the line's segments (battleLog.ts `Seg`): names with their
   * head and faction colour, weapons and equipment with the game's own icons (client_fr.swf sheets, /img/log/),
   * other skills with theirs (/img/skills.png), vehicles, coordinates, damage, deaths, statuses and an army's HUD.
   */
  // the weapon sheet's columns (client_fr.swf: 8 columns of 7 rows, 18 px high), and the 16 px grids
  var WEAPON_X = [0, 34, 68, 102, 152, 202, 252, 286];
  var WEAPON_W = [34, 34, 34, 50, 50, 50, 34, 50];
  function sheetIcon(cls, x, y, width) {
    var s = node("span", cls);
    s.setAttribute("aria-hidden", "true");
    if (width) s.style.width = width + "px";
    s.style.backgroundPosition = -x + "px " + -y + "px";
    return s;
  }
  var two = function (n) {
    return (n < 10 ? "0" : "") + Math.max(0, n);
  };
  function hud(h) {
    var box = node("span", "mtp-hud");
    var stat = function (kind, text) {
      if (box.firstChild) box.appendChild(d.createTextNode(" "));
      box.appendChild(node("span", "mtp-stat mtp-stat--" + kind, text));
    };
    if (h[0] > 0) {
      stat("pool", two(h[0]));
      stat("dep", "+" + two(h[1]));
    }
    if (h[2] > 0) stat("com", String(h[2]));
    stat("sab", h[3] + "%");
    return box;
  }
  function segment(s) {
    if (typeof s === "string") return d.createTextNode(s);
    var e;
    if ("n" in s) {
      e = node("span", "mtp-lname", s.n);
      e.setAttribute("data-faction", String(s.f));
      if (s.u) e.setAttribute("data-unit", s.u);
      return e;
    }
    if ("a" in s) {
      e = node("span", "mtp-lside", s.a);
      e.setAttribute("data-faction", String(s.f));
      return e;
    }
    if ("w" in s || "k" in s) {
      var frag = d.createDocumentFragment();
      if ("w" in s) {
        if (s.g) frag.appendChild(sheetIcon("mtp-wicon", WEAPON_X[s.g[0]], s.g[1] * 18, WEAPON_W[s.g[0]]));
        frag.appendChild(node("span", "mtp-weapon", s.w));
      } else {
        if (typeof s.e === "number") frag.appendChild(sheetIcon("mtp-eqicon", (s.e % 10) * 16, Math.floor(s.e / 10) * 16));
        else if (typeof s.i === "number") frag.appendChild(sheetIcon("mtp-sicon", (s.i % 20) * 16, Math.floor(s.i / 20) * 16));
        frag.appendChild(node("span", "mtp-skill", s.k));
      }
      return frag;
    }
    if ("v" in s) return node("span", "mtp-vehicle", s.v);
    if ("xy" in s) return node("span", "mtp-coord", "(" + s.xy[0] + ", " + s.xy[1] + ")");
    if ("d" in s) return node("span", "mtp-dmg", String(s.d));
    if ("f" in s) return node("span", "mtp-fatal", s.f);
    if ("p" in s) return node("span", "mtp-poison", s.p);
    if ("st" in s) return node("span", "mtp-status", s.st);
    if ("x" in s) return node("span", "mtp-kill", s.x);
    if ("h" in s) return hud(s.h);
    return d.createTextNode("");
  }
  function fillLine(li, l) {
    var time = node("time", "mtp-time" + (l.x ? " mtp-time--warp" : ""), String(l.c | 0));
    li.appendChild(time);
    if (!l.s) return void li.appendChild(d.createTextNode(l.t));
    for (var k = 0; k < l.s.length; k++) li.appendChild(segment(l.s[k]));
  }

  var SVG = "http://www.w3.org/2000/svg";
  function svg(width, height) {
    var e = d.createElementNS(SVG, "svg");
    e.setAttribute("width", String(width));
    e.setAttribute("height", String(height));
    e.setAttribute("viewBox", "0 0 " + width + " " + height);
    e.setAttribute("aria-hidden", "true");
    e.setAttribute("class", "mtp-icon");
    return e;
  }
  function shape(parent, tag, attrs) {
    var e = d.createElementNS(SVG, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }
  /** n chevrons pointing left (dir -1) or right (1), stroked. */
  function chevrons(n, dir) {
    var step = 5;
    var width = 6 + step * (n - 1) + 4;
    var e = svg(width, 14);
    for (var i = 0; i < n; i++) {
      var x = 2 + i * step;
      var pts = dir > 0 ? x + ",2.5 " + (x + 5) + ",7 " + x + ",11.5" : x + 5 + ",2.5 " + x + ",7 " + (x + 5) + ",11.5";
      shape(e, "polyline", { points: pts, fill: "none", stroke: "currentColor", "stroke-width": "2.3", "stroke-linecap": "round", "stroke-linejoin": "round" });
    }
    return e;
  }
  function icon(kind) {
    var e = svg(16, 16);
    if (kind === "pause") {
      shape(e, "rect", { x: "3.2", y: "2.5", width: "3.4", height: "11", rx: "0.8", fill: "currentColor" });
      shape(e, "rect", { x: "9.4", y: "2.5", width: "3.4", height: "11", rx: "0.8", fill: "currentColor" });
    } else if (kind === "play") {
      shape(e, "path", { d: "M4.5 2.5 L13 8 L4.5 13.5 Z", fill: "currentColor", stroke: "currentColor", "stroke-width": "1", "stroke-linejoin": "round" });
    } else {
      shape(e, "path", { d: "M12.6 8.6 A4.8 4.8 0 1 1 9.8 3.6", fill: "none", stroke: "currentColor", "stroke-width": "2.2", "stroke-linecap": "round" });
      shape(e, "path", { d: "M8.4 0.9 L13 3.4 L8.9 6.4 Z", fill: "currentColor" });
    }
    return e;
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
    track.title = "Clic : début de la vague · glisser ou Maj + clic : cet événement";
    ui.segs = node("div", "mtp-segs");
    ui.cursor = node("div", "mtp-cursor");
    ui.ghost = node("div", "mtp-ghost");
    ui.ghost.hidden = true;
    track.appendChild(ui.segs);
    track.appendChild(ui.ghost);
    track.appendChild(ui.cursor);
    // click: start of that wave; drag or Shift + click: that exact event
    var drag = null;
    var at = function (e) {
      var r = track.getBoundingClientRect();
      return r.width > 0 ? Math.max(0, Math.min(total(), Math.round(((e.clientX - r.left) / r.width) * total()))) : 0;
    };
    track.addEventListener("pointerdown", function (e) {
      if (!info.ready || e.button !== 0) return;
      drag = { x: e.clientX, moved: false, shift: e.shiftKey };
      if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    track.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) > 3) {
        drag.moved = true;
        toggleClass(track, "mtp-drag", true);
      }
      if (drag.moved) {
        var n = at(e);
        ui.ghost.hidden = false;
        ui.ghost.style.left = (total() > 0 ? (n / total()) * 100 : 0) + "%";
        message("Événement " + n);
      }
    });
    var release = function (e) {
      if (!drag) return;
      var exact = drag.moved || drag.shift || e.shiftKey;
      drag = null;
      toggleClass(track, "mtp-drag", false);
      ui.ghost.hidden = true;
      if (e.type === "pointerup") {
        var n = at(e);
        goto(exact ? n : waveStart(n));
      }
    };
    track.addEventListener("pointerup", release);
    track.addEventListener("pointercancel", release);
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
        goto(currentIdx() + delta);
      };
    };
    var tbtn = function (n, dir, cls, title, fn, id) {
      var b = button("", "mtp-tr" + (cls ? " " + cls : ""), title, fn, id);
      b.appendChild(chevrons(n, dir));
      transport.appendChild(b);
    };
    tbtn(4, -1, "", "Début du combat (Début)", function () { goto(0); }, "mtp-start");
    tbtn(3, -1, "", "Vague précédente (P)", prevWave, "mtp-prevwave");
    tbtn(2, -1, "mtp-wide", JUMP + " événements en arrière (Maj + ←)", jump(-JUMP), "mtp-back10");
    tbtn(1, -1, "", "Événement précédent (←)", prevEvent, "mtp-prev");
    ui.play = button("", "mtp-play", "Pause (Espace)", togglePause, "mtp-play");
    transport.appendChild(ui.play);
    tbtn(1, 1, "", "Événement suivant (→)", nextEvent, "mtp-next");
    tbtn(2, 1, "mtp-wide", JUMP + " événements en avant (Maj + →)", jump(JUMP), "mtp-fwd10");
    tbtn(3, 1, "", "Vague suivante (N)", nextWave, "mtp-nextwave");
    tbtn(4, 1, "", "Fin du combat (Fin)", function () { goto(total()); }, "mtp-end");
    bar.appendChild(transport);

    // speed, x2, help
    var second = node("div", "mtp-secondary");
    second.appendChild(node("span", "mtp-speed__label", "Vitesse"));
    var scale = node("span", "mtp-scale");
    ui.range = node("input", "mtp-range");
    ui.range.type = "range";
    ui.range.id = "mtp-speed";
    ui.range.min = "0";
    ui.range.max = String(NOTCHES);
    ui.range.step = "1";
    ui.range.setAttribute("aria-label", "Vitesse");
    var onRange = function () {
      setSpeed(notchSpeed(Number(ui.range.value)));
    };
    ui.range.addEventListener("input", onRange);
    ui.range.addEventListener("change", onRange);
    var ticks = node("span", "mtp-ticks");
    for (var v = 0; v <= NOTCHES; v++) {
      var tick = node("i", v % 4 === 0 ? (v === 12 ? "mtp-tick mtp-tick--major mtp-tick--one" : "mtp-tick mtp-tick--major") : "mtp-tick");
      tick.style.left = (v / NOTCHES) * 100 + "%";
      ticks.appendChild(tick);
    }
    scale.appendChild(ticks);
    scale.appendChild(ui.range);
    second.appendChild(scale);
    ui.speedValue = node("span", "mtp-speed__value");
    second.appendChild(ui.speedValue);
    ui.x2 = button("×2", "mtp-xs", "Vitesse ×2", toggleX2, "mtp-x2");
    second.appendChild(ui.x2);
    // the "?" of the game's tips (/img/info.png), bigger: hover or focus shows the shortcuts in the site's tooltip
    var help = button("", "mtp-help-btn", "Raccourcis clavier (?)", function (e) {
      // a mouse already opened it by hovering, a tap opens it (a tap elsewhere closes it), Enter or Space toggles it
      if (e.detail === 0) toggleHelp();
      else if (lastPointer !== "mouse") showHelp(true, { x: e.pageX, y: e.pageY });
    }, "mtp-helpbtn");
    var lastPointer = "";
    help.addEventListener("pointerdown", function (e) {
      lastPointer = e.pointerType;
    });
    help.setAttribute("aria-expanded", "false");
    ui.helpBtn = help;
    second.appendChild(help);
    bar.appendChild(second);

    ui.linkrow = node("div", "mtp-linkrow");
    ui.linkbox = node("input", "mtp-linkbox");
    ui.linkbox.readOnly = true;
    ui.linkbox.setAttribute("aria-label", "Lien vers ce moment du combat");
    ui.linkrow.appendChild(ui.linkbox);
    ui.linkrow.style.display = "none";
    bar.appendChild(ui.linkrow);

    help.addEventListener("mouseenter", function (e) {
      showHelp(true, { x: e.pageX, y: e.pageY });
    });
    help.addEventListener("mouseleave", function () {
      showHelp(false);
    });
    help.addEventListener("focus", function () {
      if (!helpOpen()) showHelp(true);
    });
    help.addEventListener("blur", function () {
      if (!help.matches(":hover")) showHelp(false);
    });
    // touch screens have no "mouse leaves"
    d.addEventListener("pointerdown", function (e) {
      if (helpOpen() && !help.contains(e.target)) showHelp(false);
    });


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
      fillLine(li, log[i]);
      if (log[i].w !== lastWave) li.setAttribute("data-wave", String(log[i].w));
      lastWave = log[i].w;
      list.appendChild(li);
      ui.lines.push(li);
    }
    list.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== list && !t.getAttribute("data-i")) t = t.parentNode;
      if (t && t !== list) goto(Number(t.getAttribute("data-i")) + 1);
    });
    details.appendChild(list);
    details.addEventListener("toggle", function () {
      fit();
      shownIdx = -1;
      update();
    });
    logBox.parentNode.replaceChild(details, logBox);
    ui.log = details;
    ui.list = list;
    ui.summary = details.firstChild;

    if (info.ready) checkLog();
    setOff(off);
    update();
    fit();
    w.addEventListener("resize", fit);
    // the frame's height also changes with fonts, the link row, the stuck warning: the log beside follows it
    if (w.ResizeObserver) {
      new w.ResizeObserver(function () {
        w.requestAnimationFrame(fit);
      }).observe(frame);
    }
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", build);
  else build();
})();
