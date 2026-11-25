/*
 * Battle sounds: the cues of client_fr_play.swf (window.mtSfx(kind, detail, x), sent at the frame where the action shows;
 * contract in tools/oracle/instrument/README.md, « Sons ») played through Web Audio. player.js decides when the page is
 * silent (jump, pause, dialog, hidden tab) and forwards the cues here; this file owns the sounds and the mixing.
 *
 * Sounds (/sfx/*.mp3, realistic, CC0, credits in README.md), by cue:
 *   fire:<weapon>  (one cue per bullet: a burst of 3 to 8 shots, WEAPON_ROWS.shots, sends as many cues)
 *     1 Pistolet, 4 Beretta: pistol            2 Revolver, 3 Desert Eagle: pistol-heavy     5 Double pistolet: pistol-dual
 *     6 Fusil: rifle   7 Fusil semi-auto: rifle-auto   8 Fusil double: rifle-double
 *     9 Fusil à pompe: shotgun   10 Fusil à grenaille: shotgun-dry
 *     11 Fusil d'assaut, 12 M16, 13 AK47, 14 FAMAS: assault   15 Thompson, 16 UMP: rifle-auto (lighter)
 *     21-24 heavy machine guns, minigun, 32 and 34 tank machine guns, 35 helicopter gun: mg
 *     25-29 snipers: sniper     0 Poings, 30 Couteau, 36 Dents de Rat, 37 Clown: silent (their blow is melee)
 *   melee:<weapon>  30 Couteau: knife; 36 Dents de Rat: rat; 37 Clown: silent; any other (fists, rifle butt): punch
 *   grenade:<n>    a projectile leaves (its blast follows as explosion:grenade / big): n = weapon for the launchers,
 *                  17-20 bazookas, rocket launcher, Tube Infernal: rocket; 31, 33 tank cannons: cannon; any other
 *                  (a thrown grenade): throw
 *   explosion:grenade explosion, explosion:big (20 debris: shells, air strikes) explosion-big
 *   reload:load reload (the magazine going in); hit:<DamageType> 0 bullet, 3 blade: hit; 6 melee, 7 wrestling, 8 fall:
 *   punch; 1 explosion (its blast is heard), 2 crash, 4 poison, 5 shock, vehicle: silent; crit: crit; miss: a bullet
 *   flying by (miss); death:2 (rat): rat, other deaths: death
 *   deploy, wave: deploy (radio beep and boots); end:<winning side> victory if it is the viewer's side (mtSide), else
 *   defeat. Silent: move, carry, charge, switch, empty, jet, heal, skill (its effects have their own cues), block,
 *   nodmg, reload:start.
 *
 * Mixing: decoded at the first user gesture (no AudioContext before one); each sound slightly re-pitched (±3 %), one
 * of its takes at random, panned softly from x (±0.6); a master gain into a compressor; at most 8 voices (a louder
 * cue takes the place of the oldest quieter one); a sound is not repeated within its gap (40 ms at ×1, wider at ×4
 * and more). API: MtSfx = { play(kind, detail, x), sounds(kind, detail), stop(), setMuted(b), muted, setSpeed(x), ready }.
 */
(function () {
  var w = window;
  var d = document;
  var BASE = "/sfx/";
  var VOICES = 8;
  var PAN = 0.6;
  var PITCH = 0.03;
  // name: [volume, priority, gap ms at x1]
  var SOUNDS = {
    pistol: [0.8, 1, 40],
    "pistol-heavy": [0.85, 1, 40],
    "pistol-dual": [0.8, 1, 40],
    rifle: [0.85, 1, 40],
    "rifle-auto": [0.85, 1, 40],
    "rifle-double": [0.85, 1, 40],
    shotgun: [0.85, 1, 40],
    "shotgun-dry": [0.85, 1, 40],
    assault: [0.8, 1, 40],
    mg: [0.8, 1, 40],
    rocket: [0.85, 1, 40],
    sniper: [0.85, 1, 40],
    cannon: [0.9, 2, 40],
    knife: [0.8, 1, 40],
    punch: [0.7, 0, 40],
    throw: [0.7, 0, 40],
    explosion: [0.95, 2, 40],
    "explosion-big": [1, 2, 80],
    reload: [0.6, 0, 40],
    hit: [0.6, 0, 40],
    crit: [0.8, 1, 40],
    miss: [0.5, 0, 40],
    death: [0.75, 2, 40],
    "death-2": [0.75, 2, 40],
    rat: [0.6, 1, 40],
    "rat-2": [0.6, 1, 40],
    deploy: [0.6, 0, 1200],
    victory: [0.8, 3, 2000],
    defeat: [0.8, 3, 2000],
  };
  // fire cue by weapon index (WEAPON_ROWS of @mt/engine)
  var FIRE = [
    "", "pistol", "pistol-heavy", "pistol-heavy", "pistol", "pistol-dual", "rifle", "rifle-auto", "rifle-double", "shotgun", "shotgun-dry",
    "assault", "assault", "assault", "assault", "rifle-auto", "rifle-auto", "rocket", "rocket", "rocket", "rocket",
    "mg", "mg", "mg", "mg", "sniper", "sniper", "sniper", "sniper", "sniper", "", "cannon", "mg", "cannon", "mg", "mg", "", "",
  ];
  var RAT = ["rat", "rat-2"];
  var GRENADE = { 17: "rocket", 18: "rocket", 19: "rocket", 20: "rocket", 31: "cannon", 33: "cannon" };

  function sounds(kind, detail) {
    var n = String(detail);
    switch (kind) {
      case "fire":
        return FIRE[Number(n)] ? [FIRE[Number(n)]] : [];
      case "melee":
        return n === "30" ? ["knife"] : n === "36" ? RAT : n === "37" ? [] : ["punch"];
      case "grenade":
        return [GRENADE[Number(n)] || "throw"];
      case "explosion":
        return [n === "big" ? "explosion-big" : "explosion"];
      case "reload":
        return n === "load" ? ["reload"] : [];
      case "hit":
        return n === "0" || n === "3" ? ["hit"] : n === "6" || n === "7" || n === "8" ? ["punch"] : [];
      case "crit":
        return ["crit"];
      case "miss":
        return ["miss"];
      case "death":
        return n === "2" ? RAT : ["death", "death-2"];
      case "deploy":
      case "wave":
        return ["deploy"];
      case "end":
        return [Number(n) === (typeof w.mtSide === "number" ? w.mtSide : 0) ? "victory" : "defeat"];
    }
    return [];
  }

  var ctx = null;
  var master = null;
  var buffers = {};
  var last = {};
  var voices = [];
  var speed = 1;
  var api = (w.MtSfx = {
    ready: false,
    muted: false,
    sounds: sounds,
    play: play,
    stop: stopAll,
    setMuted: setMuted,
    setSpeed: function (x) {
      speed = x > 0 ? x : 1;
    },
  });

  /** The AudioContext, made (or resumed) during a user gesture only: browsers refuse to start one otherwise. */
  function unlock() {
    if (api.muted) return;
    var ua = w.navigator.userActivation;
    if (ua && !ua.isActive) return;
    var AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(comp);
      comp.connect(ctx.destination);
      load();
    }
    if (ctx.state === "suspended") ctx.resume();
  }
  var GESTURES = ["pointerdown", "pointerup", "keydown", "touchend"];
  for (var g = 0; g < GESTURES.length; g++) w.addEventListener(GESTURES[g], unlock, true);

  function load() {
    var names = Object.keys(SOUNDS);
    var left = names.length;
    var done = function () {
      if (--left === 0) api.ready = true;
    };
    names.forEach(function (name) {
      w.fetch(BASE + name + ".mp3")
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.arrayBuffer();
        })
        .then(function (b) {
          return ctx.decodeAudioData(b);
        })
        .then(function (buf) {
          buffers[name] = buf;
        })
        .catch(function () {})
        .then(done);
    });
  }

  function gap(name) {
    var base = SOUNDS[name][2];
    return speed < 4 ? base : Math.max(base, (base * speed) / 2);
  }

  /** Plays the sound of a cue; true if one started. */
  function play(kind, detail, x) {
    if (api.muted || !ctx || ctx.state !== "running") return false;
    var names = sounds(kind, detail).filter(function (n) {
      return buffers[n];
    });
    if (!names.length) return false;
    var key = names[0];
    var now = w.performance.now();
    if (last[key] !== undefined && now - last[key] < gap(key)) return false;
    var name = names[Math.floor(Math.random() * names.length)];
    var conf = SOUNDS[name];
    if (!room(conf[1])) return false;
    last[key] = now;
    var src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH;
    var vol = ctx.createGain();
    vol.gain.value = conf[0];
    var pan = ctx.createStereoPanner();
    var p = typeof x === "number" && isFinite(x) ? (x - 0.5) * 2 * PAN : 0;
    pan.pan.value = Math.max(-PAN, Math.min(PAN, p));
    src.connect(vol);
    vol.connect(pan);
    pan.connect(master);
    var v = { src: src, prio: conf[1] };
    voices.push(v);
    src.onended = function () {
      var i = voices.indexOf(v);
      if (i >= 0) voices.splice(i, 1);
      pan.disconnect();
    };
    src.start();
    return true;
  }

  /** A free voice, or the oldest one of a lower or equal priority given up; false if none. */
  function room(prio) {
    if (voices.length < VOICES) return true;
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].prio <= prio) {
        var v = voices.splice(i, 1)[0];
        try {
          v.src.stop();
        } catch (e) {}
        return true;
      }
    }
    return false;
  }

  function stopAll() {
    var all = voices;
    voices = [];
    for (var i = 0; i < all.length; i++) {
      try {
        all[i].src.stop();
      } catch (e) {}
    }
  }

  function setMuted(m) {
    api.muted = !!m;
    if (api.muted) stopAll();
    else unlock();
  }

  try {
    api.muted = w.localStorage.getItem("mt-sound") === "off";
  } catch (e) {}
  // the page's own hidden tab: nothing keeps ringing
  d.addEventListener("visibilitychange", function () {
    if (d.hidden) stopAll();
  });
})();
