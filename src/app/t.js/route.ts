// Skrypt śledzący wklejany na strony klientów:
// <script async src="https://TWOJA-DOMENA/t.js" data-key="KLUCZ_PROJEKTU"></script>
const SCRIPT = String.raw`(function () {
  var s = document.currentScript;
  if (!s || window.__anlLoaded) return;
  window.__anlLoaded = true;
  var KEY = s.getAttribute("data-key");
  var ENDPOINT = new URL(s.src).origin + "/api/collect";
  var LINK_DOMAINS = (s.getAttribute("data-domains") || "").split(",").map(function (d) { return d.trim(); }).filter(Boolean);
  if (!KEY) return;

  function rid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }

  var params = new URLSearchParams(location.search);
  // Identyfikator osoby (przenoszony między domenami parametrem _anl)
  var vid = params.get("_anl") || ls("anl_vid") || rid();
  ls("anl_vid", vid);
  var sid = ss("anl_sid") || rid();
  ss("anl_sid", sid);

  // Źródło ruchu ustalane na początku sesji (lub gdy w adresie pojawią się nowe UTM-y)
  var src = null;
  try { src = JSON.parse(ss("anl_src") || "null"); } catch (e) {}
  var hasUtm = params.get("utm_source");
  if (!src || hasUtm) {
    var ref = "";
    try { if (document.referrer && new URL(document.referrer).hostname !== location.hostname) ref = document.referrer; } catch (e) {}
    src = {
      us: params.get("utm_source") || "", um: params.get("utm_medium") || "", uc: params.get("utm_campaign") || "",
      uco: params.get("utm_content") || "", ut: params.get("utm_term") || "", r: ref
    };
    if (!src.us && params.get("fbclid")) src.us = "facebook";
    if (!src.us && params.get("gclid")) src.us = "google";
    ss("anl_src", JSON.stringify(src));
  }

  var queue = [];
  var timer = null;
  function flush(useBeacon) {
    if (!queue.length) return;
    var body = JSON.stringify({ k: KEY, ev: queue.splice(0, 50) });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
    } else {
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {});
    }
    if (queue.length) flush(useBeacon);
  }
  function send(type, extra) {
    var ev = { t: type, v: vid, s: sid, u: location.href, r: src.r, us: src.us, um: src.um, uc: src.uc, uco: src.uco, ut: src.ut };
    for (var k in extra || {}) ev[k] = extra[k];
    queue.push(ev);
    clearTimeout(timer);
    timer = setTimeout(function () { flush(false); }, 1000);
  }

  // Odsłony + przewijanie
  var marks;
  function pageview() { marks = {}; send("pageview"); checkScroll(); }
  function checkScroll() {
    var h = document.documentElement;
    var max = Math.max(h.scrollHeight - h.clientHeight, 1);
    var pct = Math.round(((window.scrollY || h.scrollTop) / max) * 100);
    if (h.scrollHeight <= h.clientHeight) pct = 100;
    [25, 50, 75, 100].forEach(function (t) {
      if (pct >= t && !marks[t]) { marks[t] = 1; send("scroll", { sc: t }); }
    });
  }
  var st = null;
  window.addEventListener("scroll", function () { clearTimeout(st); st = setTimeout(checkScroll, 200); }, { passive: true });

  // Kliknięcia w linki i przyciski (CTR strony)
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest("a,button,[data-anl],input[type=submit],input[type=button]");
    if (!el) return;
    var text = (el.getAttribute("data-anl") || el.innerText || el.value || el.getAttribute("aria-label") || el.id || "").trim().slice(0, 120);
    send("click", { n: el.getAttribute("data-anl") || "", e: text + (el.href ? " | " + el.href : "") });
    // Przenoszenie identyfikatora na wskazane domeny (np. strona zapisu w MailerLite)
    if (el.href && LINK_DOMAINS.length) {
      try {
        var u = new URL(el.href);
        if (u.hostname !== location.hostname && LINK_DOMAINS.some(function (d) { return u.hostname === d || u.hostname.slice(-d.length - 1) === "." + d; })) {
          u.searchParams.set("_anl", vid);
          el.href = u.toString();
        }
      } catch (err) {}
    }
  }, true);

  // Formularze
  document.addEventListener("submit", function (e) {
    var f = e.target;
    send("form_submit", { n: (f.getAttribute("data-anl") || f.id || f.getAttribute("name") || f.getAttribute("action") || "").slice(0, 120) });
    flush(true);
  }, true);

  // Wideo HTML5
  document.addEventListener("play", function (e) {
    var v = e.target;
    if (v && v.tagName === "VIDEO" && !v.__anl) { v.__anl = 1; send("video_play", { n: v.getAttribute("data-anl") || v.currentSrc || "" }); }
  }, true);

  // Aplikacje SPA
  var push = history.pushState;
  history.pushState = function () { push.apply(this, arguments); setTimeout(pageview, 0); };
  window.addEventListener("popstate", function () { setTimeout(pageview, 0); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(true); });
  window.addEventListener("pagehide", function () { flush(true); });

  // Publiczne API:
  //   anl("lead")                      – zapis
  //   anl("purchase", 297)             – zakup z kwotą
  //   anl("event", "nazwa", wartość)   – zdarzenie własne
  //   anl("track", "booking")          – dowolny wspierany typ
  function api(cmd, a, b) {
    if (cmd === "event") send("custom", { n: String(a || ""), val: typeof b === "number" ? b : undefined });
    else if (cmd === "track") send(String(a), { val: typeof b === "number" ? b : undefined });
    else send(String(cmd), { val: typeof a === "number" ? a : undefined, n: typeof a === "string" ? a : "" });
    if (cmd === "purchase" || cmd === "lead") flush(true);
  }
  var pending = (window.anl && window.anl.q) || [];
  window.anl = api;
  pageview();
  pending.forEach(function (args) { api.apply(null, args); });
})();
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
