import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const exe = chromePaths.find((path) => existsSync(path));

if (!exe) throw new Error("No Chrome/Edge executable found for smoke test");

const port = 9223 + Math.floor(Math.random() * 500);
const profile = join(process.cwd(), `.browser-profile-${port}`);
mkdirSync(profile, { recursive: true });

const browser = spawn(exe, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-crash-reporter",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? reject(new Error(data.error.message)) : resolve(data.result);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve((method, params = {}, sessionId = null) => new Promise((res, rej) => {
        const callId = ++id;
        pending.set(callId, { resolve: res, reject: rej });
        ws.send(JSON.stringify(sessionId ? { id: callId, method, params, sessionId } : { id: callId, method, params }));
      }));
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("close", () => {
      for (const { reject } of pending.values()) reject(new Error("CDP websocket closed"));
      pending.clear();
    });
  });
}

try {
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  const send = await connect(version.webSocketDebuggerUrl);
  const created = await send("Target.createTarget", { url: "about:blank" });
  const attached = await send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
  const session = attached.sessionId;
  await send("Page.enable", {}, session);
  await send("Runtime.enable", {}, session);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, session);
  await send("Page.navigate", { url: "http://127.0.0.1:8000/" }, session);
  await sleep(600);

  const boot = await send("Runtime.evaluate", {
    expression: `document.querySelector('#screen-home.on') && typeof G !== 'undefined' && document.querySelector('#board').children.length ? 'home' : 'bad'`,
    returnByValue: true,
  }, session);
  if (boot.result.value !== "home") throw new Error("Home screen did not boot cleanly");

  await send("Runtime.evaluate", { expression: `document.querySelector('#mNew').click()` }, session);
  await sleep(400);
  const first = await send("Runtime.evaluate", {
    expression: `(() => {
      const b=document.querySelector('#board').getBoundingClientRect();
      const s=document.querySelector('#stage').getBoundingClientRect();
      const g=document.querySelector('#screen-game').getBoundingClientRect();
      return { cells: document.querySelectorAll('#board .cell').length, w: window.W, h: window.H, bottom: s.bottom, viewport: innerHeight, boardWidth:b.width, gameHeight:g.height };
    })()`,
    returnByValue: true,
  }, session);
  const f = first.result.value;
  if (f.cells !== 25 || f.bottom > f.viewport + 1 || f.boardWidth < 340 || f.gameHeight < f.viewport - 44) throw new Error(`Fresh run layout failed: ${JSON.stringify(f)}`);

  const late = await send("Runtime.evaluate", {
    expression: `(() => {
      setGridSize(11,11);
      G.player={x:5,y:5,hp:5,maxhp:5,gems:0,ent:0,bliss:0};
      G.walls=new Set(); G.items=[]; G.enemies=[]; G.stairs={x:10,y:10}; G.active=true; G.over=false; G.mode='run'; G.floor=8;
      drawAll();
      const s=document.querySelector('#stage').getBoundingClientRect();
      return { cells: document.querySelectorAll('#board .cell').length, bottom:s.bottom, viewport:innerHeight };
    })()`,
    returnByValue: true,
  }, session);
  const l = late.result.value;
  if (l.cells !== 121 || l.bottom > l.viewport + 1) throw new Error(`11x11 layout failed: ${JSON.stringify(l)}`);

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 700, deviceScaleFactor: 2, mobile: true }, session);
  await sleep(100);
  const mobile = await send("Runtime.evaluate", {
    expression: `(() => {
      setGridSize(11,11);
      drawAll();
      const s=document.querySelector('#stage').getBoundingClientRect();
      return { cells: document.querySelectorAll('#board .cell').length, bottom:s.bottom, viewport:innerHeight, cell:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cs')) };
    })()`,
    returnByValue: true,
  }, session);
  const m = mobile.result.value;
  if (m.cells !== 121 || m.bottom > m.viewport + 1) throw new Error(`Mobile 11x11 layout failed: ${JSON.stringify(m)}`);

  console.log("Browser smoke passed:", JSON.stringify({ first: f, late: l, mobile: m }));
} finally {
  browser.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
