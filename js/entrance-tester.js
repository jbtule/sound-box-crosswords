// The entrance tester, for refining entrances on the real board: open the app with ?backstage (it
// then stays on, on this device, until Exit; ↻ reloads the page to pick up code changes). A bar
// at the top picks an entrance, replays it on this puzzle or a new shape, slows it down (no
// sound then), and shows how long it took. app.js asks it (next()) which entrance to play while
// it's open, and it leaves the player's cycle, queue and Front Row Seat alone. Not linked from
// the app; it shows no words.
import { ENTRANCES } from "./entrances.js";

export function mountTester(app) {
  var bar = document.createElement("div");
  bar.className = "tester";
  bar.innerHTML =
    '<button type="button" id="tryReload" title="Reload the page (picks up code changes)">↻</button>' +
    '<select id="tryPick" aria-label="Entrance"></select>' +
    '<button type="button" id="tryPlay">▶ Play</button>' +
    '<button type="button" id="tryShape">New shape</button>' +
    '<select id="tryRate" aria-label="Speed"><option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option></select>' +
    '<label><input type="checkbox" id="trySound" checked> Sound</label>' +
    '<label><input type="checkbox" id="tryLoop"> Loop</label>' +
    '<span id="tryTime" aria-live="polite"></span>' +
    '<button type="button" id="tryExit" title="Turn the tester off">Exit</button>';
  document.body.appendChild(bar);
  var fit = function () { document.body.style.paddingTop = bar.offsetHeight + "px"; }; // the page starts below the bar
  fit(); window.addEventListener("resize", fit);
  var pick = bar.querySelector("#tryPick"), time = bar.querySelector("#tryTime"), loop = bar.querySelector("#tryLoop");
  [["Everyday", false], ["Premium", true]].forEach(function (grp) {
    var og = document.createElement("optgroup"); og.label = grp[0];
    ENTRANCES.filter(function (e) { return !!e.premium === grp[1]; }).forEach(function (e) {
      var o = document.createElement("option"); o.value = e.id; o.textContent = e.icon + " " + e.name; og.appendChild(o);
    });
    pick.appendChild(og);
  });
  try { var last = localStorage.getItem("sbx:backstage"); if (last && ENTRANCES.some(function (e) { return e.id === last; })) pick.value = last; } catch (e) {}
  pick.addEventListener("change", function () { try { localStorage.setItem("sbx:backstage", pick.value); } catch (e) {} app.replay(); });
  bar.querySelector("#tryPlay").addEventListener("click", function () { app.replay(); });
  bar.querySelector("#tryShape").addEventListener("click", function () { app.newShape(); });
  bar.querySelector("#tryRate").addEventListener("change", function () { app.replay(); });
  bar.querySelector("#tryReload").addEventListener("click", function () { location.reload(); });
  bar.querySelector("#tryExit").addEventListener("click", function () {
    if (!confirm("Turn the entrance tester off?")) return;
    try { localStorage.removeItem("sbx:backstage-on"); } catch (e) {}
    var u = new URL(location.href); u.searchParams.delete("backstage"); location.replace(u.pathname + u.search + u.hash);
  });
  var started = 0;
  return {
    next: function () {
      started = performance.now(); time.textContent = "…";
      return {
        id: pick.value,
        rate: +bar.querySelector("#tryRate").value,
        sound: bar.querySelector("#trySound").checked,
        done: function (run, skipped) {
          if (skipped) return;
          time.textContent = ((performance.now() - started) / 1000).toFixed(1) + " s";
          if (loop.checked) setTimeout(function () { if (loop.checked) app.replay(); }, 900);
        }
      };
    }
  };
}
