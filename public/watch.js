/* Nicer Watch - interactive 3D simulation
 * Three.js r128 (UMD global), hand-rolled orbit controls, procedural dial texture.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  if (typeof THREE === 'undefined') {
    $('loader').classList.add('hidden');
    $('fallback').hidden = false;
    return;
  }

  // ---------------------------------------------------------------- config
  var THEMES = {
    dark: {
      faceInner: '#1a2130', faceOuter: '#05080e',
      ink: '#eaf0fb', muted: '#7e889d', accent: '#6ea8ff',
      lume: '#9ff2e0', ray: 'rgba(255,255,255,0.045)',
      windowFill: 'rgba(255,255,255,0.055)', windowLine: 'rgba(255,255,255,0.14)',
      handBody: 0xdfe6f2, handEdge: 0x8f9bb0
    },
    light: {
      faceInner: '#fdfefe', faceOuter: '#ccd4e0',
      ink: '#141b27', muted: '#68738a', accent: '#2f6fe0',
      lume: '#1d9f8a', ray: 'rgba(0,0,0,0.035)',
      windowFill: 'rgba(0,0,0,0.045)', windowLine: 'rgba(0,0,0,0.14)',
      handBody: 0x1a2030, handEdge: 0x151b26
    }
  };

  // ?face=light  ?rotate=0  ?view=front|back|side|macro  ?r=&theta=&phi=
  var params = new URLSearchParams(location.search);
  var num = function (k, d) {
    var v = parseFloat(params.get(k));
    return isFinite(v) ? v : d;
  };

  var state = {
    theme: params.get('face') === 'light' ? 'light' : 'dark',
    autoRotate: params.get('rotate') !== '0',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
    bpm: 68,
    steps: 7412
  };

  var VIEWS = {
    front: { radius: 4.6, theta: 0.0, phi: 0.28 },
    angle: { radius: 5.4, theta: 0.62, phi: 1.02 },
    side: { radius: 4.8, theta: 1.45, phi: 1.42 },
    back: { radius: 4.8, theta: 0.35, phi: 2.75 },
    macro: { radius: 2.6, theta: 0.30, phi: 0.75 }
  };

  // ------------------------------------------------------------- renderer
  var stage = $('stage');
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);

  // ------------------------------------------------- studio environment map
  function makeEnvironment() {
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    var g = c.getContext('2d');

    var sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#8c9bb5');
    sky.addColorStop(0.45, '#39414f');
    sky.addColorStop(0.55, '#22272f');
    sky.addColorStop(1, '#0a0c11');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1024, 512);

    // soft boxes -> the highlights that roll across the steel
    function softbox(x, y, rx, ry, strength, tint) {
      var rg = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      rg.addColorStop(0, 'rgba(' + tint + ',' + strength + ')');
      rg.addColorStop(1, 'rgba(' + tint + ',0)');
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      g.translate(-x, -y);
      g.fillStyle = rg;
      g.fillRect(x - rx * 2, y - rx * 2, rx * 4, rx * 4);
      g.restore();
    }
    softbox(210, 120, 210, 130, 1, '255,255,255');
    softbox(700, 90, 170, 100, 0.9, '235,244,255');
    softbox(500, 300, 260, 160, 0.28, '120,160,255');
    softbox(930, 250, 150, 120, 0.3, '255,214,170');

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;

    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var envMap = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return envMap;
  }
  scene.environment = makeEnvironment();

  // ------------------------------------------------------------- lighting
  scene.add(new THREE.HemisphereLight(0xa8c4ff, 0x14171d, 0.45));

  var key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(4.5, 7.5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0006;
  key.shadow.radius = 3;
  scene.add(key);

  var fill = new THREE.DirectionalLight(0x87b0ff, 0.85);
  fill.position.set(-6, 2.5, -4.5);
  scene.add(fill);

  var rim = new THREE.DirectionalLight(0xffd2a0, 0.7);
  rim.position.set(-1.5, -3, -6);
  scene.add(rim);

  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ opacity: 0.38 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.35;
  ground.receiveShadow = true;
  scene.add(ground);

  // ------------------------------------------------------------ materials
  var steel = new THREE.MeshStandardMaterial({
    color: 0xc2c8d2, metalness: 1, roughness: 0.22, envMapIntensity: 1.25, side: THREE.DoubleSide
  });
  var steelDark = new THREE.MeshStandardMaterial({
    color: 0x6d7482, metalness: 1, roughness: 0.35, envMapIntensity: 1.1
  });
  var ceramic = new THREE.MeshStandardMaterial({
    color: 0x111722, metalness: 0.25, roughness: 0.18, envMapIntensity: 1.4
  });
  var gold = new THREE.MeshStandardMaterial({
    color: 0xd9a441, metalness: 1, roughness: 0.18, envMapIntensity: 1.5
  });
  var rubber = new THREE.MeshStandardMaterial({
    color: 0x0e1218, metalness: 0.08, roughness: 0.88, envMapIntensity: 0.35
  });
  var accentMat = new THREE.MeshStandardMaterial({
    color: 0xff7a45, metalness: 0.5, roughness: 0.3, envMapIntensity: 1.2
  });
  var lumeMat = new THREE.MeshStandardMaterial({
    color: 0xbdf6e8, emissive: 0x3fd8b8, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0
  });
  var handMat = new THREE.MeshStandardMaterial({
    color: THEMES.dark.handBody, metalness: 0.95, roughness: 0.2, envMapIntensity: 1.3
  });
  var glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.14,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 2.2,
    side: THREE.DoubleSide, depthWrite: false
  });

  // ------------------------------------------------------- dial texture
  var DIAL_PX = 1024;
  var dialCanvas = document.createElement('canvas');
  dialCanvas.width = dialCanvas.height = DIAL_PX;
  var dctx = dialCanvas.getContext('2d');
  var dialTexture = new THREE.CanvasTexture(dialCanvas);
  dialTexture.encoding = THREE.sRGBEncoding;
  dialTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function drawDial(now) {
    var t = THEMES[state.theme];
    var S = DIAL_PX, c = S / 2, R = S / 2;
    var g = dctx;

    g.clearRect(0, 0, S, S);

    // face
    var bg = g.createRadialGradient(c, c * 0.82, R * 0.06, c, c, R);
    bg.addColorStop(0, t.faceInner);
    bg.addColorStop(1, t.faceOuter);
    g.fillStyle = bg;
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fill();

    // brushed sun-ray finish
    g.save();
    g.beginPath();
    g.arc(c, c, R * 0.97, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = t.ray;
    g.lineWidth = 1.6;
    for (var r = 0; r < 260; r++) {
      var a = (r / 260) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * R * 0.1, c + Math.sin(a) * R * 0.1);
      g.lineTo(c + Math.cos(a) * R * 0.96, c + Math.sin(a) * R * 0.96);
      g.stroke();
    }
    g.restore();

    // minute / hour track
    for (var i = 0; i < 60; i++) {
      var ang = (i / 60) * Math.PI * 2 - Math.PI / 2;
      var isHour = i % 5 === 0;
      var r0 = isHour ? R * 0.855 : R * 0.885;
      var r1 = R * 0.925;
      g.strokeStyle = isHour ? t.ink : t.muted;
      g.lineWidth = isHour ? 7 : 2.4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(c + Math.cos(ang) * r0, c + Math.sin(ang) * r0);
      g.lineTo(c + Math.cos(ang) * r1, c + Math.sin(ang) * r1);
      g.stroke();
    }

    // applied hour indices with lume pips
    for (var h = 0; h < 12; h++) {
      var ha = (h / 12) * Math.PI * 2 - Math.PI / 2;
      var bars = h === 0 ? [-13, 13] : [0];
      for (var b = 0; b < bars.length; b++) {
        g.save();
        g.translate(c + Math.cos(ha) * R * 0.775, c + Math.sin(ha) * R * 0.775);
        g.rotate(ha + Math.PI / 2);
        g.translate(bars[b], 0);
        var grad = g.createLinearGradient(-9, 0, 9, 0);
        grad.addColorStop(0, t.muted);
        grad.addColorStop(0.45, t.ink);
        grad.addColorStop(1, t.muted);
        g.fillStyle = grad;
        roundRect(g, -9, -46, 18, 92, 8);
        g.fill();
        g.fillStyle = t.lume;
        g.globalAlpha = 0.85;
        roundRect(g, -5, -38, 10, 76, 5);
        g.fill();
        g.globalAlpha = 1;
        g.restore();
      }
    }

    // live seconds arc on the flange
    var secFrac = (now.getSeconds() + now.getMilliseconds() / 1000) / 60;
    g.strokeStyle = t.accent;
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(c, c, R * 0.963, -Math.PI / 2, -Math.PI / 2 + secFrac * Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;

    // wordmark: one line, two weights, measured so the pair stays centred
    g.textBaseline = 'middle';
    g.letterSpacing = '9px';
    var thin = '300 46px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
    var bold = '600 46px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
    g.textAlign = 'left';
    g.font = thin;
    var w1 = g.measureText('NICER ').width;
    g.font = bold;
    var w2 = g.measureText('WATCH').width;
    var markY = c - R * 0.50;
    var x0 = c - (w1 + w2) / 2;
    g.font = thin;
    g.fillStyle = t.ink;
    g.fillText('NICER ', x0, markY);
    g.font = bold;
    g.fillStyle = t.accent;
    g.fillText('WATCH', x0 + w1, markY);

    g.letterSpacing = '0px'; // sticky on the 2d context, so reset it
    g.textAlign = 'center';
    g.font = '400 20px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
    g.fillStyle = t.muted;
    g.fillText('SMART  ·  5 ATM  ·  NW-1', c, c - R * 0.385);

    // digital window at 6 o'clock
    var wW = R * 0.72, wH = R * 0.235, wX = c - wW / 2, wY = c + R * 0.30;
    g.fillStyle = t.windowFill;
    g.strokeStyle = t.windowLine;
    g.lineWidth = 2;
    roundRect(g, wX, wY, wW, wH, 18);
    g.fill();
    g.stroke();
    g.fillStyle = t.ink;
    g.font = '500 58px ui-monospace, "Cascadia Mono", Consolas, monospace';
    g.fillText(pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()), c, wY + wH * 0.42);
    g.font = '400 17px ui-sans-serif, system-ui, sans-serif';
    g.fillStyle = t.muted;
    g.fillText(String(state.tz).toUpperCase(), c, wY + wH * 0.79);

    // date window at 3 o'clock
    var dW = R * 0.30, dH = R * 0.17, dX = c + R * 0.40, dY = c - dH / 2;
    g.fillStyle = t.windowFill;
    g.strokeStyle = t.windowLine;
    roundRect(g, dX, dY, dW, dH, 12);
    g.fill();
    g.stroke();
    var day = now.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
    g.fillStyle = t.muted;
    g.font = '500 20px ui-sans-serif, system-ui, sans-serif';
    g.fillText(day, dX + dW / 2, dY + dH * 0.3);
    g.fillStyle = t.ink;
    g.font = '600 44px ui-sans-serif, system-ui, sans-serif';
    g.fillText(String(now.getDate()), dX + dW / 2, dY + dH * 0.68);

    // heart-rate sub-gauge at 9 o'clock
    var gx = c - R * 0.475, gy = c, gr = R * 0.15;
    g.strokeStyle = t.windowLine;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(gx, gy, gr, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#ff5a72';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(gx, gy, gr, -Math.PI / 2, -Math.PI / 2 + (state.bpm / 200) * Math.PI * 2);
    g.stroke();
    g.fillStyle = t.ink;
    g.font = '600 34px ui-sans-serif, system-ui, sans-serif';
    g.fillText(String(Math.round(state.bpm)), gx, gy - 6);
    g.fillStyle = t.muted;
    g.font = '400 16px ui-sans-serif, system-ui, sans-serif';
    g.fillText('BPM', gx, gy + 24);

    // step counter under the hub
    g.fillStyle = t.muted;
    g.font = '400 18px ui-sans-serif, system-ui, sans-serif';
    g.fillText('▲ ' + state.steps.toLocaleString() + ' STEPS', c, c + R * 0.185);

    dialTexture.needsUpdate = true;
  }

  // caseback engraving texture
  function makeCaseback() {
    var S = 512, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var g = cv.getContext('2d');
    var c = S / 2;
    var bg = g.createRadialGradient(c, c, 10, c, c, c);
    bg.addColorStop(0, '#5c6371');
    bg.addColorStop(1, '#2b3038');
    g.fillStyle = bg;
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 1;
    for (var i = 6; i < c; i += 7) { g.beginPath(); g.arc(c, c, i, 0, Math.PI * 2); g.stroke(); }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.72)';
    g.font = '600 34px ui-sans-serif, system-ui, sans-serif';
    g.fillText('NICER WATCH', c, c - 132);
    g.font = '400 22px ui-sans-serif, system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillText('MODEL NW-1', c, c + 124);
    g.fillText('WATER RESIST 5 ATM', c, c + 158);
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ------------------------------------------------------------- the watch
  var watch = new THREE.Group();
  scene.add(watch);

  // case body (lathed profile: caseback -> mid-case -> bezel -> inner flange)
  var profile = [
    [0.00, -0.170], [0.44, -0.170], [0.70, -0.158], [0.86, -0.118],
    [0.94, -0.048], [0.975, 0.000], [0.985, 0.052], [0.972, 0.100],
    [0.938, 0.134], [0.880, 0.152], [0.832, 0.146], [0.802, 0.120],
    [0.792, 0.060], [0.782, 0.036]
  ].map(function (p) { return new THREE.Vector2(p[0], p[1]); });

  var caseMesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 160), steel);
  caseMesh.castShadow = true;
  caseMesh.receiveShadow = true;
  watch.add(caseMesh);

  // ceramic bezel ring sitting on the case top
  var bezelRing = new THREE.Mesh(new THREE.TorusGeometry(0.905, 0.028, 20, 160), ceramic);
  bezelRing.rotation.x = -Math.PI / 2;
  bezelRing.position.y = 0.138;
  bezelRing.castShadow = true;
  watch.add(bezelRing);

  // dial
  var dial = new THREE.Mesh(
    new THREE.CircleGeometry(0.782, 128),
    new THREE.MeshStandardMaterial({ map: dialTexture, roughness: 0.52, metalness: 0.12, envMapIntensity: 0.75 })
  );
  dial.rotation.x = -Math.PI / 2;
  dial.position.y = 0.036;
  dial.receiveShadow = true;
  watch.add(dial);

  // caseback plate + heart-rate sensor cluster
  var backPlate = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 96),
    new THREE.MeshStandardMaterial({ map: makeCaseback(), metalness: 0.9, roughness: 0.35, envMapIntensity: 1 })
  );
  backPlate.rotation.x = Math.PI / 2;
  backPlate.position.y = -0.171;
  watch.add(backPlate);

  var sensorPod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.05, 48), ceramic);
  sensorPod.position.y = -0.19;
  watch.add(sensorPod);
  var sensorLights = [];
  [[0.09, 0, 0x35ff9e], [-0.09, 0, 0x35ff9e], [0, 0.09, 0x66ccff]].forEach(function (p) {
    var led = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.012, 20),
      new THREE.MeshStandardMaterial({ color: p[2], emissive: p[2], emissiveIntensity: 1.4, roughness: 0.3 })
    );
    led.position.set(p[0], -0.213, p[1]);
    watch.add(led);
    sensorLights.push(led.material);
  });

  // crown + pushers on the 3 o'clock flank
  var crown = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.085, 28), steel);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(1.015, 0.005, 0);
  crown.castShadow = true;
  watch.add(crown);
  var crownCap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24), gold);
  crownCap.rotation.z = Math.PI / 2;
  crownCap.position.set(1.062, 0.005, 0);
  watch.add(crownCap);

  [-1, 1].forEach(function (s) {
    var pusher = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 20), steelDark);
    pusher.rotation.z = Math.PI / 2;
    var a = s * 0.52;
    pusher.position.set(Math.cos(a) * 0.99, 0.005, -Math.sin(a) * 0.99);
    pusher.rotation.y = a;
    pusher.castShadow = true;
    watch.add(pusher);
  });

  // sapphire crystal (shallow dome)
  var CR = 3.6, cr = 0.80;
  var capTheta = Math.asin(cr / CR);
  var glass = new THREE.Mesh(
    new THREE.SphereGeometry(CR, 72, 24, 0, Math.PI * 2, 0, capTheta),
    glassMat
  );
  glass.position.y = 0.146 - Math.sqrt(CR * CR - cr * cr);
  watch.add(glass);

  // --------------------------------------------------------------- hands
  function buildHand(len, w, thick, tail, material, withLume) {
    var group = new THREE.Group();
    var geo = new THREE.BoxGeometry(w, thick, len + tail);
    geo.translate(0, 0, -(len + tail) / 2 + tail);
    var mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    group.add(mesh);
    if (withLume) {
      var lg = new THREE.BoxGeometry(w * 0.6, thick * 0.8, len * 0.42);
      lg.translate(0, thick * 0.12, -len * 0.62); // sit flush in the hand, not on top of it
      group.add(new THREE.Mesh(lg, lumeMat));
    }
    return group;
  }

  var hourHand = buildHand(0.40, 0.062, 0.020, 0.09, handMat, true);
  hourHand.position.y = 0.062;
  watch.add(hourHand);

  var minuteHand = buildHand(0.60, 0.046, 0.017, 0.11, handMat, true);
  minuteHand.position.y = 0.085;
  watch.add(minuteHand);

  var secondHand = new THREE.Group();
  var sGeo = new THREE.BoxGeometry(0.016, 0.010, 0.82);
  sGeo.translate(0, 0, -0.82 / 2 + 0.14);
  var sMesh = new THREE.Mesh(sGeo, accentMat);
  sMesh.castShadow = true;
  secondHand.add(sMesh);
  var counterweight = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), accentMat);
  counterweight.position.set(0, 0, 0.105);
  secondHand.add(counterweight);
  secondHand.position.y = 0.106;
  watch.add(secondHand);

  var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.045, 28), gold);
  hub.position.y = 0.104;
  hub.castShadow = true;
  watch.add(hub);
  var hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), accentMat);
  hubCap.position.y = 0.126;
  watch.add(hubCap);

  // ---------------------------------------------------------- lugs + strap
  [1, -1].forEach(function (s) {
    [0.40, -0.40].forEach(function (x) {
      var lug = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.34), steel);
      lug.position.set(x, -0.035, s * 0.86);
      lug.rotation.x = s * 0.18;
      lug.castShadow = true;
      watch.add(lug);
    });

    // strap: links stepped along a curve that bends toward the wrist
    var links = 15, step = 0.135, bend = 0.115;
    var px = 0, py = -0.075, pz = s * 0.95, a = 0.16;
    for (var i = 0; i < links; i++) {
      var f = i / (links - 1);
      var width = 0.66 - f * 0.20;
      var link = new THREE.Mesh(new THREE.BoxGeometry(width, 0.062, step * 0.9), rubber);
      link.position.set(px, py, pz);
      link.rotation.x = s * a;
      link.castShadow = true;
      link.receiveShadow = true;
      watch.add(link);

      // brushed keeper every few links
      if (i === 6 || i === 11) {
        var keeper = new THREE.Mesh(new THREE.BoxGeometry(width + 0.018, 0.072, 0.04), steelDark);
        keeper.position.set(px, py, pz);
        keeper.rotation.x = s * a;
        watch.add(keeper);
      }

      py -= Math.sin(a) * step;
      pz += s * Math.cos(a) * step;
      a = Math.min(a + bend, 1.45);
    }
  });

  watch.position.y = 0.15;

  // -------------------------------------------------------- orbit controls
  var ctl = {
    target: new THREE.Vector3(0, 0, 0),
    radius: 5.4, theta: 0.62, phi: 1.02,
    goalRadius: 5.4, goalTheta: 0.62, goalPhi: 1.02,
    minR: 2.1, maxR: 14,
    dragging: null, lastX: 0, lastY: 0, pinch: 0, idle: 0
  };
  var HOME = { radius: 5.4, theta: 0.62, phi: 1.02, target: new THREE.Vector3(0, 0, 0) };

  var preset = VIEWS[params.get('view')] || VIEWS.angle;
  ctl.goalRadius = ctl.radius = num('r', preset.radius);
  ctl.goalTheta = ctl.theta = num('theta', preset.theta);
  ctl.goalPhi = ctl.phi = num('phi', preset.phi);
  HOME.radius = ctl.radius;
  HOME.theta = ctl.theta;
  HOME.phi = ctl.phi;

  function resetView() {
    ctl.goalRadius = HOME.radius;
    ctl.goalTheta = HOME.theta;
    ctl.goalPhi = HOME.phi;
    ctl.target.copy(HOME.target);
  }

  function zoomBy(factor) {
    ctl.goalRadius = THREE.MathUtils.clamp(ctl.goalRadius * factor, ctl.minR, ctl.maxR);
  }

  function pointerDown(e) {
    stage.setPointerCapture(e.pointerId);
    ctl.dragging = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
    ctl.lastX = e.clientX;
    ctl.lastY = e.clientY;
    ctl.idle = 0;
    stage.classList.add('dragging');
  }

  function pointerMove(e) {
    // during a two-finger pinch the first finger must not also spin the watch
    if (!ctl.dragging || ctl.pinch) return;
    var dx = e.clientX - ctl.lastX;
    var dy = e.clientY - ctl.lastY;
    ctl.lastX = e.clientX;
    ctl.lastY = e.clientY;
    ctl.idle = 0;

    if (ctl.dragging === 'rotate') {
      ctl.goalTheta -= dx * 0.0062;
      ctl.goalPhi = THREE.MathUtils.clamp(ctl.goalPhi - dy * 0.0062, 0.08, Math.PI - 0.08);
    } else {
      var scale = ctl.radius * 0.0016;
      var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      var up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      ctl.target.addScaledVector(right, -dx * scale);
      ctl.target.addScaledVector(up, dy * scale);
    }
  }

  function pointerUp(e) {
    ctl.dragging = null;
    stage.classList.remove('dragging');
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  }

  stage.addEventListener('pointerdown', pointerDown);
  stage.addEventListener('pointermove', pointerMove);
  stage.addEventListener('pointerup', pointerUp);
  stage.addEventListener('pointercancel', pointerUp);
  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  stage.addEventListener('dblclick', resetView);
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomBy(Math.exp(e.deltaY * 0.0011));
    ctl.idle = 0;
  }, { passive: false });

  // pinch to zoom
  stage.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    var d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (ctl.pinch) zoomBy(ctl.pinch / d);
    ctl.pinch = d;
    ctl.idle = 0;
  }, { passive: false });
  stage.addEventListener('touchend', function () { ctl.pinch = 0; });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') ctl.goalTheta += 0.12;
    else if (e.key === 'ArrowRight') ctl.goalTheta -= 0.12;
    else if (e.key === 'ArrowUp') ctl.goalPhi = THREE.MathUtils.clamp(ctl.goalPhi - 0.08, 0.08, Math.PI - 0.08);
    else if (e.key === 'ArrowDown') ctl.goalPhi = THREE.MathUtils.clamp(ctl.goalPhi + 0.08, 0.08, Math.PI - 0.08);
    else if (e.key === '+' || e.key === '=') zoomBy(0.88);
    else if (e.key === '-' || e.key === '_') zoomBy(1.14);
    else if (e.key.toLowerCase() === 'r') resetView();
    else return;
    ctl.idle = 0;
  });

  function updateCamera(dt) {
    if (state.autoRotate && !ctl.dragging) {
      ctl.idle += dt;
      if (ctl.idle > 1.2) ctl.goalTheta += dt * 0.24;
    }
    var k = 1 - Math.pow(0.0016, dt);
    ctl.theta += (ctl.goalTheta - ctl.theta) * k;
    ctl.phi += (ctl.goalPhi - ctl.phi) * k;
    ctl.radius += (ctl.goalRadius - ctl.radius) * k;

    var sp = Math.sin(ctl.phi);
    camera.position.set(
      ctl.target.x + ctl.radius * sp * Math.sin(ctl.theta),
      ctl.target.y + ctl.radius * Math.cos(ctl.phi),
      ctl.target.z + ctl.radius * sp * Math.cos(ctl.theta)
    );
    camera.lookAt(ctl.target);
  }

  // ------------------------------------------------------------- time loop
  var lastDialSecond = -1;

  function localNow() {
    return new Date(); // the browser clock == the user's own locale + timezone
  }

  function updateTime(elapsed) {
    var now = localNow();
    var ms = now.getMilliseconds() / 1000;
    var sec = now.getSeconds() + ms;
    var min = now.getMinutes() + sec / 60;
    var hr = (now.getHours() % 12) + min / 60;

    // negative: clockwise when seen from above (+Y)
    secondHand.rotation.y = -(sec / 60) * Math.PI * 2;
    minuteHand.rotation.y = -(min / 60) * Math.PI * 2;
    hourHand.rotation.y = -(hr / 12) * Math.PI * 2;

    // simulated vitals, refreshed with the dial
    state.bpm = 68 + Math.sin(elapsed * 0.35) * 6 + Math.sin(elapsed * 1.9) * 1.6;
    var pulse = 0.9 + Math.abs(Math.sin(elapsed * (state.bpm / 60) * Math.PI)) * 0.9;
    for (var i = 0; i < sensorLights.length; i++) sensorLights[i].emissiveIntensity = pulse;

    if (now.getSeconds() !== lastDialSecond) {
      lastDialSecond = now.getSeconds();
      state.steps += Math.floor(Math.random() * 3);
      drawDial(now);
      paintHud(now);
    }
  }

  var fmtTime = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  var fmtDate = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  function paintHud(now) {
    $('hudTime').textContent = fmtTime.format(now);
    $('hudDate').textContent = fmtDate.format(now);
    var offset = -now.getTimezoneOffset();
    var sign = offset >= 0 ? '+' : '-';
    var oh = Math.floor(Math.abs(offset) / 60);
    var om = Math.abs(offset) % 60;
    $('hudZone').textContent = state.tz + '  ·  UTC' + sign + pad(oh) + ':' + pad(om);
  }

  // On a white dial near-full metal hands just mirror the bright environment,
  // so the light face dials the metalness back and lets the base colour read.
  function applyTheme() {
    var dark = state.theme === 'dark';
    handMat.color.setHex(THEMES[state.theme].handBody);
    handMat.metalness = dark ? 0.95 : 0.4;
    handMat.roughness = dark ? 0.2 : 0.34;
    handMat.envMapIntensity = dark ? 1.3 : 0.7;
    lumeMat.emissiveIntensity = dark ? 0.55 : 0.12;
    drawDial(localNow());
  }

  // ------------------------------------------------------------ health ping
  function pingHealth() {
    var chip = $('healthChip');
    fetch('/healthz?format=json', { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { code: r.status, body: j }; }); })
      .then(function (res) {
        var s = res.body.status;
        chip.classList.remove('ok', 'warn', 'bad');
        chip.classList.add(s === 'healthy' ? 'ok' : s === 'degraded' ? 'warn' : 'bad');
        $('healthText').textContent =
          '/healthz · ' + s + ' · up ' + Math.round(res.body.uptimeSeconds) + 's';
      })
      .catch(function () {
        chip.classList.remove('ok', 'warn');
        chip.classList.add('bad');
        $('healthText').textContent = '/healthz · unreachable';
      });
  }
  pingHealth();
  setInterval(pingHealth, 15000);

  // ----------------------------------------------------------------- UI
  $('btnRotate').textContent = 'Auto-rotate: ' + (state.autoRotate ? 'on' : 'off');
  $('btnRotate').setAttribute('aria-pressed', String(state.autoRotate));
  $('btnFace').textContent = 'Face: ' + state.theme;

  $('btnRotate').addEventListener('click', function () {
    state.autoRotate = !state.autoRotate;
    this.textContent = 'Auto-rotate: ' + (state.autoRotate ? 'on' : 'off');
    this.setAttribute('aria-pressed', String(state.autoRotate));
  });

  $('btnFace').addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    this.textContent = 'Face: ' + state.theme;
    applyTheme();
  });

  $('btnZoomIn').addEventListener('click', function () { zoomBy(0.82); });
  $('btnZoomOut').addEventListener('click', function () { zoomBy(1.22); });
  $('btnReset').addEventListener('click', resetView);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --------------------------------------------------------------- render
  var clock = new THREE.Clock();
  applyTheme(); // also paints the first dial
  paintHud(localNow());

  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.1);
    updateTime(clock.elapsedTime);
    updateCamera(dt);
    renderer.render(scene, camera);
  }
  frame();

  setTimeout(function () { $('loader').classList.add('hidden'); }, 420);
})();
