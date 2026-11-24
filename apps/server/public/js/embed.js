/*
 * swfobject.embedSWF replacement backed by Ruffle, so the original inline page scripts stay unchanged:
 *   swfobject.embedSWF(url, id, w, h, ver, expressInstall, flashvars, params, attrs)
 * One Ruffle player per call; it replaces the placeholder element and takes attrs.id / attrs["class"].
 */
(function () {
  var w = window;
  w.RufflePlayer = w.RufflePlayer || {};
  w.RufflePlayer.config = Object.assign({ publicPath: "/ruffle/" }, w.RufflePlayer.config || {});

  function embedSWF(url, id, width, height, ver, express, flashvars, params, attrs) {
    var target = w.document.getElementById(id);
    if (!target) return;
    params = params || {};
    attrs = attrs || {};
    var player = w.RufflePlayer.newest().createPlayer();
    if (attrs.id) player.id = attrs.id;
    if (attrs["class"]) player.className = attrs["class"];
    player.style.width = typeof width === "number" ? width + "px" : String(width);
    player.style.height = typeof height === "number" ? height + "px" : String(height);
    var fv = params.flashvars !== undefined ? params.flashvars : flashvars;
    if (fv && typeof fv === "object") fv = Object.keys(fv).map(function (k) { return k + "=" + encodeURIComponent(fv[k]); }).join("&");
    var config = {
      url: url,
      parameters: fv || "",
      autoplay: "on",
      splashScreen: false,
      unmuteOverlay: "hidden", // Ruffle's "click to unmute" overlay would cover the end-of-battle banner
      contextMenu: "off",
      backgroundColor: "#F2DDB8"
    };
    // Per-embed renderer choice (swfEmbed `renderer`). Ruffle's plain WebGL renderer has no BitmapData.draw (the
    // troopers grid, the battle pause screen), so it is only requested where the SWF never draws.
    if (params.renderer) config.preferredRenderer = params.renderer;
    if (params.scale) config.scale = params.scale;
    if (params.menu !== undefined) config.menu = params.menu !== false && params.menu !== "false";
    if (params.allowScriptAccess) config.allowScriptAccess = params.allowScriptAccess === "always" || params.allowScriptAccess === true;
    if (params.wmode) config.wmode = params.wmode;
    target.parentNode.replaceChild(player, target);
    player.load(config);
  }

  w.swfobject = { embedSWF: embedSWF };

  // Ruffle runs the SWF's navigateToURL(url, target) by submitting a GET form whose action is `url` and whose fields are
  // the request's variables (none here). A GET form replaces the query of its action with its fields, so /choice's
  // "Valider" (`/save?chk=KEY;c=-3:-1:…`) reached `/save?`; Flash kept the query. Field-less GET forms go to the URL as is.
  var F = w.HTMLFormElement;
  if (F && F.prototype && F.prototype.submit) {
    var submit = F.prototype.submit;
    F.prototype.submit = function () {
      if (String(this.method || "get").toLowerCase() !== "get" || !this.elements || this.elements.length !== 0 || !this.hasAttribute("action")) return submit.apply(this, arguments);
      // A new tab (`_blank`) gets no handle on this page (`window.opener`).
      if (this.target === "_blank") w.open(this.action, this.target, "noopener");
      else if (this.target && this.target !== "_self") w.open(this.action, this.target);
      else w.location.assign(this.action);
    };
  }
})();
