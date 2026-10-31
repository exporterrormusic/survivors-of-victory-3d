// Desktop app only: shows the auto-update from the very first screen. desktop/main.cjs reports the
// status through desktop/preload.cjs; the browser build has no bridge and shows nothing.

type UpdateStatus =
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; version: string };

interface UpdateBridge {
  watch(callback: (status: UpdateStatus | null) => void): () => void;
  restart(): Promise<void>;
}

const CSS = `
#sov-update{position:fixed;top:84px;right:24px;z-index:100000;width:300px;padding:12px 14px 12px 18px;
  background:rgba(11,17,24,.94);border:1px solid rgba(53,197,242,.35);color:#e8eef3;
  font:600 14px/1.25 Rajdhani,'Segoe UI',sans-serif;letter-spacing:1.2px;text-transform:uppercase;
  box-shadow:0 6px 24px rgba(0,0,0,.45);pointer-events:auto;user-select:none}
#sov-update::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:#35c5f2}
#sov-update .t{font-size:12px;color:#35c5f2;letter-spacing:2px}
#sov-update .m{margin-top:3px;font-size:17px;font-weight:700}
#sov-update .bar{margin-top:9px;height:4px;background:rgba(255,255,255,.12)}
#sov-update .bar i{display:block;height:100%;background:#35c5f2;transition:width .4s}
#sov-update .row{display:flex;gap:8px;margin-top:10px}
#sov-update button{flex:1;padding:7px 0;border:0;cursor:pointer;font:700 13px Rajdhani,'Segoe UI',sans-serif;letter-spacing:1.5px;text-transform:uppercase}
#sov-update .go{background:#35c5f2;color:#0b1118}
#sov-update .later{background:rgba(255,255,255,.1);color:#c9d3db}
#sov-update .x{position:absolute;top:6px;right:8px;background:none;border:0;color:#8a949e;font-size:16px;cursor:pointer;padding:2px 4px}
#sov-update .n{margin-top:6px;font-size:11px;color:#8a949e;letter-spacing:1px}
`;

export function mountUpdateBanner(): void {
  const bridge = (window as unknown as { sovUpdates?: UpdateBridge }).sovUpdates;
  if (!bridge) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const box = document.createElement('div');
  box.id = 'sov-update';
  box.hidden = true;
  document.body.append(box);
  // "Later" / close hide it until the next change of state (e.g. downloading -> ready).
  let dismissed = '';

  bridge.watch((status) => {
    if (!status) { box.hidden = true; return; }
    if (dismissed === status.state) return;
    box.hidden = false;
    const dismiss = () => { dismissed = status.state; box.hidden = true; };
    if (status.state === 'downloading') {
      box.innerHTML = `<button class="x" aria-label="Hide">×</button><div class="t">Update available</div>
        <div class="m">Version ${status.version} · downloading ${status.percent}%</div>
        <div class="bar"><i style="width:${status.percent}%"></i></div>
        <div class="n">Keep playing. It downloads in the background.</div>`;
    } else if (status.state === 'ready') {
      box.innerHTML = `<div class="t">Update ready</div><div class="m">Version ${status.version}</div>
        <div class="row"><button class="go">Restart now</button><button class="later">Later</button></div>
        <div class="n">Later installs it when you close the game.</div>`;
      box.querySelector<HTMLButtonElement>('.go')!.onclick = () => { void bridge.restart(); };
      box.querySelector<HTMLButtonElement>('.later')!.onclick = dismiss;
    } else {
      box.innerHTML = `<button class="x" aria-label="Hide">×</button><div class="t">Update</div>
        <div class="m">Version ${status.version} could not download</div>
        <div class="n">It will try again next time you start the game.</div>`;
    }
    const close = box.querySelector<HTMLButtonElement>('.x');
    if (close) close.onclick = dismiss;
  });
}
