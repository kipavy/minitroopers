// Recharge weekend (spec 2026-11-25-recharge-week-end-design.md §4): the recharging tile of the HQ reserve row fills up
// live from the server instants (data-from, data-to, data-now = render time), and the page reloads once when the
// recharge is due so that the tile becomes a GO tile; at most one reload per recharge instant (sessionStorage).
(function () {
	var tile = document.querySelector(".reserve-row .recharging");
	if (!tile) return;
	var from = Number(tile.getAttribute("data-from"));
	var to = Number(tile.getAttribute("data-to"));
	var rendered = Number(tile.getAttribute("data-now"));
	var start = Date.now();
	function tick() {
		var now = rendered + (Date.now() - start);
		tile.style.setProperty("--p", String(Math.max(0, Math.min(100, Math.round((now - from) / (to - from) * 100)))));
		if (now >= to + 1000) {
			if (sessionStorage.getItem("mtReserveReload") !== String(to)) {
				sessionStorage.setItem("mtReserveReload", String(to));
				location.reload();
			}
			return;
		}
		setTimeout(tick, Math.min(10000, Math.max(250, to + 1000 - now)));
	}
	tick();
})();
