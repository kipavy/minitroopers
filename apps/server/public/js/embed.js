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
    if (params.scale) config.scale = params.scale;
    if (params.menu !== undefined) config.menu = params.menu !== false && params.menu !== "false";
    if (params.allowScriptAccess) config.allowScriptAccess = params.allowScriptAccess === "always" || params.allowScriptAccess === true;
    if (params.wmode) config.wmode = params.wmode;
    target.parentNode.replaceChild(player, target);
    player.load(config);
  }

  w.swfobject = { embedSWF: embedSWF };
})();
