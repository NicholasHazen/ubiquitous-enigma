(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const radians = degrees => degrees * Math.PI / 180;
  const finite = values => values.every(Number.isFinite);

  function driveKinematics(left, right, trackWidth = 0.16) {
    if (!finite([left, right, trackWidth]) || trackWidth <= 0) {
      throw new RangeError('Wheel speeds must be finite and track width must be positive.');
    }
    return { speed: (left + right) / 2, yawRate: (right - left) / trackWidth };
  }

  // Body x is forward; body y is left. The starting heading is zero.
  function differentialPose(speed, yawRate, time) {
    if (!finite([speed, yawRate, time])) throw new RangeError('Pose inputs must be finite.');
    const heading = yawRate * time;
    return Math.abs(yawRate) < 1e-9
      ? { x: speed * time, y: 0, heading }
      : { x: speed * Math.sin(heading) / yawRate,
          y: speed * (1 - Math.cos(heading)) / yawRate, heading };
  }

  function payloadTorque(grams, centimeters) {
    if (!finite([grams, centimeters]) || grams < 0 || centimeters < 0) {
      throw new RangeError('Payload and horizontal distance must be finite and nonnegative.');
    }
    const force = grams / 1000 * 9.81;
    return { force, torque: force * centimeters / 100 };
  }

  function gaitAngles(time, amplitude, frequency, phase, bias = 0, count = 5) {
    if (!finite([time, amplitude, frequency, phase, bias]) ||
        !Number.isInteger(count) || count < 1 || count > 100) {
      throw new RangeError('Gait parameters must be finite; joint count must be 1–100.');
    }
    // Angles returned in degrees; frequency is cycles per second.
    return Array.from({ length: count }, (_, i) =>
      bias + amplitude * Math.sin(TAU * frequency * time + i * radians(phase)));
  }

  function chainPoints(angles, linkLength = 50) {
    if (!Array.isArray(angles) || !finite(angles) || !Number.isFinite(linkLength) || linkLength <= 0) {
      throw new RangeError('Joint angles must be finite and link length must be positive.');
    }
    const points = [{ x: 0, y: 0 }, { x: linkLength, y: 0 }];
    let heading = 0;
    angles.forEach(angle => {
      heading += radians(angle);
      const last = points[points.length - 1];
      points.push({ x: last.x + linkLength * Math.cos(heading),
        y: last.y + linkLength * Math.sin(heading) });
    });
    return points;
  }

  const api = { driveKinematics, differentialPose, payloadTorque, gaitAngles, chainPoints, init };
  root.RoboticsLabs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  let serial = 0;
  const svgNS = 'http://www.w3.org/2000/svg';
  const fmt = (number, digits = 2) => (Math.abs(number) < Math.pow(10, -digits) / 2 ? 0 : number).toFixed(digits);

  function slider(id, label, min, max, step, value, unit) {
    return `<div class="lab-control"><label for="${id}">${label} <output id="${id}-value" for="${id}">${value} ${unit}</output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  }

  function makeSVGElement(tag, attrs) {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function connectSlider(container, id, unit, digits, render) {
    const input = container.querySelector(`#${id}`);
    const output = container.querySelector(`#${id}-value`);
    function update() {
      output.textContent = `${fmt(Number(input.value), digits)} ${unit}`;
      render();
    }
    input.addEventListener('input', update);
    return { input, update };
  }

  function mountDrive(container) {
    const id = `robotics-drive-${++serial}`;
    container.innerHTML = `<div class="lab" aria-labelledby="${id}-heading">
      <h4 id="${id}-heading">Two wheels, one motion</h4>
      <p>Predict the turn before moving a slider. Set each wheel-rim speed; positive means forward.</p>
      <div class="lab-controls">
        ${slider(`${id}-left`, 'Left wheel', -0.2, 0.2, 0.01, 0.12, 'm/s')}
        ${slider(`${id}-right`, 'Right wheel', -0.2, 0.2, 0.01, 0.12, 'm/s')}
      </div>
      <div class="lab-actions" aria-label="Wheel-speed examples">
        <button type="button" class="lab-button" data-preset="straight">Straight</button>
        <button type="button" class="lab-button" data-preset="arc">Arc left</button>
        <button type="button" class="lab-button" data-preset="spin">Turn in place</button>
        <button type="button" class="lab-button" data-preset="stop">Stop</button>
      </div>
      <svg class="lab-stage" viewBox="0 0 600 330" role="img" aria-labelledby="${id}-title ${id}-description">
        <title id="${id}-title">Top view of a differential-drive rover</title>
        <desc id="${id}-description"></desc>
        <defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
        <g fill="none" stroke="currentColor" opacity="0.12"><path d="M35 80H220M35 130H220M35 180H220M35 230H220M35 280H220M50 65V285M100 65V285M150 65V285M200 65V285"/></g>
        <text x="30" y="36" fill="currentColor" font-size="14">Ideal center path · 2 seconds</text>
        <path data-path fill="none" stroke="var(--accent, #087f8c)" stroke-width="4" stroke-linecap="round"/>
        <circle cx="125" cy="180" r="4" fill="currentColor"/>
        <text x="135" y="197" fill="currentColor" font-size="12">start</text>
        <path data-end-heading fill="none" stroke="var(--accent, #087f8c)" stroke-width="3" marker-end="url(#${id}-arrow)"/>
        <text x="340" y="36" fill="currentColor" font-size="14">Top view · nose points up</text>
        <rect x="360" y="107" width="100" height="137" rx="18" fill="var(--accent, #087f8c)" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
        <path d="M394 126L410 115L426 126" fill="none" stroke="currentColor" stroke-width="3"/>
        <rect x="343" y="143" width="17" height="65" rx="4" fill="currentColor"/>
        <rect x="460" y="143" width="17" height="65" rx="4" fill="currentColor"/>
        <circle cx="410" cy="222" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
        <path data-left-arrow fill="none" stroke="var(--accent, #087f8c)" stroke-width="4" marker-end="url(#${id}-arrow)"/>
        <path data-right-arrow fill="none" stroke="var(--accent, #087f8c)" stroke-width="4" marker-end="url(#${id}-arrow)"/>
        <text x="325" y="275" fill="currentColor" font-size="13">Left</text>
        <text x="470" y="275" fill="currentColor" font-size="13">Right</text>
        <path d="M351 295H469M351 290V300M469 290V300" fill="none" stroke="currentColor"/>
        <text x="410" y="320" text-anchor="middle" fill="currentColor" font-size="13">Wheel-track width: 0.16 m</text>
      </svg>
      <dl class="lab-readout"><div><dt>Forward speed</dt><dd data-speed></dd></div><div><dt>Turn rate</dt><dd data-yaw></dd></div></dl>
      <p class="lab-status" data-status aria-live="polite"></p>
      <p class="lab-note">v = (v<sub>R</sub> + v<sub>L</sub>) / 2; ω = (v<sub>R</sub> − v<sub>L</sub>) / 0.16. Positive turn rate means left. This ideal model assumes rolling without slip; it does not model motor dynamics or predict your robot’s exact path.</p>
    </div>`;
    const left = container.querySelector(`#${id}-left`);
    const right = container.querySelector(`#${id}-right`);
    function render() {
      const l = Number(left.value), r = Number(right.value);
      const { speed, yawRate } = driveKinematics(l, r);
      const path = Array.from({ length: 81 }, (_, i) => {
        const point = differentialPose(speed, yawRate, i / 40);
        return `${i ? 'L' : 'M'}${fmt(125 - point.y * 230, 2)},${fmt(180 - point.x * 230, 2)}`;
      }).join(' ');
      container.querySelector('[data-path]').setAttribute('d', path);
      const end = differentialPose(speed, yawRate, 2);
      const ex = 125 - end.y * 230, ey = 180 - end.x * 230;
      container.querySelector('[data-end-heading]').setAttribute('d', `M${ex},${ey}l${-Math.sin(end.heading) * 19},${-Math.cos(end.heading) * 19}`);
      [['left', l, 320], ['right', r, 500]].forEach(([name, value, x]) => {
        const arrow = container.querySelector(`[data-${name}-arrow]`);
        arrow.setAttribute('d', `M${x},176v${-value * 340}`);
        arrow.setAttribute('visibility', Math.abs(value) < 0.001 ? 'hidden' : 'visible');
      });
      container.querySelector('[data-speed]').textContent = `${fmt(speed, 3)} m/s`;
      container.querySelector('[data-yaw]').textContent = `${fmt(yawRate, 3)} rad/s`;
      let motion;
      if (Math.abs(speed) < 1e-9 && Math.abs(yawRate) < 1e-9) motion = 'Stopped.';
      else if (Math.abs(speed) < 1e-9) motion = `Turning in place ${yawRate > 0 ? 'left' : 'right'}; the ideal center stays still.`;
      else if (Math.abs(yawRate) < 1e-9) motion = `Moving straight ${speed > 0 ? 'forward' : 'backward'}.`;
      else motion = `Moving ${speed > 0 ? 'forward' : 'backward'} while the heading turns ${yawRate > 0 ? 'left' : 'right'}.`;
      container.querySelector('[data-status]').textContent = motion;
      container.querySelector(`#${id}-description`).textContent = `Left wheel ${fmt(l)} meters per second, right wheel ${fmt(r)} meters per second. ${motion}`;
    }
    const lControl = connectSlider(container, `${id}-left`, 'm/s', 2, render);
    const rControl = connectSlider(container, `${id}-right`, 'm/s', 2, render);
    const presets = { straight: [0.12, 0.12], arc: [0.06, 0.16], spin: [-0.1, 0.1], stop: [0, 0] };
    container.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
      [left.value, right.value] = presets[button.dataset.preset];
      lControl.update(); rControl.update();
    }));
    lControl.update(); rControl.update();
  }

  function mountTorque(container) {
    const id = `robotics-torque-${++serial}`;
    container.innerHTML = `<div class="lab" aria-labelledby="${id}-heading">
      <h4 id="${id}-heading">The same load, farther away</h4>
      <p>Predict the holding moment when you double the reach. This calculation holds a point payload on a horizontal link.</p>
      <div class="lab-controls">
        ${slider(`${id}-mass`, 'Payload mass', 0, 300, 10, 100, 'g')}
        ${slider(`${id}-reach`, 'Horizontal distance from pivot', 2, 20, 1, 5, 'cm')}
      </div>
      <div class="lab-actions"><button class="lab-button" type="button" data-reset>100 g at 5 cm</button><button class="lab-button" type="button" data-double>100 g at 10 cm</button></div>
      <svg class="lab-stage" viewBox="0 0 600 300" role="img" aria-labelledby="${id}-title ${id}-description">
        <title id="${id}-title">Payload torque on a horizontal arm</title><desc id="${id}-description"></desc>
        <defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>
        <rect x="61" y="154" width="48" height="96" rx="5" fill="currentColor" opacity="0.14"/>
        <path d="M36 250H134" stroke="currentColor" stroke-width="3"/>
        <path data-arm fill="none" stroke="var(--accent, #087f8c)" stroke-width="16" stroke-linecap="round"/>
        <circle cx="85" cy="155" r="13" fill="var(--paper, #faf8f2)" stroke="currentColor" stroke-width="3"/>
        <text x="44" y="284" fill="currentColor" font-size="14">Pivot</text>
        <rect data-payload y="139" width="32" height="32" rx="4" fill="currentColor"/>
        <path data-force fill="none" stroke="currentColor" stroke-width="3" marker-end="url(#${id}-arrow)"/>
        <path data-distance fill="none" stroke="currentColor" opacity="0.6"/>
        <text data-length-label y="96" fill="currentColor" text-anchor="middle" font-size="15"></text>
        <text data-force-label y="264" fill="currentColor" text-anchor="middle" font-size="14"></text>
      </svg>
      <dl class="lab-readout"><div><dt>Payload force</dt><dd data-force-value></dd></div><div><dt>Required holding moment</dt><dd data-torque-value></dd></div></dl>
      <p class="lab-status" data-calculation aria-live="polite"></p>
      <p class="lab-note">τ = m × 9.81 × L, with mass in kilograms and horizontal distance in meters. This is the payload’s static contribution only. Add the link’s weight at its center of mass, other loads, acceleration, friction, and operating margin. This value is not a servo selection or a continuous torque rating.</p>
    </div>`;
    const mass = container.querySelector(`#${id}-mass`);
    const reach = container.querySelector(`#${id}-reach`);
    function render() {
      const grams = Number(mass.value), cm = Number(reach.value);
      const { force, torque } = payloadTorque(grams, cm);
      const end = 85 + cm * 20;
      container.querySelector('[data-arm]').setAttribute('d', `M85 155H${end}`);
      container.querySelector('[data-payload]').setAttribute('x', end - 16);
      container.querySelector('[data-force]').setAttribute('d', `M${end} 178v${Math.max(9, grams * 0.19)}`);
      container.querySelector('[data-force]').setAttribute('visibility', grams ? 'visible' : 'hidden');
      container.querySelector('[data-distance]').setAttribute('d', `M85 109H${end}M85 103V115M${end} 103V115`);
      const lengthLabel = container.querySelector('[data-length-label]');
      lengthLabel.setAttribute('x', (85 + end) / 2); lengthLabel.textContent = `${cm} cm`;
      const forceLabel = container.querySelector('[data-force-label]');
      forceLabel.setAttribute('x', Math.max(end, 160)); forceLabel.textContent = `${grams} g payload · gravity ↓`;
      container.querySelector('[data-force-value]').textContent = `${fmt(force, 3)} N`;
      container.querySelector('[data-torque-value]').textContent = `${fmt(torque, 3)} N·m`;
      container.querySelector('[data-calculation]').textContent = `${fmt(grams / 1000, 2)} kg × 9.81 m/s² × ${fmt(cm / 100, 2)} m = ${fmt(torque, 4)} N·m.`;
      container.querySelector(`#${id}-description`).textContent = `A ${grams}-gram payload is ${cm} centimeters horizontally from the pivot, requiring ${fmt(torque, 4)} newton meters of holding moment for the payload alone.`;
    }
    const mControl = connectSlider(container, `${id}-mass`, 'g', 0, render);
    const rControl = connectSlider(container, `${id}-reach`, 'cm', 0, render);
    function setExample(cm) { mass.value = 100; reach.value = cm; mControl.update(); rControl.update(); }
    container.querySelector('[data-reset]').addEventListener('click', () => setExample(5));
    container.querySelector('[data-double]').addEventListener('click', () => setExample(10));
    mControl.update(); rControl.update();
  }

  function mountGait(container) {
    const id = `robotics-gait-${++serial}`;
    container.innerHTML = `<div class="lab" aria-labelledby="${id}-heading">
      <h4 id="${id}-heading">Build a traveling wave</h4>
      <p>Change one parameter, predict its effect, then press Play or advance one step. There are five joints joining six equal links.</p>
      <div class="lab-controls">
        ${slider(`${id}-amplitude`, 'Bend amplitude A', 0, 30, 1, 20, '°')}
        ${slider(`${id}-frequency`, 'Cycle frequency f', 0.1, 1, 0.05, 0.4, 'Hz')}
        ${slider(`${id}-phase`, 'Neighbor phase φ', 0, 120, 5, 60, '°')}
        ${slider(`${id}-bias`, 'Curvature bias b', -10, 10, 1, 0, '°')}
      </div>
      <div class="lab-actions">
        <button type="button" class="lab-button" data-play aria-pressed="false">Play</button>
        <button type="button" class="lab-button" data-step>Step ¼ second</button>
        <button type="button" class="lab-button" data-reset>Reset time</button>
      </div>
      <svg class="lab-stage" viewBox="0 0 640 450" role="img" aria-labelledby="${id}-title ${id}-description">
        <title id="${id}-title">A five-joint chain and its commanded angles</title>
        <desc id="${id}-description"></desc>
        <text x="24" y="20" fill="currentColor" font-size="14">Kinematic sketch · first link is the drawing reference</text>
        <g data-chain></g>
        <text x="24" y="320" fill="currentColor" font-size="14">Current joint targets (degrees)</text>
        <path d="M65 370H575" fill="none" stroke="currentColor" opacity="0.25"/>
        <text x="38" y="375" fill="currentColor" font-size="12">0°</text>
        <g data-angle-chart></g>
      </svg>
      <dl class="lab-readout"><div><dt>Wave time</dt><dd data-time>0.00 s</dd></div><div><dt>Peak wave angular speed</dt><dd data-rate></dd></div></dl>
      <p class="lab-status" data-status aria-live="polite">Paused. Motion starts only when you press Play.</p>
      <p class="lab-note"><strong>Kinematic sketch:</strong> shows joint motion, does not simulate contact or predict forward travel. q<sub>i</sub> = b + A sin(2πft + iφ), with i = 0…4. Positive angles bend counterclockwise in the drawing. The sine uses radians internally. Peak speed 2πfA assumes fixed parameters; abrupt parameter changes can create jumps. Real firmware must enforce angle and rate limits.</p>
    </div>`;
    const input = name => container.querySelector(`#${id}-${name}`);
    const controls = ['amplitude', 'frequency', 'phase', 'bias'].map(input);
    const chainGroup = container.querySelector('[data-chain]');
    const chartGroup = container.querySelector('[data-angle-chart]');
    const linkLines = Array.from({ length: 6 }, () => {
      const line = makeSVGElement('line', { stroke: 'var(--accent, #087f8c)', 'stroke-width': 16, 'stroke-linecap': 'round' });
      chainGroup.appendChild(line); return line;
    });
    const nodes = Array.from({ length: 7 }, (_, i) => {
      const circle = makeSVGElement('circle', { r: i === 0 || i === 6 ? 5 : 10,
        fill: 'var(--paper, #faf8f2)', stroke: 'currentColor', 'stroke-width': 2 });
      chainGroup.appendChild(circle); return circle;
    });
    const labels = Array.from({ length: 5 }, (_, i) => {
      const text = makeSVGElement('text', { 'text-anchor': 'middle', 'font-size': 11, fill: 'currentColor', 'dominant-baseline': 'central' });
      text.textContent = i; chainGroup.appendChild(text); return text;
    });
    const bars = Array.from({ length: 5 }, (_, i) => {
      const x = 85 + i * 117.5;
      const bar = makeSVGElement('line', { x1: x, x2: x, y1: 370, y2: 370,
        stroke: 'var(--accent, #087f8c)', 'stroke-width': 7, 'stroke-linecap': 'round' });
      const dot = makeSVGElement('circle', { cx: x, cy: 370, r: 4, fill: 'currentColor' });
      const label = makeSVGElement('text', { x, y: 433, 'text-anchor': 'middle', 'font-size': 13, fill: 'currentColor' });
      chartGroup.append(bar, dot, label); return { bar, dot, label };
    });
    let time = 0, playing = false, inView = true, frameId = null, lastTimestamp = null;
    const playButton = container.querySelector('[data-play]');
    const status = container.querySelector('[data-status]');
    const reducedMotion = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;

    function render() {
      const [amplitude, frequency, phase, bias] = controls.map(control => Number(control.value));
      const angles = gaitAngles(time, amplitude, frequency, phase, bias);
      const points = chainPoints(angles, 28).map(point => ({ x: point.x + 215, y: 160 - point.y }));
      linkLines.forEach((line, i) => {
        line.setAttribute('x1', points[i].x); line.setAttribute('y1', points[i].y);
        line.setAttribute('x2', points[i + 1].x); line.setAttribute('y2', points[i + 1].y);
      });
      nodes.forEach((circle, i) => { circle.setAttribute('cx', points[i].x); circle.setAttribute('cy', points[i].y); });
      labels.forEach((label, i) => { label.setAttribute('x', points[i + 1].x); label.setAttribute('y', points[i + 1].y); });
      bars.forEach(({ bar, dot, label }, i) => {
        const y = 370 - angles[i] * 0.9;
        bar.setAttribute('y2', y); dot.setAttribute('cy', y);
        label.textContent = `q${i}: ${fmt(angles[i], 1)}°`;
      });
      container.querySelector('[data-time]').textContent = `${fmt(time, 2)} s`;
      container.querySelector('[data-rate]').textContent = `${fmt(TAU * frequency * amplitude, 1)} °/s`;
      container.querySelector(`#${id}-description`).textContent = `At wave time ${fmt(time, 2)} seconds, the five commanded joint angles are ${angles.map(angle => fmt(angle, 1)).join(', ')} degrees. The drawing shows relative bending only, not locomotion.`;
    }

    function visible() {
      return !document.hidden && inView && !container.closest('[hidden]');
    }
    function frame(timestamp) {
      frameId = null;
      if (!playing || !visible()) { lastTimestamp = null; return; }
      if (lastTimestamp !== null) time += Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;
      render();
      frameId = root.requestAnimationFrame(frame);
    }
    function syncAnimation() {
      if (playing && visible()) {
        if (frameId === null) { lastTimestamp = null; frameId = root.requestAnimationFrame(frame); }
      } else {
        if (frameId !== null) root.cancelAnimationFrame(frameId);
        frameId = null; lastTimestamp = null;
      }
    }
    function setPlaying(value) {
      playing = value;
      playButton.textContent = playing ? 'Pause' : 'Play';
      playButton.setAttribute('aria-pressed', String(playing));
      status.textContent = playing ? 'Playing. Pause to inspect the joint targets.' : 'Paused. You can change parameters or advance one step.';
      syncAnimation();
    }
    playButton.addEventListener('click', () => setPlaying(!playing));
    container.querySelector('[data-step]').addEventListener('click', () => { setPlaying(false); time += 0.25; render(); });
    container.querySelector('[data-reset]').addEventListener('click', () => { setPlaying(false); time = 0; render(); });
    [['amplitude', '°', 0], ['frequency', 'Hz', 2], ['phase', '°', 0], ['bias', '°', 0]].forEach(([name, unit, digits]) =>
      connectSlider(container, `${id}-${name}`, unit, digits, render).update());
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncAnimation(); });
      observer.observe(container);
    }
    const chapter = container.closest('.chapter');
    if (chapter && typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncAnimation).observe(chapter, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    }
    document.addEventListener('visibilitychange', syncAnimation);
    if (reducedMotion) {
      const respectPreference = event => { if (event.matches) setPlaying(false); };
      if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', respectPreference);
      else if (reducedMotion.addListener) reducedMotion.addListener(respectPreference);
    }
    render();
  }

  function init(scope) {
    if (typeof document === 'undefined') return;
    const target = scope || document;
    const mounts = { drive: mountDrive, torque: mountTorque, gait: mountGait };
    target.querySelectorAll('[data-lab]').forEach(container => {
      if (container.dataset.labReady || !mounts[container.dataset.lab]) return;
      mounts[container.dataset.lab](container);
      container.dataset.labReady = 'true';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
})(typeof window === 'undefined' ? globalThis : window);
