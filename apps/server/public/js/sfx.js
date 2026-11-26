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
 *   melee:<weapon>  30 Couteau: knife; 36 Dents de Rat: ratbite; 37 Clown: clownhit / clownlaugh; other (fists, butt): punch
 *   grenade:<n>    a launcher's projectile leaves (its blast follows as explosion:grenade / big): 17-20 bazookas, rocket
 *                  launcher, Tube Infernal: rocket; 31, 33 tank cannons: cannon; any other: throw
 *   pin:<skill>    a hand grenade's throw starts (82-91): pin;  throw:<skill> it leaves the hand: throw
 *   detonate:<skill> it lands and goes off: 83 flash (bang + ear ringing), 84 gas, 85 clown, 86 frag, 87 shock (shock
 *                  wave), 88 sticky, 89 blessed (a bell over its blast), 90 healgren (aerosol), 91 blackhole; 82 (its blast
 *                  is heard: explosion) and catch (intercepted): silent
 *   explosion:grenade explosion, explosion:big (20 debris: shells, air strikes) explosion-big;  jet: jet (fly-by)
 *   move:<who>:<frames>  a move, as long as it lasts (frames at x1, 40 fps; loops, faded in and out, capped):
 *                  run: run (footsteps); rat: ratrun; v<vehicle>: 0 moto, 1 jeep, 2 tank, 3 heli, 4-6 bigtank, 7 jet: none
 *   anim:<label>   an animation starts: ball (roll, to pick up a weapon): roll; land: land; fly (thrown by a blast): fly;
 *                  ground_crash (falls): fall; pillule (Twinoïde): pill; autoPique, anti_poison: syringe; talky_walky:
 *                  radio; voodoo: voodoo; dodge_punch, intercept: whoosh; lifted_up (carried): carry; others and rat:*: none
 *   reload:start magout, reload:load reload; empty:<weapon> empty; switch switch; heal heal
 *   hit:<DamageType> 0 bullet, 3 blade: hit; 6 melee, 7 wrestling, 8 fall: punch; hit:rat ratpain; hit:vehicle,
 *   nodmg:vehicle: clang; nodmg:0 (a bullet on armour): ricochet; block: whoosh; 1 explosion (its blast is heard),
 *   2 crash, 4 poison, 5 shock: silent; crit: crit; miss: miss; death:2 (rat) ratdeath, other deaths: death
 *   deploy, wave: deploy; end:<winning side> victory if it is the viewer's side (mtSide), else defeat.
 *   Silent: carry, charge, skill (their animations have the sounds).
 *
 * Loading: every sound is fetched at low priority right after the page has loaded and decoded on an OfflineAudioContext
 * (no user gesture needed); an AudioContext is tried at once (the browser lets it run when the site was interacted with,
 * e.g. the click that opened the battle), else resumed at the first gesture anywhere (capture phase). A cue whose sound
 * is not decoded yet is played if it is ready within 100 ms, else dropped. onBlocked() is called once when a cue comes
 * while the browser still holds the sound back (player.js shows a hint).
 * Mixing: each sound slightly re-pitched (±3 %), one of its takes at random, panned softly from x (±0.6); a master gain
 * into a compressor; at most 8 one-shot voices (a louder cue takes the place of the oldest quieter one); a sound is not
 * repeated within its gap (40 ms at ×1, wider at ×4 and more); loops: one per sound (a new cue extends it), at most
 * 5 s (footsteps 2.5 s), none for footsteps at ×4 and more.
 * API: MtSfx = { play(kind, detail, x), sounds(kind, detail), stop(), setMuted(b), muted, setSpeed(x), ready, running(),
 * played (sounds started), onBlocked }.
 */
(function () {
  var w = window;
  var d = document;
  var BASE = "/sfx/";
  var VOICES = 8;
  var PAN = 0.6;
  var PITCH = 0.03;
  var LATE = 100;
  // name: [volume, priority, gap ms at x1, loop cap s (loops only)]
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
    pin: [0.6, 0, 120],
    explosion: [0.95, 2, 40],
    "explosion-big": [1, 2, 80],
    flash: [0.9, 2, 80],
    gas: [0.8, 1, 80],
    clown: [0.8, 1, 80],
    frag: [0.95, 2, 80],
    shock: [0.95, 2, 80],
    sticky: [0.8, 1, 80],
    blessed: [0.7, 1, 200],
    healgren: [0.75, 1, 80],
    blackhole: [0.9, 2, 80],
    jet: [0.85, 2, 1500],
    reload: [0.6, 0, 40],
    magout: [0.55, 0, 60],
    empty: [0.6, 0, 60],
    switch: [0.55, 0, 80],
    hit: [0.6, 0, 40],
    crit: [0.8, 1, 40],
    miss: [0.5, 0, 40],
    ricochet: [0.55, 0, 90],
    clang: [0.6, 0, 70],
    whoosh: [0.5, 0, 90],
    death: [0.75, 2, 40],
    "death-2": [0.75, 2, 40],
    roll: [0.6, 0, 150],
    land: [0.55, 0, 120],
    fly: [0.5, 0, 120],
    fall: [0.6, 0, 90],
    "fall-2": [0.6, 0, 90],
    carry: [0.45, 0, 400],
    pill: [0.7, 1, 300],
    radio: [0.7, 1, 400],
    syringe: [0.65, 1, 200],
    heal: [0.65, 1, 200],
    voodoo: [0.65, 1, 300],
    ratbite: [0.75, 1, 50],
    ratpain: [0.6, 0, 60],
    "ratpain-2": [0.6, 0, 60],
    ratdeath: [0.7, 1, 60],
    clownhit: [0.6, 0, 120],
    clownlaugh: [0.6, 0, 400],
    deploy: [0.6, 0, 1200],
    victory: [0.8, 3, 2000],
    defeat: [0.8, 3, 2000],
    // loops (engines, footsteps): kept well below the shots
    run: [0.5, 0, 0, 2.5],
    ratrun: [0.5, 0, 0, 2.5],
    moto: [0.55, 0, 0, 5],
    jeep: [0.55, 0, 0, 5],
    tank: [0.6, 0, 0, 5],
    bigtank: [0.6, 0, 0, 5],
    heli: [0.6, 0, 0, 5],
  };
  // fire cue by weapon index (WEAPON_ROWS of @mt/engine)
  var FIRE = [
    "", "pistol", "pistol-heavy", "pistol-heavy", "pistol", "pistol-dual", "rifle", "rifle-auto", "rifle-double", "shotgun", "shotgun-dry",
    "assault", "assault", "assault", "assault", "rifle-auto", "rifle-auto", "rocket", "rocket", "rocket", "rocket",
    "mg", "mg", "mg", "mg", "sniper", "sniper", "sniper", "sniper", "sniper", "", "cannon", "mg", "cannon", "mg", "mg", "", "",
  ];
  var GRENADE = { 17: "rocket", 18: "rocket", 19: "rocket", 20: "rocket", 31: "cannon", 33: "cannon" };
  var DETONATE = { 83: "flash", 84: "gas", 85: "clown", 86: "frag", 87: "shock", 88: "sticky", 89: "blessed", 90: "healgren", 91: "blackhole" };
  var VEHICLE = ["moto", "jeep", "tank", "heli", "bigtank", "bigtank", "bigtank"];
  var ANIM = {
    ball: "roll", land: "land", fly: "fly", ground_crash: "fall", pillule: "pill", autoPique: "syringe", anti_poison: "syringe",
    talky_walky: "radio", voodoo: "voodoo", dodge_punch: "whoosh", intercept: "whoosh", lifted_up: "carry",
  };

  function sounds(kind, detail) {
    var n = String(detail);
    var s;
    switch (kind) {
      case "fire":
        return FIRE[Number(n)] ? [FIRE[Number(n)]] : [];
      case "melee":
        return n === "30" ? ["knife"] : n === "36" ? ["ratbite"] : n === "37" ? ["clownhit", "clownlaugh"] : ["punch"];
      case "grenade":
        return [GRENADE[Number(n)] || "throw"];
      case "pin":
        return ["pin"];
      case "throw":
        return ["throw"];
      case "detonate":
        return DETONATE[n] ? [DETONATE[n]] : [];
      case "explosion":
        return [n === "big" ? "explosion-big" : "explosion"];
      case "jet":
        return ["jet"];
      case "move":
        s = n.split(":")[0];
        if (s === "run") return ["run"];
        if (s === "rat") return ["ratrun"];
        s = VEHICLE[Number(s.slice(1))];
        return s && n.charAt(0) === "v" ? [s] : [];
      case "anim":
        return ANIM[n] ? [ANIM[n]] : [];
      case "reload":
        return n === "load" ? ["reload"] : n === "start" ? ["magout"] : [];
      case "empty":
        return ["empty"];
      case "switch":
        return ["switch"];
      case "heal":
        return ["heal"];
      case "hit":
        if (n === "rat") return ["ratpain", "ratpain-2"];
        if (n === "vehicle") return ["clang"];
        return n === "0" || n === "3" ? ["hit"] : n === "6" || n === "7" || n === "8" ? ["punch"] : [];
      case "nodmg":
        return n === "vehicle" ? ["clang"] : n === "0" ? ["ricochet"] : [];
      case "block":
        return ["whoosh"];
      case "crit":
        return ["crit"];
      case "miss":
        return ["miss"];
      case "death":
        return n === "2" ? ["ratdeath"] : ["death", "death-2"];
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
  var waiting = {};
  var last = {};
  var voices = [];
  var loops = {};
  var speed = 1;
  var told = false;
  var api = (w.MtSfx = {
    ready: false,
    played: 0,
    muted: false,
    sounds: sounds,
    play: play,
    stop: stopAll,
    setMuted: setMuted,
    setSpeed: function (x) {
      speed = x > 0 ? x : 1;
    },
    running: function () {
      return !!ctx && ctx.state === "running";
    },
    onBlocked: null,
  });

  /** The AudioContext: made at once (it runs if the browser allows it), resumed at a gesture otherwise. */
  function context() {
    if (ctx) return ctx;
    var AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      return null;
    }
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
    return ctx;
  }
  function resume() {
    if (api.muted || !ctx || ctx.state !== "suspended") return;
    var p = ctx.resume();
    if (p && p.catch) p.catch(function () {});
  }
  function unlock() {
    if (api.muted) return;
    var ua = w.navigator.userActivation;
    if (ua && !ua.isActive) return;
    if (context()) resume();
  }
  var GESTURES = ["pointerdown", "mousedown", "touchstart", "touchend", "pointerup", "keydown", "click"];
  for (var g = 0; g < GESTURES.length; g++) w.addEventListener(GESTURES[g], unlock, true);
  // another chance when the tab or window comes back (no gesture: the browser decides)
  function again() {
    var ua = w.navigator.userActivation;
    if (!d.hidden && (!ua || ua.hasBeenActive)) resume();
  }
  d.addEventListener("visibilitychange", again);
  w.addEventListener("focus", again);

  /** Every sound fetched (low priority, after the page) and decoded without a gesture, on an OfflineAudioContext. */
  function load() {
    var OAC = w.OfflineAudioContext || w.webkitOfflineAudioContext;
    var dec = OAC ? new OAC(1, 1, 44100) : null;
    var names = Object.keys(SOUNDS);
    var left = names.length;
    var done = function () {
      if (--left === 0) api.ready = true;
    };
    names.forEach(function (name) {
      w.fetch(BASE + name + ".mp3", { priority: "low" })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.arrayBuffer();
        })
        .then(function (b) {
          var c = dec || context();
          if (!c) throw new Error("no audio");
          return new Promise(function (ok, ko) {
            var p = c.decodeAudioData(b, ok, ko);
            if (p && p.then) p.then(ok, ko);
          });
        })
        .then(function (buf) {
          buffers[name] = buf;
          var q = waiting[name];
          delete waiting[name];
          if (q && w.performance.now() - q.t <= LATE) start(q.name, q.x, q.dur);
        })
        .catch(function () {})
        .then(done);
    });
  }
  function boot() {
    if (!api.muted) context();
    setTimeout(load, 0);
  }
  if (d.readyState === "complete") boot();
  else w.addEventListener("load", boot);

  function gap(name) {
    var base = SOUNDS[name][2];
    return speed < 4 ? base : Math.max(base, (base * speed) / 2);
  }

  /** Plays the sound of a cue; true if one started (or will within 100 ms, once decoded). */
  function play(kind, detail, x) {
    if (api.muted) return false;
    var names = sounds(kind, detail);
    if (!names.length) return false;
    if (!ctx || ctx.state !== "running") {
      again();
      if (!told && api.onBlocked && ctx) {
        told = true;
        api.onBlocked();
      }
      return false;
    }
    var key = names[0];
    var dur = 0;
    if (kind === "move") {
      var f = Number(String(detail).split(":")[1]);
      var s = speed > 0 ? speed : 1;
      if (key === "run" || key === "ratrun") {
        if (s >= 4) return false;
      }
      dur = Math.min(SOUNDS[key][3], Math.max(0.3, (f > 0 ? f : 20) / (40 * s)));
    }
    var now = w.performance.now();
    if (!dur && last[key] !== undefined && now - last[key] < gap(key)) return false;
    var ready = names.filter(function (n) {
      return buffers[n];
    });
    if (!ready.length) {
      waiting[key] = { t: now, name: key, x: x, dur: dur };
      return false;
    }
    last[key] = now;
    return start(ready[Math.floor(Math.random() * ready.length)], x, dur);
  }

  function panner(x) {
    var pan = ctx.createStereoPanner();
    var p = typeof x === "number" && isFinite(x) ? (x - 0.5) * 2 * PAN : 0;
    pan.pan.value = Math.max(-PAN, Math.min(PAN, p));
    return pan;
  }

  function start(name, x, dur) {
    if (!ctx || ctx.state !== "running" || api.muted) return false;
    if (dur) return loop(name, x, dur);
    var conf = SOUNDS[name];
    if (!room(conf[1])) return false;
    var src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH;
    var vol = ctx.createGain();
    vol.gain.value = conf[0];
    var pan = panner(x);
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
    api.played++;
    return true;
  }

  /** A loop for dur seconds (faded in and out); one per sound: a cue while it plays extends it. */
  function loop(name, x, dur) {
    var t = ctx.currentTime;
    var vol0 = SOUNDS[name][0];
    var l = loops[name];
    var end = t + dur;
    if (l) {
      end = Math.min(Math.max(l.end, end), l.from + SOUNDS[name][3] * 2);
      if (end <= l.end) return true;
      l.end = end;
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setValueAtTime(l.gain.gain.value, t);
      l.gain.gain.linearRampToValueAtTime(vol0, Math.min(t + 0.1, end - 0.2));
      l.gain.gain.setValueAtTime(vol0, end - 0.2);
      l.gain.gain.linearRampToValueAtTime(0, end);
      try {
        l.src.stop(end + 0.05);
      } catch (e) {}
      return true;
    }
    var src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.loop = true;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH;
    var gain = ctx.createGain();
    var fade = Math.min(0.15, dur / 3);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol0, t + fade);
    gain.gain.setValueAtTime(vol0, Math.max(t + fade, end - 0.2));
    gain.gain.linearRampToValueAtTime(0, end);
    var pan = panner(x);
    src.connect(gain);
    gain.connect(pan);
    pan.connect(master);
    l = loops[name] = { src: src, gain: gain, end: end, from: t };
    src.onended = function () {
      if (loops[name] === l) delete loops[name];
      pan.disconnect();
    };
    src.start(t, Math.random() * Math.max(0, buffers[name].duration - 0.1));
    src.stop(end + 0.05);
    api.played++;
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
    var ls = loops;
    loops = {};
    for (var k in ls) {
      try {
        ls[k].src.stop();
      } catch (e) {}
    }
    waiting = {};
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
