/*
 * Enhanced battle player: controls, synced log and keyboard shortcuts over the replay API of client_fr_play.swf, after
 * BetterTrooper's viewer (bettertrooper.milvintsiss.com, recreated with its developer's permission).
 * Page -> SWF (methods of the Ruffle element #battle): mtPause, mtResume, mtSpeed(x), mtGoto(n) (synchronous, both
 * directions), mtState(), mtShot(); the game paused while a dialog is open or the tab is hidden.
 * SWF -> page: mtReady({total, checkpoints, waves, starts}), mtProgress(idx, wave), mtEnd(), mtStuck(idx), mtPaused(p).
 * The pause is the game's own pause screen (mtPause / mtResume, a click on the battlefield, a trooper's card): the SWF
 * reports every change through mtPaused, the page's only source for its pause state; jumps keep it.
 * Every seek of the page goes through goto(n) -> mtGoto(n); the Ruffle player is never reloaded.
 * Page data: mtLog (one line of battleLog.ts per history entry: {i, w, t, c, x, s}, t = "" for technical ones), mtAt
 * (?at=, or null), mtShare (the battle's public page, or null), mtDate (YYYY-MM-DD of the battle, or null).
 * Loaded before the battle embed: it wraps swfobject.embedSWF to start the readiness timer.
 * Calls into the SWF are never made from inside one of its callbacks (deferred with setTimeout).
 * The look lives in /css/player.css (.mtp-* classes only).
 */
(function () {
  var w = window;
  var d = document;
  var embed = w.swfobject && w.swfobject.embedSWF;
  if (!embed) return;

  // BetterTrooper's speed notches; x1 is notch 5, x2 notch 9
  var SPEEDS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8, 12, 16, 24, 32];
  var LABELS = ["1/16", "1/8", "1/4", "1/2", "3/4", "1", "1.25", "1.5", "1.75", "2", "2.5", "3", "4", "6", "8", "12", "16", "24", "32"];
  var X1 = 5;
  var X2 = 9;
  // transport steps, in history entries: all of them on wide screens, four around the pause button on narrow ones
  var STEPS = [-50, -10, -5, -1, 1, 5, 10, 50];
  var STEPS_PLAYING = [-50, -10, 10, 50];
  var STEPS_PAUSED = [-5, -1, 1, 5];
  var CHEVRONS = { 1: 1, 5: 2, 10: 3, 50: 4 };
  var NARROW = "(max-width: 720px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)";
  var LANDSCAPE = "(orientation: landscape) and (max-height: 500px) and (pointer: coarse)";
  var HOLD_MS = 500;
  var REPEAT_MS = 33;
  var AGAIN_MS = 700;
  var READY_MS = 10000;
  var log = w.mtLog || [];
  var events = []; // history indexes of the log lines shown (non-empty text)
  for (var k = 0; k < log.length; k++) if (log[k].t) events.push(log[k].i);
  var mm = function (q) {
    return w.matchMedia ? w.matchMedia(q) : { matches: false, addEventListener: function () {} };
  };
  var narrow = mm(NARROW);
  var landscape = mm(LANDSCAPE);
  var coarse = mm("(pointer: coarse)");

  /** Public state (also read by the end-to-end tests). */
  var info = (w.mtPlayer = { ready: null, idx: 0, wave: 0, first: null, players: 0 });
  var notch = X1;
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
    if (stuckAt !== null && idx !== stuckAt) stuck(null);
    update();
  };

  w.mtEnd = function () {
    ended = true;
    setSeeking(false);
    update();
  };

  w.mtPaused = function (p) {
    paused = !!p;
    update();
  };

  w.mtStuck = function (idx) {
    stuck(typeof idx === "number" ? idx : info.idx);
  };

  // --- actions ---

  function total() {
    return info.ready ? info.ready.total : 0;
  }
  function currentIdx() {
    var s = state();
    return s ? s.idx : info.idx;
  }
  function currentWave() {
    var s = state();
    return s && typeof s.wave === "number" ? s.wave : info.wave;
  }
  /** Where wave k starts (0: the opening deployment; k >= 1: the first keyframe after its NewWave). */
  function waveStart(k) {
    return k <= 0 || !info.ready ? 0 : info.ready.starts[k - 1];
  }
  function waveCount() {
    return info.ready ? info.ready.waves.length + 1 : 0;
  }

  /**
   * Goes to history index n, in either direction, through mtGoto (pause and speed kept). It lands within the call,
   * reporting mtProgress (and mtEnd at the end) synchronously; a long replay ends on the next frames, under the veil.
   */
  function goto(n) {
    if (!info.ready) return;
    n = Math.max(0, Math.min(total(), Math.floor(n)));
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

  // the SWF answers with mtPaused (the pause screen opens at its next frame)
  function togglePause() {
    if (!info.ready) return;
    call(paused ? "mtResume" : "mtPause");
  }

  function setNotch(v) {
    notch = Math.max(0, Math.min(SPEEDS.length - 1, v));
    call("mtSpeed", SPEEDS[notch]);
    update();
  }
  // "+" held: at least x2 while held, back to the notch before on release
  var boosted = null;
  function boost(on) {
    if (on && boosted === null && info.ready) {
      boosted = notch;
      if (notch < X2) setNotch(X2);
    } else if (!on && boosted !== null) {
      var before = boosted;
      boosted = null;
      if (before < X2 && notch === X2) setNotch(before);
    }
  }

  function step(n) {
    if (n) goto(currentIdx() + n);
  }
  // held steps: added up, applied once per frame
  var heldSum = 0;
  var heldFrame = 0;
  function stepHeld(n) {
    heldSum += n;
    if (!heldFrame) {
      heldFrame = w.requestAnimationFrame(function () {
        heldFrame = 0;
        var s = heldSum;
        heldSum = 0;
        step(s);
      });
    }
  }
  function nextWave() {
    var k = currentWave() + 1;
    if (info.ready && k < waveCount()) goto(waveStart(k));
  }
  // P: the start of the current wave; again within 700 ms: the wave before that one
  var lastRestart = null;
  function restartWave() {
    if (!info.ready) return;
    var now = Date.now();
    var k = lastRestart && now - lastRestart.t <= AGAIN_MS ? Math.max(0, lastRestart.wave - 1) : currentWave();
    lastRestart = { wave: k, t: now };
    goto(waveStart(k));
  }

  // --- the game paused while a dialog is open or the tab is hidden; resumed after, unless it was paused before ---

  var holds = {};
  var resumeAfter = false;
  function holdRuffle(why, on) {
    var any = function () {
      for (var key in holds) if (holds[key]) return true;
      return false;
    };
    if (on) {
      if (holds[why]) return;
      if (!any() && info.ready) {
        resumeAfter = !paused;
        if (resumeAfter) call("mtPause");
      }
      holds[why] = true;
    } else {
      if (!holds[why]) return;
      holds[why] = false;
      if (!any() && resumeAfter) call("mtResume");
      if (!any()) resumeAfter = false;
    }
  }
  d.addEventListener("visibilitychange", function () {
    holdRuffle("hidden", d.hidden);
    stopHold();
    boost(false);
  });
  function dialogOpen() {
    return !!d.querySelector("dialog[open]");
  }

  // --- toasts and banners ---

  var toastEl = null;
  var toastTimer = 0;
  /** BetterTrooper's toast: at the bottom of the window (or of the open dialog), 2.6 s (4.2 s with a note). */
  function toast(text, opts) {
    opts = opts || {};
    if (!text) return;
    var host = d.querySelector("dialog[open]") || d.body;
    if (!toastEl || toastEl.parentNode !== host) {
      if (toastEl) toastEl.remove();
      toastEl = node("p", "mtp-toast");
      toastEl.setAttribute("role", "status");
      host.appendChild(toastEl);
    }
    var t = toastEl;
    if (opts.note) {
      t.innerHTML = "";
      t.appendChild(node("strong", "mtp-toast__title", text));
      t.appendChild(d.createTextNode(" "));
      t.appendChild(node("small", "mtp-toast__note", opts.note));
    } else t.textContent = text;
    toggleClass(t, "mtp-toast--warning", !!opts.warning);
    w.requestAnimationFrame(function () {
      t.setAttribute("data-shown", "");
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.removeAttribute("data-shown");
    }, opts.ms || (opts.note ? 4200 : 2600));
  }

  function banner(kind, text) {
    if (!ui) return null;
    var b = node("div", "mtp-alert mtp-alert--" + kind, text);
    b.setAttribute("role", kind === "error" ? "alert" : "status");
    ui.banners.appendChild(b);
    fit();
    return b;
  }

  var stuckAt = null;
  var stuckBanner = null;
  /** The stuck warning above the player (null: gone). */
  function stuck(idx) {
    stuckAt = idx;
    if (stuckBanner) {
      stuckBanner.remove();
      stuckBanner = null;
      fit();
    }
    if (idx !== null) stuckBanner = banner("error", "Le combat est bloqué à l'événement " + idx + " : le jeu n'avance plus. Espace, la frise ou les boutons +1 à +50 font avancer le combat.");
  }

  // --- share ---

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
  function titleText() {
    return ui ? ui.titleText.getAttribute("data-title") : "";
  }
  var discordEscape = function (s) {
    return String(s).replace(/[\\*_~|`]/g, function (c) {
      return "\\" + c;
    }).replace(/@(everyone|here)/gi, "@​$1").replace(/<@/g, "<​@");
  };

  var share = null;
  function buildShare() {
    var dlg = dialog("mtp-share", "Partager ce combat");
    var body = dlg.body;
    var set = node("fieldset", "mtp-share__start");
    set.appendChild(node("legend", "mtp-share__legend", "Commencer à"));
    var choices = node("div", "mtp-share__choices");
    var choice = function (value, title, text) {
      var label = node("label", "mtp-share__choice");
      label.setAttribute("data-start", value);
      var radio = node("input", "mtp-share__radio");
      radio.type = "radio";
      radio.name = "mtp-share-start";
      radio.value = value;
      label.appendChild(radio);
      var t = node("span", "mtp-share__choice-title", title);
      label.appendChild(t);
      label.appendChild(node("span", "mtp-share__choice-text", text));
      choices.appendChild(label);
      return { label: label, radio: radio, title: t };
    };
    var start = { beginning: choice("beginning", "Le début", "Tout le combat, depuis son premier événement"), wave: choice("wave", "", "Le début de la vague que vous regardez, à l'arrivée de ses troupes"), event: choice("event", "", "Le moment exact que vous regardez") };
    set.appendChild(choices);
    body.appendChild(set);
    var text = node("textarea", "mtp-field mtp-share__text");
    text.readOnly = true;
    text.rows = 4;
    text.setAttribute("aria-label", "Message pour Discord");
    body.appendChild(text);
    var copyMsg = dlg.button("Copier pour Discord");
    var copyLink = dlg.button("Copier le lien");
    var native = dlg.button("Partager…");
    native.hidden = !(w.navigator.share && coarse.matches);
    var at = { wave: null, event: null };
    var picked = function () {
      var r = dlg.el.querySelector("input[name=mtp-share-start]:checked");
      return r && !r.closest("[hidden]") ? r.value : "beginning";
    };
    var link = function () {
      var p = picked();
      return linkAt(p === "wave" ? waveStart(at.wave - 1) : p === "event" ? at.event : 0);
    };
    var message = function () {
      var p = picked();
      var where = p === "wave" ? "vague " + at.wave : p === "event" ? "événement " + at.event : "";
      var url = link();
      return "⚔️ **" + discordEscape(titleText()) + "**" + (where ? " (" + where + ")" : "") + "\n[**" + url.replace(/^https?:\/\//, "") + "**](" + url + ")";
    };
    var refresh = function () {
      text.value = message();
      copyLink.title = "Lien vers le combat : " + link();
    };
    dlg.el.addEventListener("change", refresh);
    var copied = function (ok, what) {
      toast(ok ? what : "Votre navigateur a refusé de copier.", { warning: !ok });
    };
    copyMsg.addEventListener("click", function () {
      copyText(message(), text, function (ok) {
        copied(ok, "Message copié : collez-le dans Discord.");
      });
    });
    copyLink.addEventListener("click", function () {
      copyText(link(), null, function (ok) {
        copied(ok, "Lien copié.");
      });
    });
    native.addEventListener("click", function () {
      w.navigator.share({ title: titleText(), text: message() }).catch(function () {});
    });
    share = function () {
      if (dlg.el.open) return;
      var idx = currentIdx();
      at = { wave: info.ready && idx > 0 ? currentWave() + 1 : null, event: info.ready && idx > 0 ? idx : null };
      start.wave.label.hidden = !at.wave;
      start.wave.title.textContent = at.wave ? "Vague " + at.wave : "";
      start.event.label.hidden = !at.event;
      start.event.title.textContent = at.event ? "Événement " + at.event : "";
      start.beginning.radio.checked = true;
      refresh();
      dlg.open();
      start.beginning.radio.focus();
    };
  }
  function copyText(text, field, done) {
    var fallback = function () {
      if (!field) return done(false);
      field.value = text;
      field.select();
      try {
        done(!!d.execCommand("copy"));
      } catch (x) {
        done(false);
      }
    };
    try {
      w.navigator.clipboard.writeText(text).then(function () {
        done(true);
      }, fallback);
    } catch (x) {
      fallback();
    }
  }

  // --- capture ---

  /** The game's picture from mtShot (720x440 ARGB, BitmapData.getPixels), or null. */
  function gameCanvas() {
    var b64 = call("mtShot");
    if (!b64) return null;
    var bin = w.atob(b64);
    var canvas = d.createElement("canvas");
    canvas.width = 720;
    canvas.height = 440;
    var ctx = canvas.getContext("2d");
    var img = ctx.createImageData(720, 440);
    var px = img.data;
    for (var i = 0, n = Math.min(bin.length, px.length); i < n; i += 4) {
      px[i] = bin.charCodeAt(i + 1);
      px[i + 1] = bin.charCodeAt(i + 2);
      px[i + 2] = bin.charCodeAt(i + 3);
      px[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  var SANS = '"Segoe UI", "Lucida Grande", "Trebuchet MS", Arial, "Lucida Sans Unicode", sans-serif';
  var MONO = 'Consolas, Menlo, "DejaVu Sans Mono", monospace';
  /** The timeline as BetterTrooper draws it (canvas), w x h at (x, y). */
  function drawTrack(ctx, x, y, width, h) {
    var t = Math.max(1, total());
    var j = 2;
    var X = function (n) {
      return x + Math.round((n / t) * (width - 2 * j)) + j;
    };
    ctx.fillStyle = "#3f301c";
    ctx.fillRect(x, y, width, h);
    var cur = currentWave();
    for (var k = 0; k < waveCount(); k++) {
      var a = X(waveStart(k));
      var b = X(k + 1 < waveCount() ? waveStart(k + 1) : t);
      ctx.fillStyle = k === cur ? "#ffda49" : k % 2 ? "#b47a2e" : "#cd9342";
      ctx.fillRect(a, y + j, Math.max(1, b - a - 1), h - 2 * j);
      if (h >= 18 && b - a > 16) {
        ctx.fillStyle = k === cur ? "#3f301c" : "#fff8e5";
        ctx.font = "11px " + MONO;
        ctx.fillText(String(k + 1), a + 4, y + h / 2 + 4);
      }
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(X(Math.min(currentIdx(), t)) - 1, y, 2, h);
  }
  var camoImg = null;
  /** BetterTrooper's framed picture: the camo frame, the title and date, the stage, the timeline, the battle's line. */
  function framedCanvas(game) {
    var B = 1, PAD = 8, TOP = 6, BOTTOM = 8, TITLE = 30, GAP = 7, EDGE = 1, TL = 20;
    var CW = 720 + 2 * EDGE;
    var x0 = B + PAD;
    var W = 2 * x0 + CW;
    var yTitle = B + TOP;
    var yStage = yTitle + TITLE + GAP;
    var yUnder = yStage + EDGE + 440 + EDGE;
    var T = yUnder + TL + 6;
    var meas = d.createElement("canvas").getContext("2d");
    var id = ui.whereId.textContent;
    var rest = ui.wherePos.textContent;
    var linkText = linkAt(0).replace(/^https?:\/\//, "");
    var width = function (font, s) {
      meas.font = font;
      return meas.measureText(s).width;
    };
    var wrap = width("bold 11px " + MONO, id) + width("11px " + MONO, rest) + 16 + width("11px " + SANS, linkText) > CW - 16;
    var A = 22 + (wrap ? 13 : 0);
    var H = T + A + BOTTOM + B;
    var c = d.createElement("canvas");
    c.width = W;
    c.height = H;
    var v = c.getContext("2d");
    var rr = function (x, y, ww, hh, r) {
      var rs = r instanceof Array ? r : [r, r, r, r];
      v.moveTo(x + rs[0], y);
      v.arcTo(x + ww, y, x + ww, y + hh, rs[1]);
      v.arcTo(x + ww, y + hh, x, y + hh, rs[2]);
      v.arcTo(x, y + hh, x, y, rs[3]);
      v.arcTo(x, y, x + ww, y, rs[0]);
      v.closePath();
    };
    v.fillStyle = "#6b4320";
    v.beginPath();
    rr(0, 0, W, H, 8);
    v.fill();
    v.save();
    v.beginPath();
    rr(B, B, W - 2 * B, H - 2 * B, 7);
    v.clip();
    v.fillStyle = "#d4a244";
    v.fillRect(0, 0, W, H);
    if (camoImg && camoImg.complete && camoImg.naturalWidth) {
      v.translate(B, B);
      v.fillStyle = v.createPattern(camoImg, "repeat");
      v.fillRect(-B, -B, W, H);
      v.setTransform(1, 0, 0, 1, 0, 0);
    }
    var edges = [[0, -1, "#c6832e"], [-1, 0, "#ca8b33"], [1, 0, "#e3c284"], [0, 1, "#e8cd91"]];
    for (var e = 0; e < edges.length; e++) {
      v.beginPath();
      v.rect(0, 0, W, H);
      rr(B + edges[e][0], B + edges[e][1], W - 2 * B, H - 2 * B, 7);
      v.fillStyle = edges[e][2];
      v.fill("evenodd");
    }
    v.restore();
    var box = function (y, hh, fill) {
      v.fillStyle = "#8f642c";
      v.fillRect(x0, y, CW, hh);
      v.fillStyle = "#bd8d3c";
      v.fillRect(x0 + 1, y + 1, CW - 2, hh - 2);
      v.fillStyle = fill;
      v.fillRect(x0 + 2, y + 2, CW - 4, hh - 4);
    };
    box(yTitle, TITLE, "#d4a244");
    var title = titleText() + (w.mtDate && ui.date ? " (" + ui.date.textContent + ")" : "");
    var px = 14.28;
    for (; px > 10; px -= 0.5) {
      v.font = "bold " + px + "px " + SANS;
      if (v.measureText(title).width <= CW - 28) break;
    }
    v.font = "bold " + px + "px " + SANS;
    v.textAlign = "center";
    var ty = yTitle + Math.round(TITLE / 2 + px * 0.36);
    v.save();
    v.shadowColor = "rgba(0, 0, 0, 0.5)";
    v.shadowBlur = 2;
    var halo = [[-1, 0], [0, 1], [1, 0]];
    for (var s = 0; s < halo.length; s++) {
      v.shadowOffsetX = 10000 + halo[s][0];
      v.shadowOffsetY = halo[s][1];
      v.fillText(title, W / 2 - 10000, ty);
    }
    v.restore();
    v.fillStyle = "#fff";
    v.fillText(title, W / 2, ty);
    v.fillStyle = "#d7a84b";
    v.fillRect(x0, yStage - 2, CW, 1);
    v.fillStyle = "#deb862";
    v.fillRect(x0, yStage - 1, CW, 1);
    v.fillStyle = "#6b4320";
    v.fillRect(x0, yStage, CW, yUnder - yStage);
    v.drawImage(game, x0 + EDGE, yStage + EDGE);
    v.save();
    v.beginPath();
    rr(x0, yUnder, CW, TL, [0, 0, 4, 4]);
    v.clip();
    drawTrack(v, x0, yUnder, CW, TL);
    v.restore();
    box(T, A, "#f2ddb8");
    var by = T + Math.round((22 - 13.2) / 2 + 9.5);
    v.fillStyle = "#6b4320";
    v.textAlign = "left";
    v.font = "bold 11px " + MONO;
    v.fillText(id, x0 + 8, by);
    var idw = v.measureText(id).width;
    v.font = "11px " + MONO;
    v.fillText(rest, x0 + 8 + idw, by);
    v.textAlign = "right";
    v.font = "11px " + SANS;
    v.fillText(linkText, x0 + CW - 8, wrap ? by + 13 : by);
    return c;
  }

  var capture = null;
  function buildCapture() {
    var dlg = dialog("mtp-shotdlg", "Capture d'écran");
    dlg.el.className += " mtp-shot";
    var list = node("div", "mtp-shot__list");
    var canCopy = !!(w.navigator.clipboard && w.navigator.clipboard.write && w.ClipboardItem);
    var items = {};
    var item = function (kind, name, alt) {
      var sec = node("section", "mtp-shot__item");
      sec.setAttribute("data-shot", kind);
      sec.appendChild(node("h3", "mtp-shot__name", name));
      var bottom = node("div", "mtp-shot__bottom");
      var img = node("img", "mtp-shot__preview");
      img.alt = alt;
      bottom.appendChild(img);
      var acts = node("div", "mtp-shot__actions");
      var act = function (what, text) {
        var b = kbdButton(text, "mtp-btn mtp-camo mtp-sm");
        b.setAttribute("data-act", what);
        acts.appendChild(b);
        return b;
      };
      var copy = act("copy", "Copier");
      copy.hidden = !canCopy;
      act("download", "Télécharger");
      var shareBtn = act("share", "Partager…");
      shareBtn.hidden = true;
      bottom.appendChild(acts);
      sec.appendChild(bottom);
      list.appendChild(sec);
      items[kind] = { img: img, share: shareBtn, blob: null, url: null, file: null };
    };
    item("framed", "Avec les détails du combat", "Capture du jeu avec le titre et la date du combat, la frise, le numéro du combat et son lien");
    item("game", "Le jeu seul", "Capture du jeu");
    dlg.body.appendChild(list);
    dlg.el.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-act]");
      var it = b && items[b.closest(".mtp-shot__item").getAttribute("data-shot")];
      if (!it || !it.blob) return;
      var what = b.getAttribute("data-act");
      if (what === "download") {
        var a = node("a");
        a.href = it.url;
        a.download = it.file.name;
        a.hidden = true;
        dlg.el.appendChild(a);
        a.click();
        a.remove();
      } else if (what === "copy") {
        var refused = function () {
          toast("Votre navigateur a refusé de copier l'image : utilisez Télécharger.", { warning: true });
        };
        try {
          w.navigator.clipboard.write([new w.ClipboardItem({ "image/png": it.blob })]).then(function () {
            toast("Image copiée.");
          }, refused);
        } catch (x) {
          refused();
        }
      } else if (what === "share") {
        w.navigator.share({ files: [it.file], title: titleText() }).catch(function (x) {
          if (!x || x.name !== "AbortError") toast("Le partage a échoué : utilisez Télécharger.", { warning: true });
        });
      }
    });
    var busy = false;
    var file = function (framed) {
      return "minitroopers-" + (typeof w.battleID === "string" ? w.battleID : "combat") + (framed ? "-encadre" : "") + ".png";
    };
    var blob = function (canvas, done) {
      canvas.toBlob(function (b) {
        done(b);
      }, "image/png");
    };
    capture = function () {
      if (busy || dlg.el.open) return;
      if (!info.ready || seeking) return void toast("Attendez que le combat soit chargé, puis faites la capture.", { warning: true });
      var game = gameCanvas();
      if (!game) return void toast("Pas de jeu à capturer.", { warning: true });
      busy = true;
      var framed = framedCanvas(game);
      blob(game, function (g) {
        blob(framed, function (f) {
          busy = false;
          if (!g || !f) return void toast("La capture a échoué : réessayez.", { warning: true });
          var set = function (it, b, canvas, isFramed) {
            if (it.url) w.URL.revokeObjectURL(it.url);
            it.blob = b;
            it.url = w.URL.createObjectURL(b);
            it.file = new w.File([b], file(isFramed), { type: "image/png" });
            it.img.width = canvas.width;
            it.img.height = canvas.height;
            it.img.src = it.url;
            var can = false;
            try {
              can = !!(w.navigator.canShare && w.navigator.canShare({ files: [it.file] }));
            } catch (x) {
              can = false;
            }
            it.share.hidden = !can;
          };
          set(items.framed, f, framed, true);
          set(items.game, g, game, false);
          dlg.open();
          var first = dlg.el.querySelector('[data-shot="framed"] [data-act="' + (canCopy ? "copy" : "download") + '"]');
          if (first) first.focus();
        });
      });
    };
  }

  /** A dialog after BetterTrooper's (mt-dialog: steel header, title plate, round close button), numbered buttons. */
  function dialog(id, title) {
    var e = node("dialog", "mtp-dialog");
    e.id = id;
    var head = node("header", "mtp-dialog__header");
    head.appendChild(node("h2", "mtp-dialog__title", title));
    var form = node("form");
    form.method = "dialog";
    var x = node("button", "mtp-dialog__close");
    x.setAttribute("aria-label", "Fermer");
    form.appendChild(x);
    head.appendChild(form);
    e.appendChild(head);
    var body = node("div", "mtp-dialog__body");
    e.appendChild(body);
    var foot = node("div", "mtp-dialog__footer");
    e.appendChild(foot);
    d.body.appendChild(e);
    // a click on the backdrop closes it
    e.addEventListener("click", function (ev) {
      if (ev.target !== e) return;
      var r = e.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) e.close();
    });
    // 1 to 9: the numbered buttons
    e.addEventListener("keydown", function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat || !/^[1-9]$/.test(ev.key)) return;
      var b = e.querySelector('button[aria-keyshortcuts="' + ev.key + '"]');
      if (!b || b.disabled || b.closest("[hidden]")) return;
      ev.preventDefault();
      b.focus();
      b.click();
    });
    new w.MutationObserver(function () {
      holdRuffle(id, e.open);
    }).observe(e, { attributes: true, attributeFilter: ["open"] });
    return {
      el: e,
      body: body,
      button: function (text) {
        var b = kbdButton(text, "mtp-btn mtp-camo");
        foot.appendChild(b);
        return b;
      },
      open: function () {
        var n = 0;
        var kbds = e.querySelectorAll(".mtp-kbd--button");
        for (var i = 0; i < kbds.length; i++) {
          var b = kbds[i].closest("button");
          var key = !b.closest("[hidden]") && !b.hidden && !b.disabled && n < 9 ? String(++n) : "";
          kbds[i].textContent = key;
          if (key) b.setAttribute("aria-keyshortcuts", key);
          else b.removeAttribute("aria-keyshortcuts");
        }
        showHelp(false);
        if (!e.open) e.showModal();
      },
    };
  }
  function kbdButton(text, cls) {
    var b = node("button", cls, text);
    b.type = "button";
    var k = node("kbd", "mtp-kbd mtp-kbd--button");
    k.setAttribute("aria-hidden", "true");
    b.appendChild(k);
    return b;
  }

  // --- keyboard (BetterTrooper's) ---

  function isMac() {
    var p = (w.navigator.userAgentData && w.navigator.userAgentData.platform) || w.navigator.platform || "";
    return /mac|iphone|ipad/i.test(p);
  }
  function helpKey(e) {
    return (e.key === "/" && (e.ctrlKey || e.metaKey) && !e.altKey) || (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey);
  }
  // keys go to these elements as usual
  function own(t) {
    return !!(t && t.closest && t.closest("input, textarea, select, dialog, [contenteditable]"));
  }
  var swallowUntil = 0;

  function onKey(e) {
    if (off || e.defaultPrevented || own(e.target)) return;
    var mod = e.ctrlKey || e.metaKey || e.altKey;
    // while loading or seeking, the keys wait
    if (!info.ready || seeking || Date.now() < swallowUntil) {
      if (!mod && !/^F([1-9]|1\d|2[0-4])$/.test(e.key || "")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (helpKey(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) toggleHelp(true);
      return;
    }
    if (mod) return;
    var key = e.key;
    var act = null;
    var repeatable = false;
    if (key === " " || key === "Spacebar") {
      // Space on a button or a link activates it
      if (e.target && e.target.closest && e.target.closest("button, a, summary")) return;
      act = e.shiftKey ? togglePause : nextWave;
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      var n = (key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1);
      act = function () {
        (e.repeat ? stepHeld : step)(n);
      };
      repeatable = true;
    } else if (key === "Home" || key === "h" || key === "H") act = function () { goto(0); };
    else if (key === "End" || key === "e" || key === "E") act = function () { goto(total()); };
    else if (key === "PageUp" || key === "p" || key === "P") act = restartWave;
    else if (key === "n" || key === "N") act = nextWave;
    else if (key === "<" || key === "[") {
      act = function () { setNotch(notch - 1); };
      repeatable = true;
    } else if (key === ">" || key === "]") {
      act = function () { setNotch(notch + 1); };
      repeatable = true;
    } else if (key === "+" || key === "=") act = function () { boost(true); };
    else if (key === "k" || key === "K") act = togglePause;
    else if (key === "s" || key === "S") act = function () { if (share) share(); };
    else if (key === "c" || key === "C") act = function () { if (capture) capture(); };
    else if (key === "Escape" && helpOpen()) act = function () { showHelp(false); };
    if (!act) return;
    // Window capture phase: before Ruffle sees the key
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat || repeatable) act();
  }
  w.addEventListener("keydown", onKey, true);
  w.addEventListener("keyup", function (e) {
    if (e.key === "+" || e.key === "=") {
      boost(false);
      e.stopImmediatePropagation();
    }
  }, true);
  w.addEventListener("blur", function () {
    boost(false);
    stopHold();
  });

  // --- view ---

  function setOff(v) {
    off = v;
    if (!ui) return;
    toggleClass(ui.game, "mtp-off", v);
    if (v && !ui.offBanner) ui.offBanner = banner("error", "Le lecteur n'a pas pu charger le jeu.");
    else if (!v && ui.offBanner) {
      ui.offBanner.remove();
      ui.offBanner = null;
    }
    veil();
    fit();
  }

  function toggleClass(n, cls, on) {
    if (n.classList) n.classList.toggle(cls, !!on);
  }

  /** Loading / seeking overlay over the stage. */
  function veil() {
    if (!ui) return;
    var text = off ? "" : !info.ready ? "Préparation du combat…" : seeking ? "Recherche de ce moment…" : "";
    ui.veil.hidden = !text;
    ui.veilText.textContent = text;
  }

  // --- help: the site's own tooltip (mt.js.Tip of app.js, #tooltip, same markup as tip() in views/layout.ts), shown
  // while the "?" button is hovered or focused; ? and Ctrl+/ toggle it centred in the window, Échap closes it

  // BetterTrooper's list inside the site's tooltip frame: keys drawn as keycaps, key | action rows alternating, then
  // the mouse as place | gesture | effect
  var HELP_HTML = (function () {
    var k = function (key) {
      return "<kbd>" + key + "</kbd>";
    };
    var or = " <b class='mtp-or'>ou</b> ";
    var keys = [
      [k("K") + or + k("Maj") + " + " + k("Espace"), "Pause, reprise"],
      [k("Espace") + or + k("N"), "Vague suivante"],
      [k("←") + " " + k("→"), "Un événement en arrière, en avant"],
      [k("Maj") + " + " + k("←") + " " + k("→"), "Dix événements"],
      [k("Pg préc.") + or + k("P"), "Début de la vague (deux fois vite : la précédente, trois fois : deux avant)"],
      [k("Début") + " " + k("Fin") + or + k("H") + " " + k("E"), "Début, fin du combat"],
      [k("&lt;") + " " + k("&gt;"), "Plus lent, plus vite (un cran)"],
      [k("+") + " maintenu", "Vitesse ×2 tant qu'elle est enfoncée"],
      [k("S"), "Partager le combat"],
      [k("C"), "Capture du combat"],
      [k(isMac() ? "⌘" : "Ctrl") + " + " + k("/") + or + k("?"), "Cette liste (de nouveau : la ferme)"]
    ];
    var mouse = [
      ["Terrain", [["Clic", "Pause, reprise"]]],
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
  /**
   * Shows the tip at `at` (page coordinates, as the tip's own mouse tracking), by default the button's centre; centred:
   * in the middle of the window, where it stays (BetterTrooper's keyboard opening).
   */
  function showHelp(v, at, centred) {
    var t = tipApi();
    if (!t || !ui) return;
    if (v) {
      var r = ui.helpBtn.getBoundingClientRect();
      t.init();
      t.mousePos = at || { x: r.left + r.width / 2 + w.pageXOffset, y: r.top + r.height / 2 + w.pageYOffset };
      t.show(ui.helpBtn, HELP_HTML, "normalTip mtp-tip" + (d.documentElement.clientWidth >= 480 ? " mtp-tip--wide" : ""), !!centred);
      if (centred && t.tooltip) {
        var box = t.tooltip.querySelector(".tiptop") || t.tooltip;
        var b = box.getBoundingClientRect();
        var o = t.tooltip.getBoundingClientRect();
        t.tooltip.style.left = Math.max(0, w.pageXOffset + (d.documentElement.clientWidth - b.width) / 2 - (b.left - o.left)) + "px";
        t.tooltip.style.top = Math.max(0, w.pageYOffset + (w.innerHeight - b.height) / 2 - (b.top - o.top)) + "px";
      }
    } else if (helpOpen()) t.hide();
    ui.helpBtn.setAttribute("aria-expanded", helpOpen() ? "true" : "false");
  }
  function toggleHelp(centred) {
    if (helpOpen()) showHelp(false);
    else if (ui && ui.helpBtn.getClientRects().length) showHelp(true, null, centred);
  }

  function node(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  /** After a click with the mouse, the keys go back to the battle (Space: the next wave, not this button again). */
  function focusGame(e) {
    if (e && e.detail > 0 && !coarse.matches && d.activeElement && d.activeElement.blur) d.activeElement.blur();
  }
  function button(text, cls, title, onClick, id) {
    var b = node("button", "mtp-btn" + (cls ? " " + cls : ""), text);
    b.type = "button";
    if (title) {
      b.title = title;
      b.setAttribute("aria-label", title);
    }
    if (id) b.id = id;
    b.addEventListener("click", function (e) {
      onClick(e);
      focusGame(e);
    });
    return b;
  }

  /** The log is hidden when it does not match the SWF's history (one line per entry). */
  function checkLog() {
    toggleClass(ui.game, "mtp-nolog", log.length !== info.ready.total);
    toggleClass(ui.log, "mtp-nolog", log.length !== info.ready.total);
    drawSegs();
    fit();
  }

  function drawSegs() {
    var t = total();
    ui.segs.innerHTML = "";
    ui.segList = [];
    for (var k = 0; k < waveCount() && t > 0; k++) {
      var from = waveStart(k);
      var to = k + 1 < waveCount() ? waveStart(k + 1) : t;
      if (to <= from) continue;
      var seg = node("span", "mtp-seg" + (k % 2 ? " mtp-odd" : ""));
      // numbered like the waves people see: the opening deployment is wave 1, each NewWave starts the next one
      seg.appendChild(node("span", "mtp-seg__label", String(k + 1)));
      seg.style.left = (from / t) * 100 + "%";
      seg.style.width = ((to - from) / t) * 100 + "%";
      seg.setAttribute("data-wave", String(k));
      ui.segs.appendChild(seg);
      ui.segList.push(seg);
    }
  }

  /** The wave holding index n: the last one whose start is at or before it. */
  function waveAt(n) {
    var k = 0;
    for (var i = 1; i < waveCount(); i++) if (waveStart(i) <= n) k = i;
    return k;
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

  var stepSet = null;
  /** The step buttons for the current screen and pause state (rebuilt only when the set changes). */
  function steps() {
    var set = narrow.matches ? (paused ? STEPS_PAUSED : STEPS_PLAYING) : STEPS;
    if (stepSet === set) return;
    stepSet = set;
    var old = ui.transport.querySelectorAll(".mtp-step");
    for (var i = 0; i < old.length; i++) old[i].remove();
    for (var j = 0; j < set.length; j++) {
      var n = set[j];
      var a = Math.abs(n);
      var title = a + (a > 1 ? " événements" : " événement") + (n < 0 ? " en arrière" : " en avant");
      var b = node("button", "mtp-btn mtp-xs mtp-step");
      b.type = "button";
      b.title = title;
      b.setAttribute("aria-label", title);
      b.setAttribute("data-step", String(n));
      b.disabled = !info.ready;
      var icon = node("span", "mtp-chev mtp-chev--" + (CHEVRONS[a] || 1) + (n < 0 ? " mtp-chev--back" : ""));
      icon.setAttribute("aria-hidden", "true");
      b.appendChild(icon);
      holdable(b, n);
      if (n < 0) ui.transport.insertBefore(b, ui.play);
      else ui.transport.appendChild(b);
    }
  }
  // a step button: one step, then after 500 ms one every 33 ms, more at once when frames are slow
  var hold = null;
  function stopHold() {
    if (!hold) return;
    clearTimeout(hold.timer);
    clearInterval(hold.every);
    hold = null;
  }
  function holdable(b, n) {
    b.addEventListener("pointerdown", function (e) {
      if (e.button > 0 || b.disabled) return;
      e.preventDefault();
      stopHold();
      step(n);
      var h = (hold = { timer: 0, every: 0, last: 0 });
      h.timer = setTimeout(function () {
        h.last = Date.now();
        h.every = setInterval(function () {
          var now = Date.now();
          var times = Math.max(1, Math.round((now - h.last) / REPEAT_MS));
          h.last = now;
          stepHeld(n * times);
        }, REPEAT_MS);
      }, HOLD_MS);
    });
    b.addEventListener("pointerleave", stopHold);
    b.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
    b.addEventListener("click", function (e) {
      if (e.detail === 0) step(n);
    });
  }
  w.addEventListener("pointerup", stopHold);
  w.addEventListener("pointercancel", stopHold);

  var shownIdx = -1;
  function update() {
    if (!ui) return;
    var ready = !!info.ready;
    toggleClass(ui.bar, "mtp-wait", !ready);
    steps();
    var btns = ui.transport.querySelectorAll(".mtp-step");
    for (var i = 0; i < btns.length; i++) btns[i].disabled = !ready;
    ui.play.disabled = ui.range.disabled = ui.x2.disabled = !ready;
    var t = total();
    var idx = Math.min(info.idx, t);
    // the clock badges of entries played in advance flash only while the battle plays (BetterTrooper's --still)
    if (ui.list) toggleClass(ui.list, "mtp-still", !ready || paused || ended);
    ui.play.setAttribute("aria-label", paused ? "Reprendre" : "Pause");
    ui.play.title = (paused ? "Reprendre" : "Pause") + " (K ou Maj + Espace, ou un clic sur le terrain)";
    toggleClass(ui.playIcon, "mtp-playicon--paused", paused);
    if (d.activeElement !== ui.range) ui.range.value = String(notch);
    ui.speedValue.textContent = "×" + LABELS[notch];
    ui.range.setAttribute("aria-valuetext", ui.speedValue.textContent);
    ui.x2.textContent = notch === X1 ? "×2" : "×1";
    ui.x2.title = notch === X1 ? "Vitesse ×2" : "Vitesse normale";
    ui.cursor.style.left = (t > 0 ? (idx / t) * 100 : 0) + "%";
    for (var j = 0; ui.segList && j < ui.segList.length; j++) {
      toggleClass(ui.segList[j], "mtp-curwave", Number(ui.segList[j].getAttribute("data-wave")) === info.wave);
    }
    ui.wherePos.textContent = ready ? " · événement " + idx + " / " + t + " · vague " + (info.wave + 1) + " / " + waveCount() : "";
    ui.trackLoading.hidden = ready;
    if (idx !== shownIdx) {
      shownIdx = idx;
      highlight(idx);
    }
    veil();
  }

  var scrolledAt = 0;
  /** Line idx - 1 (the last applied entry) is current; one veil covers the lines after it. */
  function highlight(idx) {
    var cur = eventAt(idx - 1);
    for (var i = 0; i < ui.lines.length; i++) toggleClass(ui.lines[i], "mtp-cur", i === cur);
    placeVeil();
    var at = ui.lines[cur];
    // the log follows the battle, unless the reader scrolled it in the last 4 s
    if (at && ui.log.open && Date.now() - scrolledAt > 4000) {
      var box = ui.list;
      var y = at.offsetTop - box.scrollTop;
      var h = box.clientHeight;
      if (y < h * 0.15 || y > h * 0.75) box.scrollTop = Math.max(0, at.offsetTop - h * 0.35);
    }
  }
  function placeVeil() {
    if (!ui || !ui.logVeil) return;
    var cur = ui.list.querySelector(".mtp-cur");
    var top = cur ? cur.offsetTop + cur.offsetHeight : 0;
    ui.logVeil.style.top = top + "px";
    ui.logVeil.style.height = "0px";
    ui.logVeil.style.height = Math.max(0, ui.list.scrollHeight - top) + "px";
  }

  /**
   * Scales the 720x440 player down to the width of its screen: narrow windows, the log beside it (wide windows,
   * player.css), or the stage as high as the screen (touch screens held sideways). Beside the player, the log takes its
   * height and scrolls inside.
   */
  function fit() {
    if (!ui) return;
    toggleClass(ui.game, "mtp-side", !!(ui.log && ui.log.open));
    var frame = ui.screen.parentNode;
    if (landscape.matches) {
      var cs = w.getComputedStyle(frame);
      var inner = frame.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var top = d.body.classList.contains("mtm") ? 56 : 0;
      var hh = Math.min(440, w.innerHeight - top - 8 - 16 - 4, ((inner - 8 - 200 - 2) * 440) / 720);
      frame.style.setProperty("--mtp-stage-h", Math.max(100, Math.floor(hh)) + "px");
    } else frame.style.removeProperty("--mtp-stage-h");
    var width = ui.screen.clientWidth;
    var s = width > 0 && width < 720 ? width / 720 : 1;
    ui.stage.style.transform = s < 1 ? "scale(" + s + ")" : "";
    ui.screen.style.height = s < 1 ? Math.round(440 * s) + "px" : "";
    if (!ui.log) return;
    var beside = ui.log.open && ui.log.offsetTop === frame.offsetTop && ui.log.offsetLeft > frame.offsetLeft;
    ui.log.style.height = beside ? frame.offsetHeight + "px" : "";
    ui.list.style.height = beside ? Math.max(0, ui.log.clientHeight - ui.summary.offsetHeight) + "px" : "";
    placeVeil();
  }

  /** Touch screens held sideways: full screen at the first touch, the player brought into view; left when upright. */
  function landscapeMode() {
    var armed = false;
    var mine = false;
    var show = function () {
      if (ui) ui.frame.scrollIntoView({ block: "start" });
    };
    var change = function () {
      armed = landscape.matches;
      if (armed) w.requestAnimationFrame(show);
      else if (mine && d.fullscreenElement && d.exitFullscreen) d.exitFullscreen().catch(function () {});
      fit();
    };
    w.addEventListener("pointerup", function (e) {
      if (!armed || e.pointerType === "mouse" || (e.target && e.target.closest && e.target.closest("a"))) return;
      armed = false;
      var root = d.documentElement;
      if (d.fullscreenElement || !d.fullscreenEnabled || !root.requestFullscreen) return;
      root.requestFullscreen({ navigationUI: "hide" }).then(function () {
        mine = true;
        w.requestAnimationFrame(show);
      }, function () {});
    }, true);
    d.addEventListener("fullscreenchange", function () {
      if (!d.fullscreenElement) mine = false;
    });
    if (landscape.addEventListener) landscape.addEventListener("change", change);
    if (landscape.matches) change();
  }

  /** Frames per second while the battle really plays (not paused, seeking, ended, hidden, nor under a dialog). */
  function fpsMeter(out) {
    var last = w.performance.now();
    var running = false;
    var warm = 0;
    var c = last;
    var frames = 0;
    var sum = 0;
    var worst = 0;
    var seconds = [];
    var allFrames = 0;
    var allMs = 0;
    var playing = function () {
      return !!info.ready && !paused && !ended && !seeking && !d.hidden && !dialogOpen();
    };
    var tick = function (now) {
      var dt = now - last;
      last = now;
      var on = playing();
      if (!on || !running || now < warm) {
        if (on && !running) warm = now + 1000;
        running = on;
        c = now;
        frames = sum = worst = 0;
        w.requestAnimationFrame(tick);
        return;
      }
      frames++;
      sum += dt;
      if (dt > worst) worst = dt;
      allFrames++;
      allMs += dt;
      if (now - c >= 1000) {
        var fps = Math.round((frames * 1000) / (now - c));
        seconds.push(fps);
        if (seconds.length > 60) seconds.shift();
        var avg = Math.round(seconds.reduce(function (a, b) { return a + b; }, 0) / seconds.length);
        var min = Math.min.apply(Math, seconds);
        out.textContent = fps + " i/s · moy " + avg + (narrow.matches ? "" : " · min " + min);
        var st = state();
        out.title = "dernière seconde : " + fps + " i/s\ndernière minute : moy " + avg + ", min " + min + "\ndepuis le début : " + Math.round((allFrames * 1000) / allMs) + " i/s\n" +
          (st && typeof st.steps === "number" ? "jeu : " + st.steps + " images/s (cible 40)\n" : "") +
          "image de la page : " + (sum / frames).toFixed(1) + " ms en moyenne, " + Math.round(worst) + " ms au plus";
        out.setAttribute("aria-label", out.title.replace(/\n/g, ", "));
        c = now;
        frames = sum = worst = 0;
      }
      w.requestAnimationFrame(tick);
    };
    w.requestAnimationFrame(tick);
    d.addEventListener("visibilitychange", function () {
      running = false;
    });
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

  /** dd/mm/yyyy of a YYYY-MM-DD day. */
  function dayText(day) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  }

  function build() {
    var bar = d.getElementById("mtp-bar");
    var logBox = d.getElementById("mtp-log");
    var screen = d.querySelector(".mtp-screen");
    var game = d.querySelector(".mtp-game");
    var frame = game && game.querySelector(".swfframe");
    if (!bar || !logBox || !screen || !game || !frame) return;
    ui = { bar: bar, screen: screen, stage: screen.firstChild, game: game, frame: frame, lines: [] };

    // banners above the player (the stuck warning, a player that could not load)
    ui.banners = node("div", "mtp-banners");
    ui.banners.setAttribute("aria-live", "polite");
    game.insertBefore(ui.banners, frame);

    // title bar: the original <h1> (absent on mission and raid pages), the battle's date, the capture and share buttons
    var title = frame.querySelector("h1");
    if (!title) {
      title = node("h1", "", "Revoir le combat");
      frame.insertBefore(title, frame.firstChild);
    }
    var text = node("span", "mtp-title__text");
    while (title.firstChild) text.appendChild(title.firstChild);
    text.setAttribute("data-title", text.textContent.replace(/\s+/g, " ").trim());
    var day = dayText(w.mtDate);
    if (day) {
      text.appendChild(d.createTextNode(" ("));
      ui.date = node("time", "mtp-date", day);
      ui.date.setAttribute("datetime", w.mtDate);
      text.appendChild(ui.date);
      text.appendChild(d.createTextNode(")"));
    }
    ui.titleText = text;
    title.className = "mtp-title";
    title.appendChild(text);
    var actions = node("span", "mtp-title__actions");
    // the site's own green camo buttons (Killian's choice over BetterTrooper's bracketed ones)
    var shot = button("", "mtp-hbtn", "Capture d'écran du combat (C)", function () {
      if (capture) capture();
    }, "mtp-shot");
    shot.setAttribute("aria-label", "Capture d'écran");
    shot.appendChild(node("span", "mtp-cam"));
    actions.appendChild(shot);
    var link = button("Partager", "mtp-hbtn", "Partager ce combat (S)", function () {
      if (share) share();
    }, "mtp-link");
    link.removeAttribute("aria-label");
    actions.appendChild(link);
    title.appendChild(actions);

    // overlays on the stage
    ui.veil = node("div", "mtp-veil");
    var vbox = node("div", "mtp-veil__box");
    ui.veilText = node("div", "mtp-veil__text");
    vbox.appendChild(ui.veilText);
    vbox.appendChild(node("div", "mtp-progress"));
    ui.veil.appendChild(vbox);
    screen.appendChild(ui.veil);

    // timeline + info line
    var track = node("div", "mtp-track");
    track.id = "mtp-track";
    var TRACK_TIP = "Vagues du combat : clic pour aller au début d'une vague, glisser (ou Maj + clic) pour aller à un événement précis";
    track.title = TRACK_TIP;
    ui.segs = node("div", "mtp-segs");
    ui.cursor = node("div", "mtp-cursor");
    ui.ghost = node("div", "mtp-ghost");
    ui.ghost.hidden = true;
    ui.bubble = node("span", "mtp-bubble");
    ui.bubble.hidden = true;
    ui.trackLoading = node("span", "mtp-track__loading", "chargement du combat…");
    track.appendChild(ui.segs);
    track.appendChild(ui.trackLoading);
    track.appendChild(ui.ghost);
    track.appendChild(ui.cursor);
    track.appendChild(ui.bubble);
    // click: start of that wave; drag or Shift + click: that exact event
    var drag = null;
    var xOf = function (e) {
      var r = track.getBoundingClientRect();
      return Math.max(0, Math.min(r.width, e.clientX - r.left));
    };
    var at = function (x) {
      var r = track.getBoundingClientRect();
      return r.width > 0 ? Math.max(0, Math.min(total(), Math.round((x / r.width) * total()))) : 0;
    };
    track.addEventListener("pointerdown", function (e) {
      if (!info.ready || e.button !== 0) return;
      drag = { x0: xOf(e), moved: false, shift: e.shiftKey };
      if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    track.addEventListener("pointermove", function (e) {
      if (!info.ready) return;
      var x = xOf(e);
      if (!drag) {
        var k = waveAt(at(x));
        track.title = "Aller au début de la vague " + (k + 1) + " (événement " + waveStart(k) + ")";
        return;
      }
      if (!drag.moved && Math.abs(x - drag.x0) > 6) {
        drag.moved = true;
        toggleClass(track, "mtp-drag", true);
      }
      if (drag.moved) {
        var n = at(x);
        var r = track.getBoundingClientRect();
        ui.ghost.hidden = false;
        ui.ghost.style.left = x + "px";
        ui.bubble.hidden = false;
        ui.bubble.textContent = "événement " + n;
        ui.bubble.style.left = Math.min(Math.max(2, x - ui.bubble.offsetWidth / 2), r.width - ui.bubble.offsetWidth - 2) + "px";
      }
    });
    track.addEventListener("pointerleave", function () {
      if (!drag) track.title = TRACK_TIP;
    });
    var release = function (e) {
      if (!drag) return;
      var exact = drag.moved || drag.shift || e.shiftKey;
      var x = drag.moved ? xOf(e) : drag.x0;
      drag = null;
      toggleClass(track, "mtp-drag", false);
      ui.ghost.hidden = true;
      ui.bubble.hidden = true;
      if (e.type === "pointerup") {
        var n = at(x);
        goto(exact ? n : waveStart(waveAt(n)));
      }
    };
    track.addEventListener("pointerup", release);
    track.addEventListener("pointercancel", release);
    bar.appendChild(track);
    var meta = node("div", "mtp-meta");
    ui.where = node("span", "mtp-where");
    ui.whereId = node("span", "mtp-where__id", "Combat #" + (typeof w.battleID === "string" ? w.battleID : ""));
    ui.wherePos = node("span", "mtp-where__pos");
    ui.where.appendChild(ui.whereId);
    ui.where.appendChild(ui.wherePos);
    meta.appendChild(ui.where);
    ui.fps = node("span", "mtp-fps");
    ui.fps.tabIndex = 0;
    meta.appendChild(ui.fps);
    bar.appendChild(meta);

    // transport: the steps around the pause button
    ui.transport = node("div", "mtp-transport");
    ui.play = button("", "mtp-play", "Pause (K ou Maj + Espace, ou un clic sur le terrain)", togglePause, "mtp-play");
    ui.playIcon = node("span", "mtp-playicon");
    ui.playIcon.setAttribute("aria-hidden", "true");
    ui.play.appendChild(ui.playIcon);
    ui.transport.appendChild(ui.play);
    bar.appendChild(ui.transport);

    // speed, x2, sound, help
    var second = node("div", "mtp-secondary");
    var speed = node("label", "mtp-speed");
    speed.title = "Vitesse du combat, de ×1/16 à ×32 (< et >) ; la touche + maintenue donne au moins ×2";
    var label = node("span", "mtp-speed__label", "Vitesse");
    label.setAttribute("aria-hidden", "true");
    speed.appendChild(label);
    var scale = node("span", "mtp-scale");
    ui.range = node("input", "mtp-range");
    ui.range.type = "range";
    ui.range.id = "mtp-speed";
    ui.range.min = "0";
    ui.range.max = String(SPEEDS.length - 1);
    ui.range.step = "1";
    ui.range.value = String(X1);
    ui.range.setAttribute("aria-label", "Vitesse");
    ui.range.addEventListener("input", function () {
      setNotch(Number(ui.range.value));
    });
    ui.range.addEventListener("change", function () {
      if (!coarse.matches) ui.range.blur();
    });
    scale.appendChild(ui.range);
    var mark = node("span", "mtp-scale__mark");
    scale.appendChild(mark);
    speed.appendChild(scale);
    ui.speedValue = node("output", "mtp-speed__value");
    ui.speedValue.id = "mtp-speed-v";
    speed.appendChild(ui.speedValue);
    second.appendChild(speed);
    ui.x2 = button("×2", "mtp-xs", "", function () {
      setNotch(notch === X1 ? X2 : X1);
    }, "mtp-x2");
    ui.x2.removeAttribute("aria-label");
    second.appendChild(ui.x2);
    var end = node("span", "mtp-secondary__end");
    // the game has no sound yet: BetterTrooper's disabled button, a toast says so
    var soundBox = node("span", "mtp-sound");
    soundBox.id = "mtp-sound-box";
    soundBox.title = "Le jeu n'a pas encore de son";
    var sound = node("button", "mtp-btn mtp-xs");
    sound.type = "button";
    sound.id = "mtp-sound";
    sound.setAttribute("aria-pressed", "false");
    sound.setAttribute("aria-disabled", "true");
    sound.setAttribute("aria-label", "Son");
    sound.appendChild(maskIcon("sound-off"));
    soundBox.appendChild(sound);
    soundBox.addEventListener("click", function () {
      toast("Le jeu n'a pas encore de son", { warning: true });
    });
    end.appendChild(soundBox);
    // the "?" of the game's tips (/img/info.png) at twice its size: hover or focus shows the shortcuts in the site's tooltip
    var help = node("button", "mtp-helpbtn");
    help.type = "button";
    help.id = "mtp-helpbtn";
    help.setAttribute("aria-label", "Raccourcis clavier");
    help.setAttribute("aria-keyshortcuts", isMac() ? "Meta+/ ?" : "Control+/ ?");
    var helpIcon = node("span", "mtp-helpicon");
    helpIcon.setAttribute("aria-hidden", "true");
    help.appendChild(helpIcon);
    help.addEventListener("click", function (e) {
      // a mouse already opened it by hovering, a tap opens it (a tap elsewhere closes it), Enter or Space toggles it
      if (e.detail === 0) toggleHelp(false);
      else if (lastPointer !== "mouse") showHelp(true, { x: e.pageX, y: e.pageY });
    });
    var lastPointer = "";
    help.addEventListener("pointerdown", function (e) {
      lastPointer = e.pointerType;
    });
    help.setAttribute("aria-expanded", "false");
    ui.helpBtn = help;
    end.appendChild(help);
    second.appendChild(end);
    bar.appendChild(second);

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

    // log: a disclosure under (or beside) the player
    var details = d.createElement("details");
    details.id = "mtp-log";
    details.className = "mtp-log";
    details.open = true;
    details.appendChild(node("summary", "", "Journal du combat"));
    var list = node("ol", "mtp-lines");
    for (var i = 0; i < log.length; i++) {
      if (!log[i].t) continue;
      var li = node("li", "mtp-line");
      li.setAttribute("data-i", String(log[i].i));
      fillLine(li, log[i]);
      list.appendChild(li);
      ui.lines.push(li);
    }
    // one veil over the lines still to come
    ui.logVeil = node("li", "mtp-logveil");
    ui.logVeil.setAttribute("aria-hidden", "true");
    list.appendChild(ui.logVeil);
    list.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== list && !t.getAttribute("data-i")) t = t.parentNode;
      if (t && t !== list) goto(Number(t.getAttribute("data-i")) + 1);
    });
    var scrolled = function () {
      scrolledAt = Date.now();
    };
    var kinds = ["wheel", "touchmove", "keydown", "mousedown"];
    for (var q = 0; q < kinds.length; q++) list.addEventListener(kinds[q], scrolled, { passive: true });
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

    buildShare();
    buildCapture();
    camoImg = new w.Image();
    camoImg.src = "/img/mtp/camo-sand.svg";

    if (info.ready) checkLog();
    setOff(off);
    update();
    fit();
    w.addEventListener("resize", fit);
    if (narrow.addEventListener) narrow.addEventListener("change", update);
    landscapeMode();
    fpsMeter(ui.fps);
    // the SWF's state (pause, wave) also changes without a callback: refreshed 4 times a second
    setInterval(function () {
      if (!d.hidden) update();
    }, 250);
    // the frame's height also changes with fonts, the banners: the log beside follows it
    if (w.ResizeObserver) {
      new w.ResizeObserver(function () {
        w.requestAnimationFrame(fit);
      }).observe(frame);
    }
  }
  function maskIcon(name) {
    var s = node("span", "mtp-mask mtp-mask--" + name);
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", build);
  else build();
})();
