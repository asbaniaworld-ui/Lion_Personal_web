import * as THREE from "three";

/**
 * Right-column gallery: fixed magazine camera, 16:9 photo planes on a Z-depth strip; wheel-only scroll (no drag-to-scroll).
 * Hover: ray on a photo (yaw only toward camera). Click to open: front card, fully in frame. No stack/peek or hover pull-out.
 * Scroll uses a smoothed follower so motion eases—photos drift away and the next one eases in.
 * Idle: fixed STRIP_IDLE_YAW (no per-frame billboard). Hover only on pointer ray hit: lerp to face camera.
 * Auto-scroll when pointer is outside #photoCorridor3dRoot; pause anywhere over the gallery column (canvas + chrome); resume on leave.
 * Wheel: listener on root (bubble) so hint/progress strip works too. Only #photoCorridor3dRoot 子树会触发，不会全局锁死网页滚轮。
 * preventDefault 仅在驱动条带时调用：灯箱动画/展开中不拦截，避免误伤整页纵向滚动。
 */

const PHOTO_URLS = [
  "./images/微信图片_20260326184253_1188_681.jpg",
  "./images/微信图片_20260326184254_1189_681.jpg",
  "./images/微信图片_20260326184256_1190_681.jpg",
  "./images/微信图片_20260326184256_1191_681.jpg",
  "./images/微信图片_20260326184257_1192_681.jpg",
  "./images/微信图片_20260326184300_1193_681.jpg",
  "./images/微信图片_20260326184303_1194_681.jpg",
  "./images/微信图片_20260326184304_1195_681.jpg",
  "./images/微信图片_20260326184307_1196_681.jpg",
  "./images/微信图片_20260326184308_1197_681.jpg",
  "./images/微信图片_20260326184310_1198_681.jpg",
  "./images/微信图片_20260326184314_1200_681.jpg",
  "./images/微信图片_20260326184315_1201_681.jpg",
  "./images/微信图片_20260326184318_1202_681.jpg",
  "./images/微信图片_20260326184320_1203_681.jpg",
  "./images/微信图片_20260326184322_1204_681.jpg",
  "./images/微信图片_20260326184326_1205_681.jpg",
  "./images/微信图片_20260326184326_1206_681.jpg",
  "./images/微信图片_20260326184328_1207_681.jpg",
];

/** 去掉末尾与首张重复的 URL，避免 `i % N` 滚动接缝处出现连续同一张图。 */
const N_PHOTOS = PHOTO_URLS.length;
/** Landscape 16:9 planes (world X × Y); slightly larger for readability. */
const CARD_W = 1.72;
const CARD_H = (CARD_W * 9) / 16;
/** Spacing along Z (depth); scroll only offsets Z. */
const SPACING = 3.45;
const STRIP_COUNT = 64;

/** 廊道中心 X；偶数/奇数槽左右交替排布。 */
const STRIP_X_CENTER = 5.0;
const STRIP_X_ALTERNATE = 0.34;

/** Lift strip slightly so perspective doesn’t eat the bottom of the frame. */
const STRIP_Y = 0.12;

const CAMERA_POS = new THREE.Vector3(5, 0.06, 19.2);
const LOOK_AT = new THREE.Vector3(5, 0.06, 0);
const FOV = 32;

/** 整条画廊共用的静止偏角（弧度）；仅悬停在照片上时才过渡到面向用户。 */
const IDLE_YAW_TILT = -0.14;
/** 自动轮播速度。仅当指针不在 canvas 且无 lightbox 时生效。 */
const AUTO_PLAY_SCROLL_PER_SEC = 0.38;
/** 悬停时：仅朝向 blend 时长（秒）；从 STRIP_IDLE_YAW 过渡到正对相机。 */
const HOVER_TWEEN_SEC = 0.58;

const OPEN_MS = 880;
const CLOSE_MS = 780;

/** NDC inset so “fully in frame” allows a thin safe margin. */
const VIEW_NDC_MARGIN = 0.042;
/** scroll 跟随 scrollTarget 的响应速度（越大越跟手）。 */
const SCROLL_SMOOTH_LAMBDA = 10.0;
/** Momentum on logical scroll target (decays each frame). */
const SCROLL_TARGET_VEL_DAMP = 0.96;
/** Wheel 模型系数（规格 0.01）+ 0.005 = 每刻度注入 0.015 × deltaY。 */
const WHEEL_TARGET_VEL = 0.01;
const WHEEL_DELTA_EXTRA = 0.005;
/** Integrates target velocity into scrollTarget. */
const SCROLL_TARGET_INTEGRATE = 9;

const _halfCardW = CARD_W * 0.5;
const _halfCardH = CARD_H * 0.5;
const PLANE_CORNERS = [
  new THREE.Vector3(-_halfCardW, -_halfCardH, 0),
  new THREE.Vector3(_halfCardW, -_halfCardH, 0),
  new THREE.Vector3(_halfCardW, _halfCardH, 0),
  new THREE.Vector3(-_halfCardW, _halfCardH, 0),
];

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function rootVisible(root) {
  const r = root.getBoundingClientRect();
  return r.bottom > 32 && r.top < window.innerHeight - 32 && r.right > 0 && r.left < window.innerWidth;
}

/** 节流 getBoundingClientRect，避免每帧触发布局计算导致滚动卡顿。 */
function createVisibilityThrottle(rootEl) {
  let lastT = 0;
  let lastOk = true;
  return {
    check(now) {
      if (now - lastT < 100) return lastOk;
      lastT = now;
      lastOk = rootVisible(rootEl);
      return lastOk;
    },
    invalidate() {
      lastT = 0;
    },
  };
}

function distanceForBillboardHeight(camera, worldHeight, viewFraction) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  return worldHeight / (viewFraction * 2 * Math.tan(vFov / 2));
}

function rayFromGalleryCenter(_canvas, camera) {
  const v = new THREE.Vector3(0, 0, 0.5);
  v.unproject(camera);
  return v.sub(camera.position).normalize();
}

function billboardYaw(meshPos, camPos) {
  const dx = camPos.x - meshPos.x;
  const dz = camPos.z - meshPos.z;
  return Math.atan2(dx, dz);
}

/** 播放/滚动时共用：固定廊道朝向 + 倾角（不对单张做 billboard）；仅悬停时用 hoverFacingYaw 转正。 */
const STRIP_IDLE_YAW =
  billboardYaw(new THREE.Vector3(STRIP_X_CENTER, STRIP_Y, 0), CAMERA_POS) + IDLE_YAW_TILT;

function getGsap() {
  return typeof window !== "undefined" ? window.gsap : undefined;
}

/**
 * 周期为 totalLen 时，从 from 指向 to 的最短有向差（用于跟手 lerping，避免对 scroll / scrollTarget 分别 wrap 后半周期错位导致巨幅跳变/倒带）。
 */
function shortestPeriodDelta(from, to, period) {
  let d = to - from;
  d -= Math.round(d / period) * period;
  return d;
}

/**
 * True if the mesh’s current world quad (after stack presentation / hover) lies fully inside NDC with margin.
 */
function isMeshFullyInView(mesh, camera, tmp) {
  const { v } = tmp;
  mesh.updateMatrixWorld(true);
  const m = VIEW_NDC_MARGIN;
  for (let i = 0; i < 4; i++) {
    v.copy(PLANE_CORNERS[i]).applyMatrix4(mesh.matrixWorld).project(camera);
    if (v.z < -1 || v.z > 1) return false;
    if (v.x < -1 + m || v.x > 1 - m || v.y < -1 + m || v.y > 1 - m) return false;
  }
  return true;
}

export function initPhotoCorridor3d() {
  const canvas = document.getElementById("photoCorridor3dCanvas");
  const root = document.getElementById("photoCorridor3dRoot");
  const progressFill = root?.querySelector(".photo-corridor-3d__progress-fill");
  if (!canvas || !root) {
    window.__photoCorridor3dLoadProgress = 1;
    window.__photoCorridor3dTexturesPromise = Promise.resolve();
    window.__photoCorridor3dRendererWarmup = () => Promise.resolve();
    return;
  }

  let backdropEl = document.getElementById("corridor3dLbBackdrop");
  if (!backdropEl) {
    backdropEl = document.createElement("div");
    backdropEl.id = "corridor3dLbBackdrop";
    backdropEl.className = "corridor3d-lightbox-backdrop";
    backdropEl.setAttribute("aria-hidden", "true");
  }
  if (backdropEl.parentElement !== root) {
    root.insertBefore(backdropEl, root.firstChild);
  }

  /** @type {null | { mesh: THREE.Mesh; phase: string; t0: number; duration: number; fromPos: THREE.Vector3; toPos: THREE.Vector3; fromQuat: THREE.Quaternion; toQuat: THREE.Quaternion; fromScale: THREE.Vector3; toScale: THREE.Vector3; restPos: THREE.Vector3; restQuat: THREE.Quaternion; restScale: THREE.Vector3; }} */
  let lb = null;

  function setBackdropAlpha(a, pointer) {
    backdropEl.style.opacity = String(a);
    backdropEl.style.pointerEvents = pointer ? "auto" : "none";
    backdropEl.setAttribute("aria-hidden", a < 0.05 ? "true" : "false");
    if (a < 0.05) root.classList.remove("is-lightbox");
    else root.classList.add("is-lightbox");
  }

  backdropEl.addEventListener("click", () => {
    if (lb?.phase === "open") startClose();
  });

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.08, 220);
  camera.position.copy(CAMERA_POS);
  camera.lookAt(LOOK_AT);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    /* MSAA + 高 DPR 在集显上会把单帧 GPU 拖到数百 ms，主线程 rAF 报 Violation。 */
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  /** 照片条均为不透明深度写入，无需每帧对透明队列排序。 */
  renderer.sortObjects = false;

  /* MeshBasicMaterial 不读灯光；去掉光源减轻场景遍历与部分驱动路径开销。 */
  const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
  const loader = new THREE.TextureLoader();
  const meshes = [];

  /** Reported to the welcome-screen loader: 0…1 while textures fetch/decode. */
  let corridorTexturesDone = 0;
  function bumpCorridorLoadProgress() {
    corridorTexturesDone = Math.min(STRIP_COUNT, corridorTexturesDone + 1);
    window.__photoCorridor3dLoadProgress = corridorTexturesDone / STRIP_COUNT;
  }

  const corridorTexturePromises = [];

  for (let i = 0; i < STRIP_COUNT; i++) {
    /** Basic：无光照方程，64 面片时比 Lambert/Standard 省大量片元；JPG 勿开 transparent。 */
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.texIndex = i % N_PHOTOS;
    mesh.userData.url = PHOTO_URLS[mesh.userData.texIndex];
    scene.add(mesh);
    meshes.push(mesh);

    corridorTexturePromises.push(
      new Promise((resolve) => {
        loader.load(
          mesh.userData.url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
            mat.map = tex;
            mat.needsUpdate = true;
            bumpCorridorLoadProgress();
            resolve();
          },
          undefined,
          () => {
            mat.color.setHex(0xe4e0d8);
            bumpCorridorLoadProgress();
            resolve();
          }
        );
      })
    );
  }

  window.__photoCorridor3dLoadProgress = 0;
  window.__photoCorridor3dTexturesPromise = Promise.all(corridorTexturePromises);

  /** Pre-compile shaders + wait paint so the first in-view frame after Enter is smooth. */
  window.__photoCorridor3dRendererWarmup = () =>
    new Promise((resolve) => {
      try {
        renderer.compile(scene, camera);
      } catch {
        /* ignore */
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let scroll = 0;
  /** Logical scroll; `scroll` eases toward this for slower, readable transitions. */
  let scrollTarget = 0;
  let scrollTargetVel = 0;

  /** 指针在整条右侧画廊栏内（canvas + 下方提示/进度，不含栏外）：暂停自动轮播。 */
  let isPointerOverGallery = false;

  const totalLen = STRIP_COUNT * SPACING;
  const halfLen = totalLen * 0.5;

  const inViewTmp = {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    sc: new THREE.Vector3(1, 1, 1),
    euler: new THREE.Euler(0, 0, 0, "YXZ"),
    mat: new THREE.Matrix4(),
    v: new THREE.Vector3(),
  };

  const tmpRankPos = new THREE.Vector3();
  const galleryVis = createVisibilityThrottle(root);

  /**
   * 仅悬停：从固定廊道朝向 STRIP_IDLE_YAW 过渡到该片 billboardYaw（仅由 pointermove 调度 raycaster，滚轮不触发射线以省开销）。
   */
  function hoverFacingYaw(mesh, blend) {
    const b = THREE.MathUtils.clamp(blend, 0, 1);
    const faceY = billboardYaw(mesh.position, camera.position);
    return THREE.MathUtils.lerpAngles(STRIP_IDLE_YAW, faceY, b);
  }

  function getClosestStripMesh() {
    let best = null;
    let bestD2 = Infinity;
    for (const m of meshes) {
      if (lb && m === lb.mesh) continue;
      if (m.userData.baseX == null) continue;
      tmpRankPos.set(m.userData.baseX, STRIP_Y, m.position.z);
      const d2 = tmpRankPos.distanceToSquared(camera.position);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = m;
      }
    }
    return best;
  }

  /** @type {THREE.Mesh | null} */
  let hoveredMesh = null;

  function stripFrozen() {
    return lb != null;
  }

  function killMeshMotionTweens(mesh) {
    const g = getGsap();
    if (!g || !mesh) return;
    if (mesh.userData._hoverLeaveTl) {
      mesh.userData._hoverLeaveTl.kill();
      mesh.userData._hoverLeaveTl = null;
    }
    g.killTweensOf(mesh.position);
    g.killTweensOf(mesh.rotation);
    g.killTweensOf(mesh.scale);
    g.killTweensOf(mesh.userData);
  }

  function snapMeshToStripRest(mesh) {
    if (mesh == null || mesh.userData.baseX == null) return;
    mesh.userData.hoverAnimating = false;
    mesh.userData.hoverBlend = 0;
    mesh.position.x = mesh.userData.baseX;
    mesh.position.y = STRIP_Y;
    mesh.scale.setScalar(1);
    mesh.rotation.set(0, STRIP_IDLE_YAW, 0);
  }

  function applyHoverRotationForMesh(mesh) {
    const b = THREE.MathUtils.clamp(mesh.userData.hoverBlend ?? 0, 0, 1);
    mesh.rotation.set(0, hoverFacingYaw(mesh, b), 0);
  }

  /**
   * One-time strip layout: 偶/奇槽左右交替 baseX，Z 随 scroll 循环。
   */
  function layoutStrip() {
    for (let i = 0; i < STRIP_COUNT; i++) {
      const mesh = meshes[i];
      if (lb && mesh === lb.mesh) continue;

      mesh.userData.stripIndex = i;
      const baseX = STRIP_X_CENTER + (i % 2 === 0 ? -STRIP_X_ALTERNATE : STRIP_X_ALTERNATE);
      mesh.userData.baseX = baseX;
      mesh.position.x = baseX;
      mesh.position.y = STRIP_Y;

      let z = i * SPACING - scroll;
      z = THREE.MathUtils.euclideanModulo(z + halfLen, totalLen) - halfLen;
      mesh.position.z = z;

      mesh.rotation.set(0, STRIP_IDLE_YAW, 0);
      mesh.scale.setScalar(1);
    }
  }

  /** Used each frame: only Z follows scroll (no X/Y/scale/rotation recompute). */
  function applyScrollZOnly() {
    for (let i = 0; i < STRIP_COUNT; i++) {
      const mesh = meshes[i];
      if (lb && mesh === lb.mesh) continue;

      let z = i * SPACING - scroll;
      z = THREE.MathUtils.euclideanModulo(z + halfLen, totalLen) - halfLen;
      mesh.position.z = z;
    }
  }

  function setHoveredMesh(hit) {
    const g = getGsap();
    if (stripFrozen()) return;

    const next = hit && meshes.includes(/** @type {THREE.Mesh} */ (hit)) ? hit : null;

    if (next === hoveredMesh) return;

    if (hoveredMesh && hoveredMesh !== next) {
      const prev = hoveredMesh;
      killMeshMotionTweens(prev);
      if (g) {
        prev.userData.hoverAnimating = true;
        const tl = g.timeline({
          onComplete: () => {
            prev.userData._hoverLeaveTl = null;
            snapMeshToStripRest(prev);
          },
        });
        prev.userData._hoverLeaveTl = tl;
        tl.to(prev.userData, {
          hoverBlend: 0,
          duration: HOVER_TWEEN_SEC,
          ease: "sine.inOut",
        });
      } else {
        snapMeshToStripRest(prev);
      }
    }

    hoveredMesh = next;

    if (hoveredMesh && g) {
      hoveredMesh.userData.hoverBlend = 0;
      g.to(hoveredMesh.userData, {
        hoverBlend: 1,
        duration: HOVER_TWEEN_SEC,
        ease: "sine.inOut",
      });
    } else if (hoveredMesh && !g) {
      hoveredMesh.userData.hoverBlend = 1;
      applyHoverRotationForMesh(hoveredMesh);
    }
  }

  function clearHover() {
    setHoveredMesh(null);
  }

  /** Hover：射线命中某一照片平面即视为悬停（仅此时过渡到面向用户）。 */
  function updateHoverAtPointer(ndcX, ndcY) {
    if (stripFrozen()) return;
    pointer.set(ndcX, ndcY);
    raycaster.setFromCamera(pointer, camera);
    const ptrHit = raycaster.intersectObjects(meshes, false)[0];
    const ptrMesh = ptrHit?.object ?? null;
    const ok = ptrMesh && meshes.includes(/** @type {THREE.Mesh} */ (ptrMesh));
    setHoveredMesh(ok ? /** @type {THREE.Mesh} */ (ptrMesh) : null);
  }

  let lastProgressP = -1;
  function updateProgress() {
    if (!progressFill || stripFrozen()) return;
    const p = THREE.MathUtils.euclideanModulo(scroll, totalLen) / totalLen;
    if (Math.abs(p - lastProgressP) < 0.0015) return;
    lastProgressP = p;
    progressFill.style.transform = `scaleX(${p})`;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    camera.position.copy(CAMERA_POS);
    camera.lookAt(LOOK_AT);
    galleryVis.invalidate();
    lastProgressP = -1;
  }

  function startOpen(mesh) {
    if (lb || !mesh) return;

    killMeshMotionTweens(mesh);
    /** 避免 clearHover 对当前张做「离开」动画；先记下姿态再清悬停，防止先 snap 成静止角再放大造成卡顿。 */
    const restPos = mesh.position.clone();
    const restQuat = mesh.quaternion.clone();
    const restScale = mesh.scale.clone();

    if (hoveredMesh === mesh) {
      hoveredMesh = null;
    } else {
      clearHover();
    }

    applyScrollZOnly();
    scrollTargetVel = 0;
    scrollTarget = scroll;

    const dir = rayFromGalleryCenter(canvas, camera);
    const H = CARD_H * restScale.x;
    const dist = distanceForBillboardHeight(camera, H, 0.8);
    const toPos = camera.position.clone().addScaledVector(dir, dist);

    const toScale = restScale.clone();

    lb = {
      mesh,
      phase: "opening",
      t0: performance.now(),
      duration: OPEN_MS,
      fromPos: restPos.clone(),
      toPos,
      fromQuat: restQuat.clone(),
      /** 大图展开不做额外「翻正」，保持点击瞬间朝向。 */
      toQuat: restQuat.clone(),
      fromScale: restScale.clone(),
      toScale,
      restPos,
      restQuat,
      restScale,
    };

    setBackdropAlpha(0, false);
  }

  function startClose() {
    if (!lb || lb.phase !== "open") return;
    const { mesh, restPos, restQuat, restScale } = lb;
    lb = {
      mesh,
      phase: "closing",
      t0: performance.now(),
      duration: CLOSE_MS,
      fromPos: mesh.position.clone(),
      toPos: restPos.clone(),
      fromQuat: mesh.quaternion.clone(),
      toQuat: restQuat.clone(),
      fromScale: mesh.scale.clone(),
      toScale: restScale.clone(),
      restPos,
      restQuat,
      restScale,
    };
  }

  function stepLightbox(now) {
    if (!lb) return;

    const t = Math.min(1, (now - lb.t0) / lb.duration);
    const e = easeInOutCubic(t);
    const m = lb.mesh;

    if (lb.phase === "opening") {
      m.position.lerpVectors(lb.fromPos, lb.toPos, e);
      THREE.Quaternion.slerpQuaternions(lb.fromQuat, lb.toQuat, e, m.quaternion);
      const sc = THREE.MathUtils.lerp(lb.fromScale.x, lb.toScale.x, e);
      m.scale.setScalar(sc);
      setBackdropAlpha(0.78 * e, e > 0.12);

      if (t >= 1) {
        lb.phase = "open";
        m.position.copy(lb.toPos);
        m.quaternion.copy(lb.toQuat);
        m.scale.copy(lb.toScale);
        setBackdropAlpha(0.78, true);
      }
    } else if (lb.phase === "closing") {
      m.position.lerpVectors(lb.fromPos, lb.toPos, e);
      THREE.Quaternion.slerpQuaternions(lb.fromQuat, lb.toQuat, e, m.quaternion);
      const sc = THREE.MathUtils.lerp(lb.fromScale.x, lb.toScale.x, e);
      m.scale.setScalar(sc);
      setBackdropAlpha(0.78 * (1 - e), (1 - e) > 0.12);

      if (t >= 1) {
        m.position.copy(lb.restPos);
        m.quaternion.copy(lb.restQuat);
        m.scale.copy(lb.restScale);
        setBackdropAlpha(0, false);
        lb = null;
      }
    }
  }

  resize();
  layoutStrip();
  updateProgress();

  const ro = new ResizeObserver(resize);
  ro.observe(root);

  function wheelDeltaToPixels(e) {
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= Math.max(320, root.clientHeight || 480);
    return dy;
  }

  function onGalleryWheel(e) {
    if (stripFrozen()) return;

    e.preventDefault();
    e.stopPropagation();
    scrollTargetVel += wheelDeltaToPixels(e) * (WHEEL_TARGET_VEL + WHEEL_DELTA_EXTRA);
  }

  const wheelOpts = { passive: false, capture: true };
  root.addEventListener("wheel", onGalleryWheel, wheelOpts);
  canvas.addEventListener("wheel", onGalleryWheel, wheelOpts);

  let capId = null;
  let ptrDownX = 0;
  let ptrDownY = 0;
  let ptrLastX = 0;
  let ptrLastY = 0;
  let ptrDownT = 0;
  let ptrDragAcc = 0;

  root.addEventListener("pointerenter", () => {
    isPointerOverGallery = true;
  });
  root.addEventListener("pointerleave", () => {
    isPointerOverGallery = false;
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (!rootVisible(root) || e.button !== 0) return;
    if (lb?.phase === "opening" || lb?.phase === "closing") return;
    capId = e.pointerId;
    canvas.setPointerCapture(capId);
    ptrDownX = e.clientX;
    ptrDownY = e.clientY;
    ptrLastX = e.clientX;
    ptrLastY = e.clientY;
    ptrDownT = performance.now();
    ptrDragAcc = 0;
    /** 不在按下时 clearHover，否则离开动画/ snap 会在点击放大前打断悬停姿态。 */
  });

  let hoverPickRaf = 0;
  /** @type {{ x: number; y: number } | null} */
  let pendingPickNdc = null;

  function scheduleHoverPick(ndcX, ndcY) {
    pendingPickNdc = { x: ndcX, y: ndcY };
    if (hoverPickRaf) return;
    hoverPickRaf = requestAnimationFrame(() => {
      hoverPickRaf = 0;
      const p = pendingPickNdc;
      pendingPickNdc = null;
      if (!p || stripFrozen()) return;
      updateHoverAtPointer(p.x, p.y);
    });
  }

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();

    if (!rootVisible(root)) return;

    if (capId != null && e.pointerId === capId) {
      const dx = e.clientX - ptrLastX;
      const dy = e.clientY - ptrLastY;
      ptrLastX = e.clientX;
      ptrLastY = e.clientY;
      ptrDragAcc += Math.abs(dx) + Math.abs(dy);
      return;
    }

    if (stripFrozen()) return;

    const ndcX = ((e.clientX - r.left) / Math.max(1e-6, r.width)) * 2 - 1;
    const ndcY = -((e.clientY - r.top) / Math.max(1e-6, r.height)) * 2 + 1;
    scheduleHoverPick(ndcX, ndcY);
  });

  canvas.addEventListener("pointerup", (e) => {
    if (capId == null || e.pointerId !== capId) return;
    try {
      canvas.releasePointerCapture(capId);
    } catch {
      /* ignore */
    }
    capId = null;

    if (lb?.phase === "open") {
      const r = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(lb.mesh, false);
      if (hits.length > 0) startClose();
      return;
    }

    if (lb) return;

    const dt = performance.now() - ptrDownT;
    const moved = Math.hypot(e.clientX - ptrDownX, e.clientY - ptrDownY);
    if (ptrDragAcc > 14 || moved > 14 || dt > 650) return;

    const r = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ndcY = -((e.clientY - r.top) / r.height) * 2 + 1;
    pointer.set(ndcX, ndcY);
    raycaster.setFromCamera(pointer, camera);
    const ptrHit = raycaster.intersectObjects(meshes, false)[0];
    const ptrMesh = ptrHit?.object;
    if (!ptrMesh) return;
    const front = getClosestStripMesh();
    if (ptrMesh !== front) return;
    if (!isMeshFullyInView(/** @type {THREE.Mesh} */ (ptrMesh), camera, inViewTmp)) return;
    startOpen(/** @type {THREE.Mesh} */ (ptrMesh));
  });

  function resetCanvasPointerGestureState() {
    if (capId != null) {
      try {
        canvas.releasePointerCapture(capId);
      } catch {
        /* ignore */
      }
    }
    capId = null;
    ptrDownX = 0;
    ptrDownY = 0;
    ptrLastX = 0;
    ptrLastY = 0;
    ptrDownT = 0;
    ptrDragAcc = 0;
  }

  canvas.addEventListener("pointerleave", () => {
    if (hoverPickRaf) {
      cancelAnimationFrame(hoverPickRaf);
      hoverPickRaf = 0;
    }
    pendingPickNdc = null;
    resetCanvasPointerGestureState();
    if (!stripFrozen()) clearHover();
  });

  canvas.addEventListener("pointercancel", (e) => {
    if (capId != null && e.pointerId === capId) {
      resetCanvasPointerGestureState();
    }
  });

  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);

    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    /**
     * 滚动积分不得依赖 rootVisible：离屏时仍要积分 scrollTargetVel。
     * 渲染也不做 visibility 节流：rootVisible 过严会长期不调 render，画面冻结像「滚轮无效」。
     */
    if (!stripFrozen()) {
      if (!isPointerOverGallery && !lb) {
        scrollTarget += AUTO_PLAY_SCROLL_PER_SEC * dt;
      }

      scrollTargetVel *= Math.pow(SCROLL_TARGET_VEL_DAMP, dt * 60);
      scrollTarget += scrollTargetVel * dt * SCROLL_TARGET_INTEGRATE;

      const smooth = 1 - Math.exp(-dt * SCROLL_SMOOTH_LAMBDA);
      scroll += shortestPeriodDelta(scroll, scrollTarget, totalLen) * smooth;

      /** 双精度下长时间单调增大一般无碍；过大时成对减掉周期，保持 scroll 与 scrollTarget 同域、避免 i*SPACING - scroll 相消误差。 */
      const rebase = totalLen * 400;
      if (Math.abs(scroll) > rebase || Math.abs(scrollTarget) > rebase) {
        const k = Math.round((scroll + scrollTarget) * 0.5 / totalLen) * totalLen;
        scroll -= k;
        scrollTarget -= k;
      }

      applyScrollZOnly();
      for (const m of meshes) {
        if (lb && m === lb.mesh) continue;
        const hb = m.userData.hoverBlend ?? 0;
        if (m === hoveredMesh || m.userData.hoverAnimating || hb > 0.0005) {
          applyHoverRotationForMesh(m);
        }
      }
    }

    stepLightbox(now);

    updateProgress();
    if (typeof document === "undefined" || !document.hidden) {
      renderer.render(scene, camera);
    }
  }

  requestAnimationFrame(tick);
}

initPhotoCorridor3d();
