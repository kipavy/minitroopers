(function (window) {
    function embedRuffleSWF(
      swfUrl,
      replaceElemIdStr,
      width,
      height,
      swfVersionStr,
      expressInstallSwfurl,
      flashvarsObj,
      paramsObj,
      attributesObj,
      callbackFn
    ) {
      window.RufflePlayer = window.RufflePlayer || {};
      const ruffle = window.RufflePlayer.newest();
      const player = ruffle.createPlayer();
  
      const container = document.getElementById(replaceElemIdStr);
      if (!container) {
        console.error(`Container with id "${replaceElemIdStr}" not found.`);
        if (callbackFn) callbackFn({ success: false, id: replaceElemIdStr });
        return;
      }
  
      player.style.width = typeof width === "string" ? width : `${width}px`;
      player.style.height = typeof height === "string" ? height : `${height}px`;
  
      if (attributesObj) {
        for (const [key, value] of Object.entries(attributesObj)) {
          if (key === "class") {
            player.classList.add(value);
          } else {
            player.setAttribute(key, value);
          }
        }
      }
  
      let flashVars = {};
      if (paramsObj?.flashvars) {
        flashVars = paramsObj.flashvars;
        delete paramsObj.flashvars;
      }
  
      player.config = {
        ...paramsObj,
        allowScriptAccess: paramsObj?.allowScriptAccess == "always" || true,
        backgroundColor: paramsObj?.bgcolor || "#F2DDB8",
        scale: paramsObj?.scale || "noscale",
        quality: paramsObj?.quality || "high",
        wmode: paramsObj?.wmode || "transparent",
        splashScreen: false,
        autoplay: "on",
        unmuteOverlay: "hidden",
        contextMenu: "off"
      };
  
      container.innerHTML = "";
      container.appendChild(player);
  
      player.load({
        url: swfUrl,
        parameters: flashVars
      });
  
      if (callbackFn) {
        callbackFn({ success: true, id: replaceElemIdStr });
      }
    }
  
    // Export the function to the global scope
    window.embedRuffleSWF = embedRuffleSWF;
  })(window);