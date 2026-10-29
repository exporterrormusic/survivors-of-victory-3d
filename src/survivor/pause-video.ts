import { loadDisplaySettings, saveDisplaySettings, SUPPORTED_RESOLUTIONS } from '../frontend/settings/GameSettings';

export function createPauseVideo(shadows: HTMLElement, applyResolution: () => void): HTMLElement {
  const root = document.createElement('div'); root.className = 'pause-video-grid';
  const resolution = document.createElement('select'); resolution.id = 'pause-resolution';
  const saved = loadDisplaySettings();
  for (const size of SUPPORTED_RESOLUTIONS) resolution.add(new Option(`${size.width} × ${size.height}`, String(size.width), false, size.width === saved.resolution.width));
  resolution.addEventListener('change', () => {
    const size = SUPPORTED_RESOLUTIONS.find(size => String(size.width) === resolution.value)!;
    saveDisplaySettings({ ...loadDisplaySettings(), resolution: { ...size } }); applyResolution();
  });
  const mode = document.createElement('select'); mode.id = 'pause-fullscreen';
  mode.add(new Option('Windowed', 'windowed')); mode.add(new Option('Fullscreen', 'fullscreen'));
  const status = document.createElement('p'); status.className = 'pause-video-status'; status.setAttribute('role', 'status');
  const sync = () => { mode.value = document.fullscreenElement ? 'fullscreen' : 'windowed'; };
  mode.addEventListener('change', async () => {
    status.textContent = ''; mode.disabled = true;
    try {
      if (mode.value === 'fullscreen' && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (mode.value === 'windowed' && document.fullscreenElement) await document.exitFullscreen();
      saveDisplaySettings({ ...loadDisplaySettings(), fullscreen: !!document.fullscreenElement });
    } catch { status.textContent = 'The browser could not change fullscreen mode. Please try again.'; }
    finally { mode.disabled = false; sync(); }
  });
  document.addEventListener('fullscreenchange', () => { sync(); saveDisplaySettings({ ...loadDisplaySettings(), fullscreen: !!document.fullscreenElement }); });
  sync();
  for (const [name, select] of [['Resolution', resolution], ['Display mode', mode]] as const) {
    const label = document.createElement('label'); label.append(name, select); root.append(label);
  }
  root.append(shadows, status); return root;
}
