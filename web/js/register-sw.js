/* Registers the offline worker (only on HTTPS or localhost; browsers refuse it elsewhere). */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("Offline mode unavailable:", e); });
  });
}
