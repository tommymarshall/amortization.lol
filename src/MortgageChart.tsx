import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { compactMoney, formatMonth, money, type ChartView, type Comparison, type Mode } from './mortgage';
import { chartValue as sample } from './chart';

interface Props { data: Comparison; view: ChartView; selected: number; onSelect: (month: number) => void; today: number; mode: Mode }
const GOLD = '#f08a3c', LILAC = '#6c5ce7';
const SAMPLES = 360;
const PAD = { left: 60, right: 20, top: 116, bottom: 42 };

export default function MortgageChart({ data, view, selected, onSelect, today, mode }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [webgl, setWebgl] = useState(false);
  const [focused, setFocused] = useState(false);
  const cursor = useRef(selected);
  const renderCursor = useRef<(() => void) | null>(null);
  const previous = useRef<number[][] | null>(null);
  const height = width < 500 ? 390 : 445;
  const maxValue = view === 'balance'
    ? Math.max(data.current[0]?.openingBalance || 0, data.alternate[0]?.openingBalance || 0)
    : view === 'interest'
      ? Math.max(data.current[0]?.interest || 0, data.alternate[0]?.interest || 0, 1)
      : Math.max(...data.current.map(p => p.total + data.currentCosts.total), ...data.alternate.map(p => p.total + data.alternateCosts.total), data.currentCosts.total, data.alternateCosts.total, 1);
  const tickUnit = 10 ** Math.floor(Math.log10(Math.max(maxValue / 3, 1)));
  const ceiling = Math.ceil(maxValue * 1.12 / tickUnit) * tickUnit;
  const plotW = width - PAD.left - PAD.right, plotH = height - PAD.top - PAD.bottom;
  const x = (month: number) => PAD.left + month / data.horizon * plotW;
  const y = (value: number) => height - PAD.bottom - value / ceiling * plotH;
  const todayOffset = today - data.start;
  const interestDifference = data.alternateInterest - data.currentInterest;
  const direction = Math.abs(interestDifference) < .005 ? 'difference' : interestDifference > 0 ? 'more' : 'less';
  const interestScope = mode === 'rate' ? 'Full terms' : 'From today';
  const alternativeLabel = mode === 'rate' ? 'Alternative' : 'New home';
  // Anchor the callout to a visible part of the gap, away from the plot edges.
  let anchorMonth = data.horizon * .5, largestGap = 0;
  for (let i = 20; i <= 80; i++) {
    const month = data.horizon * i / 100;
    const gap = Math.abs(sample(data, view, 'alternate', month) - sample(data, view, 'current', month));
    if (gap > largestGap) { largestGap = gap; anchorMonth = month; }
  }
  const anchorX = x(anchorMonth);
  const anchorY = y((sample(data, view, 'alternate', anchorMonth) + sample(data, view, 'current', anchorMonth)) / 2);
  const calloutWidth = Math.min(plotW, 240);
  const calloutLeft = width - PAD.right - calloutWidth;
  const connectorX = calloutLeft + calloutWidth * .5;

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    cursor.current = selected;
    renderCursor.current?.();
  }, [selected]);

  useEffect(() => {
    if (!canvas.current || width < 100) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas.current, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch { setWebgl(false); return; }
    setWebgl(true);
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, width, 0, height, .1, 1000);
    camera.position.z = 500;
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.PointLight(0xffffff, 120000);
    light.position.set(width * .4, -100, 180); scene.add(light);
    const targets = [false, true].flatMap(inner => ['current', 'alternate'].map(loan => Array.from({ length: SAMPLES + 1 }, (_, i) => sample(data, view, loan as 'current' | 'alternate', i / SAMPLES * data.horizon, inner))));
    const from = previous.current || targets;
    const values = targets.map(a => [...a]);
    let frame = 0, disposed = false;
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const trackGeometry = (g: THREE.BufferGeometry) => { geometries.push(g); return g; };
    const trackMaterial = <T extends THREE.Material>(m: T) => { materials.push(m); return m; };
    const strips: { geometry: THREE.BufferGeometry; series: number; thickness: number }[] = [];
    const sheets: { geometry: THREE.BufferGeometry; series: number; material: THREE.ShaderMaterial }[] = [];
    const positions = () => new Float32Array((SAMPLES + 1) * 2 * 3);
    const index = () => {
      const a: number[] = [];
      for (let i = 0; i < SAMPLES; i++) a.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      return a;
    };
    const gapGeometry = trackGeometry(new THREE.BufferGeometry());
    gapGeometry.setAttribute('position', new THREE.BufferAttribute(positions(), 3));
    gapGeometry.setIndex(index());
    const gapMaterial = trackMaterial(new THREE.MeshBasicMaterial({ color: LILAC, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }));
    const gapMesh = new THREE.Mesh(gapGeometry, gapMaterial);
    gapMesh.position.z = 3; scene.add(gapMesh);
    for (let loan = 1; loan >= 0; loan--) {
      const color = loan === 0 ? GOLD : LILAC;
      const g = trackGeometry(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(positions(), 3));
      const uv = new Float32Array((SAMPLES + 1) * 4);
      for (let i = 0; i <= SAMPLES; i++) uv.set([i / SAMPLES, 1, i / SAMPLES, 0], i * 4);
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(index());
      const material = trackMaterial(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(color) }, uCursor: { value: cursor.current / data.horizon } },
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: 'varying vec2 vUv; uniform vec3 uColor; uniform float uCursor; void main(){float scan=exp(-pow((vUv.x-uCursor)*20.0,2.0));float alpha=0.005+0.035*pow(vUv.y,1.9)+0.018*scan*vUv.y;gl_FragColor=vec4(uColor,alpha);}',
      }));
      const mesh = new THREE.Mesh(g, material); mesh.position.z = loan === 0 ? 2 : 1; scene.add(mesh);
      sheets.push({ geometry: g, series: loan, material });
      const seriesToDraw = view === 'payment' ? [loan, loan + 2] : [loan];
      for (const series of seriesToDraw) for (const [thickness, opacity] of [[15, .018], [7, .055], [2, series >= 2 ? .75 : .9]]) {
        const geometry = trackGeometry(new THREE.BufferGeometry());
        geometry.setAttribute('position', new THREE.BufferAttribute(positions(), 3)); geometry.setIndex(index());
        const mat = trackMaterial(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
        const strip = new THREE.Mesh(geometry, mat); strip.position.z = 4; scene.add(strip);
        strips.push({ geometry, series, thickness });
      }
    }
    const orbs = [GOLD, LILAC].map(color => {
      const group = new THREE.Group();
      const sphere = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(4.5, 24, 16)), trackMaterial(new THREE.MeshStandardMaterial({ color, metalness: .3, roughness: .25, emissive: color, emissiveIntensity: .13 })));
      group.add(sphere);
      for (const [radius, opacity] of [[9, .06], [15, .025]]) group.add(new THREE.Mesh(trackGeometry(new THREE.CircleGeometry(radius, 32)), trackMaterial(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))));
      group.position.z = 12; scene.add(group); return group;
    });
    function updateCursor() {
      if (disposed) return;
      sheets.forEach(s => { s.material.uniforms.uCursor.value = cursor.current / data.horizon; });
      orbs.forEach((orb, i) => {
        const pos = cursor.current / data.horizon * SAMPLES, a = Math.floor(pos), f = pos - a;
        const value = values[i][a] + ((values[i][Math.min(a + 1, SAMPLES)] || 0) - values[i][a]) * f;
        orb.position.set(x(cursor.current), y(value), 12);
      });
      renderer.render(scene, camera);
    }
    renderCursor.current = updateCursor;
    function updateGeometry() {
      const gapPositions = gapGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i <= SAMPLES; i++) {
        const xx = PAD.left + i / SAMPLES * plotW;
        gapPositions.setXYZ(i * 2, xx, y(values[0][i]), 0);
        gapPositions.setXYZ(i * 2 + 1, xx, y(values[1][i]), 0);
      }
      gapPositions.needsUpdate = true; gapGeometry.computeBoundingSphere();
      for (const sheet of sheets) {
        const p = sheet.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i <= SAMPLES; i++) {
          const xx = PAD.left + i / SAMPLES * plotW;
          p.setXYZ(i * 2, xx, y(values[sheet.series][i]), 0);
          const lower = view === 'payment' ? y(values[sheet.series + 2][i]) : height - PAD.bottom;
          p.setXYZ(i * 2 + 1, xx, lower, 0);
        }
        p.needsUpdate = true; sheet.geometry.computeBoundingSphere();
      }
      for (const strip of strips) {
        const p = strip.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i <= SAMPLES; i++) {
          const xx = PAD.left + i / SAMPLES * plotW, yy = y(values[strip.series][i]);
          p.setXYZ(i * 2, xx, yy - strip.thickness / 2, 0); p.setXYZ(i * 2 + 1, xx, yy + strip.thickness / 2, 0);
        }
        p.needsUpdate = true; strip.geometry.computeBoundingSphere();
      }
    }
    const start = performance.now(), duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 480;
    function animate(now: number) {
      if (disposed) return;
      const t = duration ? Math.min((now - start) / duration, 1) : 1, ease = 1 - (1 - t) ** 3;
      targets.forEach((row, k) => row.forEach((value, i) => { values[k][i] = (from[k]?.[i] ?? value) + (value - (from[k]?.[i] ?? value)) * ease; }));
      updateGeometry(); updateCursor(); previous.current = values.map(a => [...a]);
      if (t < 1) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    const lost = (e: Event) => { e.preventDefault(); setWebgl(false); };
    const element = canvas.current;
    element.addEventListener('webglcontextlost', lost);
    return () => {
      disposed = true; cancelAnimationFrame(frame); renderCursor.current = null;
      element.removeEventListener('webglcontextlost', lost);
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose();
    };
    // Cursor updates are handled independently so scrubbing never rebuilds the scene.
  }, [data, view, width, height, ceiling]);

  const fallbackPath = (loan: 'current' | 'alternate', inner = false) => Array.from({ length: SAMPLES + 1 }, (_, i) => `${i ? 'L' : 'M'}${x(i / SAMPLES * data.horizon).toFixed(2)},${y(sample(data, view, loan, i / SAMPLES * data.horizon, inner)).toFixed(2)}`).join(' ');
  const fallbackArea = (loan: 'current' | 'alternate') => {
    const lower = view !== 'payment'
      ? `L${x(data.horizon)},${y(0)} L${x(0)},${y(0)}`
      : Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const month = (SAMPLES - i) / SAMPLES * data.horizon;
        return `L${x(month).toFixed(2)},${y(sample(data, view, loan, month, true)).toFixed(2)}`;
      }).join(' ');
    return `${fallbackPath(loan)} ${lower} Z`;
  };
  const fallbackGap = () => `${fallbackPath('current')} ${Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const month = (SAMPLES - i) / SAMPLES * data.horizon;
    return `L${x(month).toFixed(2)},${y(sample(data, view, 'alternate', month)).toFixed(2)}`;
  }).join(' ')} Z`;
  const dateTicks = width < 500 ? [0, .5, 1] : [0, .2, .4, .6, .8, 1];
  function selectAt(clientX: number) {
    if (!host.current) return;
    const pos = clientX - host.current.getBoundingClientRect().left;
    onSelect(Math.max(0, Math.min(data.horizon - 1, Math.round((pos - PAD.left) / plotW * data.horizon))));
  }
  return <div className={`chart ${focused ? 'chart-active' : ''}`} ref={host} style={{ height }}
    onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); selectAt(e.clientX); setFocused(true); }}
    onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons) selectAt(e.clientX); }}
    onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setFocused(false); }}
    onPointerLeave={() => setFocused(false)}>
    <svg className="chart-grid" width={width} height={height} role="img" aria-label={`${view === 'balance' ? 'Remaining loan balances' : view === 'interest' ? 'Monthly interest, excluding principal, taxes and insurance' : data.includeHousingCosts ? 'Monthly housing costs, including estimated taxes and insurance' : 'Monthly payments and interest portions'} for both mortgages. Use the timeline slider below to explore each month.`}>
      <defs><linearGradient id="chart-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GOLD} stopOpacity=".05"/><stop offset="1" stopColor={GOLD} stopOpacity="0"/></linearGradient><linearGradient id="chart-lilac" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={LILAC} stopOpacity=".05"/><stop offset="1" stopColor={LILAC} stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3].map(i => <g key={i}><line x1={PAD.left} x2={width - PAD.right} y1={y(ceiling * i / 3)} y2={y(ceiling * i / 3)} className="grid-line"/><text x={PAD.left - 12} y={y(ceiling * i / 3) + 4} textAnchor="end">{compactMoney(ceiling * i / 3)}</text></g>)}
      {view === 'payment' && data.includeHousingCosts && [data.currentCosts, data.alternateCosts].map((costs, i) => <line key={i} x1={PAD.left} x2={width - PAD.right} y1={y(costs.total)} y2={y(costs.total)} stroke={i === 0 ? GOLD : LILAC} strokeOpacity=".45" strokeDasharray="3 6" strokeDashoffset={i * 4.5}/>)}
      {dateTicks.map(t => <text key={t} x={x(t * data.horizon)} y={height - 13} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}>{formatMonth(data.start + Math.round(t * data.horizon), true).split(' ')[1]}</text>)}
      {todayOffset >= 0 && todayOffset < data.horizon && <g className="today-marker"><line x1={x(todayOffset)} x2={x(todayOffset)} y1={PAD.top} y2={height - PAD.bottom} strokeDasharray="2 5"/><text x={Math.max(PAD.left + 17, x(todayOffset))} y={PAD.top - 12} textAnchor="middle">TODAY</text></g>}
      {!webgl && <path d={fallbackGap()} fill={LILAC} fillOpacity=".14"/>}
      {!webgl && (['alternate', 'current'] as const).map((loan, i) => <g key={loan}><path d={fallbackArea(loan)} fill={`url(#chart-${i ? 'gold' : 'lilac'})`}/><path d={fallbackPath(loan)} stroke={i ? GOLD : LILAC} strokeWidth="2" fill="none"/>{view === 'payment' && <path d={fallbackPath(loan, true)} stroke={i ? GOLD : LILAC} strokeWidth="1.5" strokeDasharray="4 4" fill="none"/>}</g>)}
    </svg>
    <canvas ref={canvas} className="chart-canvas" aria-hidden="true" style={{ opacity: webgl ? 1 : 0 }}/>
    {largestGap / ceiling * plotH > 2 && <svg className="chart-annotation" width={width} height={height} aria-hidden="true">
      <path d={`M${connectorX},86 L${connectorX},94 L${anchorX},${anchorY}`} className="interest-connector"/>
      <circle cx={anchorX} cy={anchorY} r="3" className="interest-anchor"/>
    </svg>}
    <div className={`chart-interest-callout ${width < 360 ? 'compact' : ''}`} style={{ left: calloutLeft, width: calloutWidth }} role="note" aria-label={`${alternativeLabel} has ${money(Math.abs(interestDifference), 2)} ${direction} in total interest compared with current. ${interestScope}.`}>
      <span>Interest difference · {interestScope.toLowerCase()}</span>
      <strong>{Math.abs(interestDifference) >= 10000000 ? compactMoney(Math.abs(interestDifference)) : money(Math.abs(interestDifference))} <em>{direction}</em></strong>
      <small>{alternativeLabel} vs. current</small>
    </div>
    <div className="scrub-line" style={{ left: x(selected), top: PAD.top, bottom: PAD.bottom }}/>
  </div>;
}
