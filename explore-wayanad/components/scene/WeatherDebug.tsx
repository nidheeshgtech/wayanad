'use client';
import { useEffect } from 'react';
import { Box3, Vector3 } from 'three';
import { useThree } from '@react-three/fiber';
import { setWeatherForReview, weather, weatherNames, type WeatherName } from '@/lib/weather';
import { trafficControl } from '@/lib/traffic';
/** Opt-in DOM panel outside the canvas. Never mounted in a production build. */
export default function WeatherDebug() {
  const { scene, gl, camera } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !new URLSearchParams(location.search).has('sceneDebug')) return;
    const api = { weather: setWeatherForReview, traffic: trafficControl, snapshot: () => ({ weather: {...weather}, traffic: {...trafficControl, fleet: undefined, curve: undefined}, camera: camera.position.toArray(), render: {...gl.info.render}, vehicles: scene.getObjectByName('mountain-traffic')?.children.map(o => ({name:o.name,mode:o.userData.mode,visible:o.visible,position:o.position.toArray(), projected:o.position.clone().project(camera).toArray(), size:new Box3().setFromObject(o).getSize(new Vector3()).toArray(), children:o.children.length, parentVisible:o.parent?.parent?.visible})) }) };
    const target = window as typeof window & { wayanadReview?: typeof api }; target.wayanadReview = api;
    const panel = document.createElement('aside');
    panel.style.cssText = 'position:fixed;right:12px;top:80px;z-index:9999;background:#10251eed;color:#fff;padding:12px;font:12px system-ui;border-radius:8px;display:grid;gap:8px';
    const label = document.createElement('label'); label.textContent = 'Weather review ';
    const select = document.createElement('select');
    for (const name of ['auto', ...weatherNames]) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
    select.value = new URLSearchParams(location.search).get('weather') || 'auto';
    select.onchange = () => setWeatherForReview(select.value === 'auto' ? null : select.value as WeatherName);
    label.append(select); panel.append(label);
    const button = document.createElement('button'); button.textContent = 'Pause traffic'; button.onclick = () => { trafficControl.paused = !trafficControl.paused; button.textContent = trafficControl.paused ? 'Resume traffic' : 'Pause traffic'; }; panel.append(button);
    const status = document.createElement('output'); panel.append(status); document.body.append(panel);
    const timer = setInterval(() => { status.textContent = `${weather.state} · rain ${weather.rain.toFixed(2)} · wet ${weather.wet.toFixed(2)} · ${trafficControl.count} vehicles nearby`; }, 500);
    return () => { clearInterval(timer); delete target.wayanadReview; panel.remove(); trafficControl.paused = false; setWeatherForReview(null); };
  }, [scene, gl, camera]);
  return null;
}
