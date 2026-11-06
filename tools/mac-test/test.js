/* Starts the real Amphora.app on a Mac, starts a battle and records whether animations play.
   usage: node test.js <path to Amphora.app> <label> [--reduce]   (--reduce = pretend "Reduce motion" is on) */
const { _electron } = require("playwright-core");
const fs = require("fs"), path = require("path");
(async () => {
  const [appPath, label, flag] = process.argv.slice(2);
  const args = [];
  const app = await _electron.launch({ executablePath: path.join(appPath, "Contents/MacOS/Electron"), args });
  const pg = await app.firstWindow();
  if (flag === "--reduce") await pg.emulateMedia({ reducedMotion: "reduce" });
  await pg.waitForLoadState("load"); await pg.waitForTimeout(1500);
  await pg.evaluate(s => localStorage.setItem("marginalia-v1", s), fs.readFileSync(__dirname + "/save.json", "utf8"));
  await pg.reload(); await pg.waitForTimeout(2000);
  const click = s => pg.evaluate(s => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, s);
  await click("[data-act=closehelp]");
  const info = await pg.evaluate(() => ({
    osSaysReduceMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    hasMotionSetting: !!document.querySelector("[data-act=setmotion]") || /setmotion/.test(document.documentElement.innerHTML) || null,
    quests: [...document.querySelectorAll("#nav button")].some(b => /Quests/.test(b.textContent))
  }));
  await click("#nav [data-t=campaign]"); await pg.waitForTimeout(300);
  const fought = await click("[data-act=fight]");
  const samples = [];
  for (let i = 0; i < 8; i++) {
    await pg.waitForTimeout(1500);
    samples.push(await pg.evaluate(() => {
      const a = document.getAnimations().filter(x => x.playState === "running");
      const durs = a.map(x => (x.effect && x.effect.getTiming().duration) || 0);
      return { running: a.length, longest: Math.max(0, ...durs), canvasUlt: !!document.querySelector("canvas.ultfx, .ultcv, #ultfx") };
    }));
    if (i === 2) await pg.screenshot({ path: `shot-${label}.png` });
  }
  const res = { label, ...info, version: info.quests ? "1.3.0" : "1.2.0", battleStarted: fought, samples };
  console.log(JSON.stringify(res));
  fs.writeFileSync(`result-${label}.json`, JSON.stringify(res, null, 1));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
