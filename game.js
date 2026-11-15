import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";

(function () {
  "use strict";

  var STORAGE_KEY = "aether-rush-best";
  var LANES = [-2.15, 0, 2.15];
  var SEGMENT_LEN = 26;
  var SEGMENT_COUNT = 10;
  var START_SPEED = 28;
  var MAX_SPEED = 64;

  var canvas = document.getElementById("c");
  var hud = document.getElementById("hud");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var overlay = document.getElementById("overlay");
  var titleScreen = document.getElementById("title-screen");
  var gameoverScreen = document.getElementById("gameover-screen");
  var finalScoreEl = document.getElementById("final-score");
  var newBestEl = document.getElementById("new-best");
  var controls = document.getElementById("controls");

  var best = Number(localStorage.getItem(STORAGE_KEY) || 0);
  bestEl.textContent = String(Math.floor(best));

  var state = {
    mode: "title",
    lane: 1,
    x: 0,
    y: 0.62,
    z: 0,
    vy: 0,
    onGround: true,
    speed: 12,
    score: 0,
    distance: 0,
    shake: 0,
    time: 0,
    combo: 0
  };

  var keys = Object.create(null);
  var touchStart = null;
  var audioCtx = null;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0718);
  scene.fog = new THREE.FogExp2(0x0a0718, 0.032);

  var camera = new THREE.PerspectiveCamera(62, 1, 0.1, 280);
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: "high-performance",
    alpha: false
  });
  renderer.setClearColor(0x0a0718, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  function resize() {
    var vv = window.visualViewport;
    var w = Math.max(1, Math.floor(vv ? vv.width : window.innerWidth));
    var h = Math.max(1, Math.floor(vv ? vv.height : window.innerHeight));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize, { passive: true });
  }

  scene.add(new THREE.HemisphereLight(0x6ecbff, 0x2a1038, 0.85));
  var sun = new THREE.DirectionalLight(0xffc6a8, 0.9);
  sun.position.set(-8, 14, 6);
  scene.add(sun);
  var rim = new THREE.DirectionalLight(0x66f0ff, 0.45);
  rim.position.set(6, 4, -8);
  scene.add(rim);

  var skyGeo = new THREE.SphereGeometry(200, 24, 16);
  var skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.05,0.04,0.16); vec3 mid = vec3(0.22,0.07,0.28); vec3 bot = vec3(0.02,0.02,0.07); vec3 col = mix(bot, mid, smoothstep(-0.2, 0.15, h)); col = mix(col, top, smoothstep(0.15, 0.7, h)); gl_FragColor = vec4(col, 1.0); }"
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  var planet = new THREE.Mesh(
    new THREE.SphereGeometry(18, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0x241033,
      emissive: 0x3a1450,
      emissiveIntensity: 0.55,
      roughness: 0.85,
      metalness: 0.1
    })
  );
  planet.position.set(-42, 28, -120);
  scene.add(planet);
  var planetGlow = new THREE.Mesh(
    new THREE.SphereGeometry(22, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xff4ea8, transparent: true, opacity: 0.12, depthWrite: false })
  );
  planetGlow.position.copy(planet.position);
  scene.add(planetGlow);

  var starCount = 500;
  var starPos = new Float32Array(starCount * 3);
  for (var si = 0; si < starCount; si++) {
    starPos[si * 3] = (Math.random() - 0.5) * 220;
    starPos[si * 3 + 1] = 8 + Math.random() * 90;
    starPos[si * 3 + 2] = -20 - Math.random() * 200;
  }
  var starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.45, sizeAttenuation: true })));

  function makeRoadTexture() {
    var c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    var g = c.getContext("2d");
    g.fillStyle = "#141228";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#1c1840";
    for (var y = 0; y < 256; y += 16) {
      g.fillRect(0, y, 256, 1);
    }
    g.fillStyle = "#00f0ff";
    g.fillRect(126, 0, 4, 90);
    g.fillRect(126, 140, 4, 90);
    g.fillStyle = "#ff3d9a";
    g.fillRect(0, 0, 8, 256);
    g.fillRect(248, 0, 8, 256);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  var roadTex = makeRoadTexture();
  roadTex.repeat.set(1, SEGMENT_COUNT * 2);
  var roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.42,
    metalness: 0.35,
    emissive: 0x081018,
    emissiveIntensity: 0.6
  });
  var road = new THREE.Mesh(new THREE.PlaneGeometry(8.2, SEGMENT_LEN * SEGMENT_COUNT), roadMat);
  road.rotation.x = -Math.PI / 2;
  scene.add(road);

  var railGeo = new THREE.BoxGeometry(0.16, 0.28, SEGMENT_LEN * SEGMENT_COUNT);
  var railMatL = new THREE.MeshStandardMaterial({ color: 0x0a0a14, emissive: 0x00f0ff, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.6 });
  var railMatR = new THREE.MeshStandardMaterial({ color: 0x0a0a14, emissive: 0xff3d9a, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.6 });
  var railL = new THREE.Mesh(railGeo, railMatL);
  var railR = new THREE.Mesh(railGeo, railMatR);
  railL.position.set(-4.15, 0.16, 0);
  railR.position.set(4.15, 0.16, 0);
  scene.add(railL, railR);

  var pylonGeo = new THREE.BoxGeometry(0.22, 5.5, 0.22);
  var pylonMat = new THREE.MeshStandardMaterial({ color: 0x12081c, emissive: 0x6a2cff, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.5 });
  var pylonCount = 40;
  var pylons = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonCount);
  var dummy = new THREE.Object3D();
  for (var pi = 0; pi < pylonCount; pi++) {
    var side = pi % 2 === 0 ? -1 : 1;
    dummy.position.set(side * 5.3, 2.6, -Math.floor(pi / 2) * 14);
    dummy.updateMatrix();
    pylons.setMatrixAt(pi, dummy.matrix);
  }
  pylons.instanceMatrix.needsUpdate = true;
  scene.add(pylons);
  var pylonAnchorZ = 0;

  var crystalGeo = new THREE.ConeGeometry(1.6, 7, 5);
  var crystalMat = new THREE.MeshStandardMaterial({ color: 0x1a0a2e, emissive: 0x2a1050, emissiveIntensity: 0.4, roughness: 0.7, flatShading: true });
  var crystalCount = 24;
  var crystals = new THREE.InstancedMesh(crystalGeo, crystalMat, crystalCount);
  for (var ci = 0; ci < crystalCount; ci++) {
    var cside = ci % 2 === 0 ? -1 : 1;
    dummy.position.set(cside * (10 + (ci % 5) * 2.4), 2.2, - (ci * 11));
    dummy.rotation.set(0, ci, 0.15 * cside);
    dummy.updateMatrix();
    crystals.setMatrixAt(ci, dummy.matrix);
  }
  crystals.instanceMatrix.needsUpdate = true;
  scene.add(crystals);

  var ship = new THREE.Group();
  var hullMat = new THREE.MeshStandardMaterial({ color: 0xdff9ff, emissive: 0x00c8e0, emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.25 });
  var accentMat = new THREE.MeshStandardMaterial({ color: 0x091018, emissive: 0xff3d9a, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 });
  var hull = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.22, 1.15), hullMat);
  hull.position.y = 0;
  var nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 8), hullMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -0.78;
  var cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x9cf7ff, emissive: 0x4adfff, emissiveIntensity: 0.9, transparent: true, opacity: 0.95, roughness: 0.15, metalness: 0.2 })
  );
  cockpit.position.set(0, 0.16, -0.12);
  var wingL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.42), accentMat);
  wingL.position.set(-0.46, -0.02, 0.12);
  wingL.rotation.z = 0.22;
  var wingR = wingL.clone();
  wingR.position.x = 0.46;
  wingR.rotation.z = -0.22;
  var engine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.22, 10),
    new THREE.MeshBasicMaterial({ color: 0x9fffff })
  );
  engine.rotation.x = Math.PI / 2;
  engine.position.z = 0.62;
  var engineGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.45, depthWrite: false })
  );
  engineGlow.position.z = 0.72;
  ship.add(hull, nose, cockpit, wingL, wingR, engine, engineGlow);
  scene.add(ship);

  var shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  scene.add(shadow);

  var trailGeo = new THREE.BufferGeometry();
  var trailCount = 80;
  var trailPos = new Float32Array(trailCount * 3);
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  var trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
    color: 0x66ffff,
    size: 0.12,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  }));
  scene.add(trail);
  var trailHead = 0;

  function sharedOrbGlow() {
    return new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.28, depthWrite: false });
  }

  var orbGeo = new THREE.SphereGeometry(0.32, 16, 14);
  var orbGlowGeo = new THREE.SphereGeometry(0.55, 12, 10);
  var orbTypes = {
    cyan: {
      mat: new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.2 }),
      glow: new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.28, depthWrite: false }),
      value: 10
    },
    gold: {
      mat: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb000, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.25 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.3, depthWrite: false }),
      value: 25
    },
    magenta: {
      mat: new THREE.MeshStandardMaterial({ color: 0xff3d9a, emissive: 0xff3d9a, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.2 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xff3d9a, transparent: true, opacity: 0.28, depthWrite: false }),
      value: 15
    }
  };

  var orbs = [];
  var obstacles = [];

  var blockGeo = new THREE.BoxGeometry(1.5, 1.8, 1.2);
  var lowGeo = new THREE.BoxGeometry(1.7, 0.7, 1.0);
  var blockMat = new THREE.MeshStandardMaterial({ color: 0x14081c, emissive: 0x3a1030, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.45 });
  var edgeMat = new THREE.LineBasicMaterial({ color: 0xff4ea8 });
  var lowEdgeMat = new THREE.LineBasicMaterial({ color: 0x00f0ff });

  function makeObstacle(low) {
    var group = new THREE.Group();
    var mesh = new THREE.Mesh(low ? lowGeo : blockGeo, blockMat);
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(low ? lowGeo : blockGeo), low ? lowEdgeMat : edgeMat);
    group.add(mesh, edges);
    group.visible = false;
    group.userData = { active: false, low: !!low, lane: 1 };
    scene.add(group);
    return group;
  }

  function makeOrb() {
    var group = new THREE.Group();
    var core = new THREE.Mesh(orbGeo, orbTypes.cyan.mat);
    var glow = new THREE.Mesh(orbGlowGeo, orbTypes.cyan.glow);
    group.add(core, glow);
    group.visible = false;
    group.userData = { active: false, kind: "cyan", value: 10, lane: 1 };
    scene.add(group);
    return group;
  }

  for (var i = 0; i < 18; i++) obstacles.push(makeObstacle(i % 3 === 0));
  for (var j = 0; j < 20; j++) orbs.push(makeOrb());

  var spawnZ = -40;
  var lastPattern = -1;

  function resetPools() {
    for (var i = 0; i < obstacles.length; i++) {
      obstacles[i].visible = false;
      obstacles[i].userData.active = false;
    }
    for (var k = 0; k < orbs.length; k++) {
      orbs[k].visible = false;
      orbs[k].userData.active = false;
    }
    spawnZ = state.z - 40;
  }

  function getFree(list) {
    for (var i = 0; i < list.length; i++) {
      if (!list[i].userData.active) return list[i];
    }
    return null;
  }

  function placeObstacle(lane, z, low) {
    var obj = null;
    for (var i = 0; i < obstacles.length; i++) {
      if (!obstacles[i].userData.active && obstacles[i].userData.low === low) {
        obj = obstacles[i];
        break;
      }
    }
    if (!obj) obj = getFree(obstacles);
    if (!obj) return;
    obj.userData.active = true;
    obj.userData.low = low;
    obj.userData.lane = lane;
    obj.visible = true;
    obj.position.set(LANES[lane], low ? 0.4 : 0.95, z);
  }

  function placeOrb(lane, z, kind) {
    var obj = getFree(orbs);
    if (!obj) return;
    var t = orbTypes[kind] || orbTypes.cyan;
    obj.children[0].material = t.mat;
    obj.children[1].material = t.glow;
    obj.userData.active = true;
    obj.userData.kind = kind;
    obj.userData.value = t.value;
    obj.userData.lane = lane;
    obj.visible = true;
    obj.position.set(LANES[lane], 1.05, z);
  }

  function spawnAhead() {
    var horizon = state.z - 160;
    while (spawnZ > horizon) {
      spawnZ -= 14 + Math.random() * 6;
      if (state.mode !== "playing") {
        if (Math.random() < 0.5) placeOrb(Math.floor(Math.random() * 3), spawnZ, "cyan");
        continue;
      }
      var pattern = Math.floor(Math.random() * 6);
      if (pattern === lastPattern) pattern = (pattern + 1) % 6;
      lastPattern = pattern;
      var progress = Math.min(1, state.distance / 1800);
      if (pattern === 0) {
        var blocked = Math.floor(Math.random() * 3);
        placeObstacle(blocked, spawnZ, false);
        for (var l = 0; l < 3; l++) if (l !== blocked) placeOrb(l, spawnZ, Math.random() < 0.2 ? "gold" : "cyan");
      } else if (pattern === 1) {
        placeObstacle(0, spawnZ, false);
        placeObstacle(2, spawnZ, false);
        placeOrb(1, spawnZ - 2, "gold");
      } else if (pattern === 2) {
        placeObstacle(1, spawnZ, true);
        placeOrb(1, spawnZ, "magenta");
        placeOrb(0, spawnZ - 5, "cyan");
        placeOrb(2, spawnZ - 5, "cyan");
      } else if (pattern === 3) {
        var side = Math.random() < 0.5 ? 0 : 2;
        placeObstacle(side, spawnZ, false);
        placeObstacle(1, spawnZ, progress > 0.35 && Math.random() < 0.45);
        placeOrb(side === 0 ? 2 : 0, spawnZ, "cyan");
      } else if (pattern === 4) {
        placeOrb(0, spawnZ, "cyan");
        placeOrb(1, spawnZ - 3, Math.random() < 0.3 ? "gold" : "magenta");
        placeOrb(2, spawnZ - 6, "cyan");
        if (progress > 0.2) placeObstacle(Math.floor(Math.random() * 3), spawnZ - 10, Math.random() < 0.5);
      } else {
        var keep = Math.floor(Math.random() * 3);
        for (var n = 0; n < 3; n++) {
          if (n === keep) placeOrb(n, spawnZ, "gold");
          else placeObstacle(n, spawnZ, Math.random() < 0.35);
        }
      }
    }
  }

  function recyclePassed() {
    var behind = state.z + 12;
    for (var i = 0; i < obstacles.length; i++) {
      if (obstacles[i].userData.active && obstacles[i].position.z > behind) {
        obstacles[i].userData.active = false;
        obstacles[i].visible = false;
      }
    }
    for (var k = 0; k < orbs.length; k++) {
      if (orbs[k].userData.active && orbs[k].position.z > behind) {
        orbs[k].userData.active = false;
        orbs[k].visible = false;
      }
    }
  }

  function updateWorldTrack() {
    var mid = state.z - (SEGMENT_LEN * SEGMENT_COUNT) / 2 + 20;
    road.position.set(0, 0, mid);
    railL.position.z = mid;
    railR.position.z = mid;
    roadTex.offset.y = (state.z * 0.08) % 1;

    if (state.z - pylonAnchorZ < -14) {
      pylonAnchorZ -= 14;
      var base = pylonAnchorZ;
      for (var pi = 0; pi < pylonCount; pi++) {
        var side = pi % 2 === 0 ? -1 : 1;
        dummy.position.set(side * 5.3, 2.6, base - Math.floor(pi / 2) * 14);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        pylons.setMatrixAt(pi, dummy.matrix);
      }
      pylons.instanceMatrix.needsUpdate = true;
      for (var ci = 0; ci < crystalCount; ci++) {
        var cside = ci % 2 === 0 ? -1 : 1;
        dummy.position.set(cside * (10 + (ci % 5) * 2.4), 2.2, base - ci * 11);
        dummy.rotation.set(0, ci, 0.15 * cside);
        dummy.updateMatrix();
        crystals.setMatrixAt(ci, dummy.matrix);
      }
      crystals.instanceMatrix.needsUpdate = true;
    }
  }

  function ensureAudio() {
    if (audioCtx) {
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur, type, vol, slide) {
    try {
      var ctx = ensureAudio();
      if (!ctx) return;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.07, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch (err) {}
  }

  function setMode(mode) {
    state.mode = mode;
    var playing = mode === "playing";
    hud.hidden = !playing;
    controls.hidden = !playing;
    overlay.hidden = playing;
    titleScreen.hidden = mode !== "title";
    gameoverScreen.hidden = mode !== "gameover";
  }

  function resetRun() {
    state.lane = 1;
    state.x = 0;
    state.y = 0.62;
    state.z = 0;
    state.vy = 0;
    state.onGround = true;
    state.speed = START_SPEED;
    state.score = 0;
    state.distance = 0;
    state.shake = 0;
    state.combo = 0;
    pylonAnchorZ = 0;
    lastPattern = -1;
    resetPools();
    scoreEl.textContent = "0";
    spawnAhead();
    updateWorldTrack();
  }

  function startGame() {
    ensureAudio();
    tone(220, 0.28, "sawtooth", 0.05, 660);
    resetRun();
    setMode("playing");
  }

  function gameOver() {
    if (state.mode !== "playing") return;
    state.shake = 0.7;
    tone(180, 0.4, "square", 0.08, 60);
    var score = Math.floor(state.score);
    var isBest = score > best;
    if (isBest) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      bestEl.textContent = String(best);
    }
    finalScoreEl.textContent = String(score);
    newBestEl.hidden = !isBest;
    setMode("gameover");
  }

  function changeLane(dir) {
    if (state.mode !== "playing") return;
    var next = state.lane + dir;
    if (next < 0 || next > 2) return;
    state.lane = next;
    tone(420, 0.06, "triangle", 0.03);
  }

  function jump() {
    if (state.mode !== "playing" || !state.onGround) return;
    state.onGround = false;
    state.vy = 8.6;
    tone(520, 0.12, "sine", 0.04, 280);
  }

  function collect(orb) {
    orb.userData.active = false;
    orb.visible = false;
    state.combo += 1;
    var bonus = orb.userData.value + Math.min(20, state.combo);
    state.score += bonus;
    scoreEl.textContent = String(Math.floor(state.score));
    var f = orb.userData.kind === "gold" ? 880 : orb.userData.kind === "magenta" ? 720 : 640;
    tone(f, 0.1, "sine", 0.06, f * 1.4);
  }

  function collide() {
    if (state.mode !== "playing") return;
    var px = state.x;
    var py = state.y;
    var pz = state.z;
    for (var i = 0; i < orbs.length; i++) {
      var o = orbs[i];
      if (!o.userData.active) continue;
      var dz = o.position.z - pz;
      if (dz > 1.2 || dz < -1.2) continue;
      var dx = o.position.x - px;
      var dy = o.position.y - py;
      if (dx * dx + dy * dy < 0.85) collect(o);
    }
    for (var k = 0; k < obstacles.length; k++) {
      var b = obstacles[k];
      if (!b.userData.active) continue;
      var bz = b.position.z - pz;
      if (bz > 1.05 || bz < -0.9) continue;
      if (Math.abs(b.position.x - px) > 1.05) continue;
      if (b.userData.low && py > 1.25) continue;
      gameOver();
      return;
    }
  }

  function onPointerDown(e) {
    if (e.cancelable) e.preventDefault();
    var t = e.changedTouches ? e.changedTouches[0] : e;
    touchStart = { x: t.clientX, y: t.clientY, t: performance.now(), id: t.identifier };
  }

  function onPointerUp(e) {
    if (e.cancelable) e.preventDefault();
    if (!touchStart) return;
    var t = null;
    if (e.changedTouches) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchStart.id || touchStart.id == null) {
          t = e.changedTouches[i];
          break;
        }
      }
      if (!t) t = e.changedTouches[0];
    } else {
      t = e;
    }
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    touchStart = null;
    if (state.mode !== "playing") return;
    if (e.target && e.target.closest && e.target.closest("#controls")) return;
    var ax = Math.abs(dx);
    var ay = Math.abs(dy);
    if (ax < 24 && ay < 24) return;
    if (ay > ax && dy < -28) jump();
    else if (ax >= ay && ax > 28) changeLane(dx < 0 ? -1 : 1);
  }

  function bindHold(btn, fn) {
    var held = false;
    function start(e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (held) return;
      held = true;
      fn();
    }
    function end(e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      held = false;
    }
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    btn.addEventListener("pointerleave", end);
  }

  bindHold(document.getElementById("btn-left"), function () { changeLane(-1); });
  bindHold(document.getElementById("btn-right"), function () { changeLane(1); });
  bindHold(document.getElementById("btn-jump"), jump);

  document.getElementById("btn-play").addEventListener("click", function (e) {
    e.preventDefault();
    startGame();
  });
  document.getElementById("btn-retry").addEventListener("click", function (e) {
    e.preventDefault();
    startGame();
  });

  window.addEventListener("keydown", function (e) {
    if (e.repeat) {
      keys[e.code] = true;
      return;
    }
    keys[e.code] = true;
    if (e.code === "ArrowLeft" || e.code === "KeyA") changeLane(-1);
    if (e.code === "ArrowRight" || e.code === "KeyD") changeLane(1);
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (state.mode === "title" || state.mode === "gameover") startGame();
      else jump();
    }
    if ((e.code === "Enter" || e.code === "KeyP") && state.mode !== "playing") startGame();
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });

  var root = document.getElementById("game-root");
  root.addEventListener("touchstart", onPointerDown, { passive: false });
  root.addEventListener("touchend", onPointerUp, { passive: false });
  root.addEventListener("touchcancel", function () { touchStart = null; }, { passive: true });

  ["touchmove", "gesturestart", "gesturechange", "gestureend"].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
  });
  document.addEventListener("dblclick", function (e) { e.preventDefault(); }, { passive: false });

  var clock = new THREE.Clock();

  function update(dt) {
    state.time += dt;
    var playing = state.mode === "playing";
    var cruise = state.mode === "title" || state.mode === "gameover";
    var targetSpeed = playing ? Math.min(MAX_SPEED, START_SPEED + state.distance * 0.018) : 12;
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 2.5);
    state.z -= state.speed * dt;
    if (playing) {
      state.distance += state.speed * dt;
      state.score += state.speed * dt * 0.35;
      scoreEl.textContent = String(Math.floor(state.score));
    }

    var targetX = LANES[state.lane];
    state.x += (targetX - state.x) * Math.min(1, dt * 12);

    if (playing) {
      if (!state.onGround) {
        state.vy -= 22 * dt;
        state.y += state.vy * dt;
        if (state.y <= 0.62) {
          state.y = 0.62;
          state.vy = 0;
          state.onGround = true;
        }
      }
    } else {
      state.y = 0.62 + Math.sin(state.time * 2.2) * 0.06;
      state.onGround = true;
      state.vy = 0;
    }

    ship.position.set(state.x, state.y, state.z);
    ship.rotation.z = THREE.MathUtils.lerp(ship.rotation.z, (targetX - state.x) * 0.18, Math.min(1, dt * 8));
    ship.rotation.x = THREE.MathUtils.lerp(ship.rotation.x, state.onGround ? 0 : -0.25, Math.min(1, dt * 6));
    engineGlow.scale.setScalar(1 + Math.sin(state.time * 18) * 0.12 + state.speed / 200);

    shadow.position.set(state.x, 0.03, state.z);
    var s = Math.max(0.25, 0.55 - (state.y - 0.62) * 0.18);
    shadow.scale.set(s, s, 1);
    shadow.material.opacity = 0.38 * s;

    trailPos[trailHead * 3] = state.x + (Math.random() - 0.5) * 0.08;
    trailPos[trailHead * 3 + 1] = state.y;
    trailPos[trailHead * 3 + 2] = state.z + 0.75;
    trailHead = (trailHead + 1) % trailCount;
    trailGeo.attributes.position.needsUpdate = true;

    for (var i = 0; i < orbs.length; i++) {
      if (!orbs[i].userData.active) continue;
      orbs[i].position.y = 1.05 + Math.sin(state.time * 3 + orbs[i].position.z) * 0.16;
      orbs[i].rotation.y += dt * 2.4;
    }

    spawnAhead();
    recyclePassed();
    updateWorldTrack();
    if (playing) collide();

    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
    var sx = (Math.random() - 0.5) * state.shake;
    var sy = (Math.random() - 0.5) * state.shake;
    camera.position.x = state.x * 0.55 + sx;
    camera.position.y = 3.15 + sy + (playing ? 0 : 0.35);
    camera.position.z = state.z + 7.4;
    camera.lookAt(state.x * 0.7, 0.9, state.z - 8);
    void cruise;
  }

  var jsErrors = [];
  window.addEventListener("error", function (e) {
    jsErrors.push(String(e.message || e));
  });

  function loop() {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, clock.getDelta());
    update(dt);
    renderer.render(scene, camera);
  }

  resetRun();
  setMode("title");
  loop();
})();
