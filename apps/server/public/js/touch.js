// Tooltips by touch (phones and tablets): the original tips (mt.js.Tip in app.js) are mouse-over only. A tap on an
// element that has one (not a link, a button or a field, nor inside one: those act directly) shows its tip at the
// tapped point, once
// the browser's emulated mouse events are over; a tap elsewhere hides it. app.js keeps the tip inside the window.
(function () {
  if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;
  var ACTIVE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/;

  function tipOwner(el) {
    var owner = null;
    for (var e = el; e && e !== document.body; e = e.parentNode) {
      if (e.nodeType !== 1) continue;
      if (ACTIVE.test(e.tagName)) return null;
      var over = owner ? null : e.getAttribute("onmouseover");
      if (over && over.indexOf("mt.js.Tip.show") >= 0) owner = e;
    }
    return owner;
  }

  document.addEventListener("touchstart", function (ev) {
    var Tip = window.mt && mt.js && mt.js.Tip;
    if (!Tip) return;
    var t = ev.touches[0];
    var owner = t ? tipOwner(ev.target) : null;
    if (!owner) {
      Tip.hide();
      return;
    }
    var pos = { x: t.pageX, y: t.pageY };
    // The tip is shown from here, at the tapped point. Browsers also fire an emulated mouseover after the tap, which
    // would run the owner's handler a second time: swallowed (capture phase, before the inline handler) for a moment.
    var swallow = function (e) {
      if (owner.contains(e.target)) e.stopPropagation();
    };
    document.addEventListener("mouseover", swallow, true);
    setTimeout(function () {
      document.removeEventListener("mouseover", swallow, true);
    }, 800);
    setTimeout(function () {
      Tip.init();
      Tip.mousePos = pos;
      owner.onmouseover && owner.onmouseover();
    }, 60);
  }, { passive: true });
})();
