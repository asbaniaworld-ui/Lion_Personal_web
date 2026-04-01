(() => {
  "use strict";

  /** 从作品子页返回主页时附带 `#works` 或 `?to=works`，跳过欢迎加载并定位到 Works 横滑段落 */
  const portfolioDeepTarget = (() => {
    try {
      if (new URLSearchParams(window.location.search).get("to") === "works") return "works";
      const h = (window.location.hash || "").replace(/^#/, "");
      if (h === "works") return "works";
    } catch (_) {
      /* ignore */
    }
    return null;
  })();

  const EDIT_EASE = "power2.out";
  const EDIT_DUR = 0.75;
  const EDIT_DUR_SHORT = 0.65;
  const MAX_Y = 20;
  const ACT_MUTED = 0.72;
  const ACT_DIM = 0.56;
  const ACT_CLEAR = 1;
  /** Stagger between typewriter units (seconds). Latin/CJK: per character; hobbies line: per word. */
  const TYPEWRITER_STEP_SEC = 0.052;
  /** Each character emerges from slightly left (em), like writing L→R. */
  const TYPEWRITER_FROM_X_EM = "-0.065em";
  /** Prevent accidental slide switch right after finishing mini-game. */
  const GUESTBOOK_NAV_RESUME_DELAY_MS = 1500;
  let guestbookNavLockUntilTs = 0;

  function lockGuestbookArrowNav(ms = GUESTBOOK_NAV_RESUME_DELAY_MS) {
    guestbookNavLockUntilTs = Math.max(guestbookNavLockUntilTs, Date.now() + ms);
  }

  function prefersReduced() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  /** Hover: one element clears, siblings dim (opacity only). */
  function bindInformationGroup(elements) {
    const g = window.gsap;
    if (!g || elements.length < 2) return;
    const reset = () => {
      elements.forEach((el) => {
        g.to(el, { opacity: ACT_MUTED, duration: EDIT_DUR, ease: EDIT_EASE, overwrite: "auto" });
      });
    };
    elements.forEach((el) => {
      g.set(el, { opacity: ACT_MUTED });
      el.addEventListener("mouseenter", () => {
        elements.forEach((o) => {
          g.to(o, {
            opacity: o === el ? ACT_CLEAR : ACT_DIM,
            duration: EDIT_DUR,
            ease: EDIT_EASE,
            overwrite: "auto",
          });
        });
      });
    });
    const roots = new Set(elements.map((el) => el.closest(".slide")));
    roots.forEach((slide) => {
      if (!slide) return;
      slide.addEventListener("mouseleave", (e) => {
        if (!slide.contains(e.relatedTarget)) reset();
      });
    });
  }

  // Loading overlay handling (Welcome + progress bar + "Enter" button)
  const loaderOverlay = document.getElementById("loaderOverlay");
  const loaderBarFill = document.getElementById("loaderBarFill");
  const loaderEnter = document.getElementById("loaderEnter");
  const siteHeaderInner = document.querySelector(".site-header__inner");

  const setBar = (pct) => {
    if (!loaderBarFill) return;
    const v = Math.max(0, Math.min(100, pct));
    loaderBarFill.style.width = `${v}%`;
  };

  /** Quiet header settle after intro sequence (opacity + small lift only). */
  function settleSiteHeader() {
    if (!siteHeaderInner || !window.gsap) return;
    window.gsap.fromTo(
      siteHeaderInner,
      { y: 10, autoAlpha: 1 },
      {
        y: 0,
        duration: 0.85,
        ease: EDIT_EASE,
        overwrite: "auto",
      }
    );
  }

  let afterLoaderDismissed = null;
  /** Set by loader block; invoked after story bootstrap so Enter appears only when interactions are warmed up. */
  let runLoaderReadyPipeline = null;
  /** Assigned after ScrollTrigger / railST exist: layout sync, video + WebGL + nav warmup (real work, not cosmetic). */
  let runLoaderInteractPhase = null;

  /** Decode first video frames while loader is visible so intro ring doesn’t hitch after Enter. */
  async function warmIntroVideoPlayback() {
    const v = document.querySelector(".accent--ring__video");
    if (!v || !(v instanceof HTMLVideoElement)) return;
    try {
      v.muted = true;
      const playAttempt = v.play();
      if (playAttempt && typeof playAttempt.then === "function") {
        await playAttempt.catch(() => {});
      }
      await new Promise((resolve) => {
        const done = () => resolve();
        const fallbackMs = 220;
        const tid = window.setTimeout(done, fallbackMs);
        if (typeof v.requestVideoFrameCallback === "function") {
          v.requestVideoFrameCallback(() => {
            window.clearTimeout(tid);
            done();
          });
        } else {
          v.addEventListener(
            "playing",
            () => {
              window.clearTimeout(tid);
              done();
            },
            { once: true }
          );
        }
      });
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    } catch {
      /* autoplay policy or missing codec */
    }
  }

  /**
   * 预拉 AI 建模页 `model-draco.glb` + `model-viewer` 脚本，写入 HTTP 缓存，
   * 用户从 Works 点进 model-preview 时首屏更快（与欢迎页进度条「Almost ready」前挂钩）。
   */
  async function warmAiModelAssetsForLaterVisit() {
    const pullToCache = async (relativePath) => {
      try {
        const url = new URL(relativePath, window.location.href).href;
        const res = await fetch(url, { cache: "default", credentials: "same-origin" });
        if (res.ok) await res.arrayBuffer();
      } catch (err) {
        console.warn("[loader] prefetch failed:", relativePath, err);
      }
    };
    await Promise.all([
      pullToCache("models/model-draco.glb"),
      pullToCache("libs/model-viewer/model-viewer.min.js"),
    ]);
  }

  function fireAfterLoaderDismissed() {
    const fn = afterLoaderDismissed;
    afterLoaderDismissed = null;
    if (typeof fn === "function") fn();
  }

  function dismissLoaderAndContinue() {
    if (loaderOverlay && window.gsap) {
      window.gsap.to(loaderOverlay, {
        autoAlpha: 0,
        y: -10,
        duration: EDIT_DUR,
        ease: EDIT_EASE,
        onComplete: () => {
          loaderOverlay.classList.add("is-hidden");
          window.gsap.set(loaderOverlay, { clearProps: "transform" });
          settleSiteHeader();
          fireAfterLoaderDismissed();
        },
      });
      return;
    }

    if (loaderOverlay) loaderOverlay.classList.add("is-hidden");
    settleSiteHeader();
    fireAfterLoaderDismissed();
  }

  if (loaderOverlay && loaderBarFill && loaderEnter) {
    setBar(0);

    const loaderHintEl = document.getElementById("loaderHint");
    let loaderPipelineDone = false;

    /** Milestone weights (must sum to 100): fonts, document load, intro video, static images, 3D corridor textures, layout/interaction. */
    const W = {
      fonts: 6,
      load: 14,
      video: 20,
      images: 22,
      corridor: 30,
      interact: 8,
    };

    /** Works 悬停预览 + Hobbies 翻面大图：与首屏 <img> 一并解码，避免进入后仍会卡顿。 */
    const LOADER_EXTRA_DECODE_URLS = [
      "assets/portfolio/movie.png",
      "assets/portfolio/star.png",
      "assets/portfolio/data.png",
      "models/image.png",
      "Hobbies/Book.png",
      "Hobbies/Hiking.png",
      "Hobbies/Vibe coding.png",
      "Hobbies/Photography.png",
      "Hobbies/Music.png",
      "Hobbies/Basketball.png",
    ];

    const waitForPhotoCorridorBindings = (maxMs = 14000) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const done = (ok) => resolve(ok);
        const tick = () => {
          if (typeof window.__photoCorridor3dTexturesPromise !== "undefined") {
            done(true);
            return;
          }
          if (performance.now() - t0 >= maxMs) {
            console.warn(
              "[loader] 3D photo corridor 初始化超时，将继续（稍后贴图可能仍在加载）"
            );
            done(false);
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });

    const waitWindowLoad = () =>
      new Promise((resolve) => {
        if (document.readyState === "complete") resolve();
        else window.addEventListener("load", resolve, { once: true });
      });

    /** 避免 fonts / window.load / 贴图等永久 pending，导致 Enter 永远不出现（opacity 依赖 .is-ready）。 */
    const loaderSleep = (ms) => new Promise((r) => window.setTimeout(r, ms));
    const raceLoaderStep = (promise, ms, label) =>
      Promise.race([
        Promise.resolve(promise).catch((err) => {
          console.warn(`[loader] “${label}” 出错，继续后续步骤：`, err);
        }),
        loaderSleep(ms).then(() => {
          console.warn(`[loader] “${label}” 超过 ${ms}ms，继续下一步以免卡死欢迎页`);
        }),
      ]);

    const waitIntroVideo = () => {
      const v = document.querySelector(".accent--ring__video");
      if (!v || !(v instanceof HTMLVideoElement)) return Promise.resolve();
      if (v.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          v.removeEventListener("canplaythrough", done);
          v.removeEventListener("loadeddata", done);
          v.removeEventListener("error", done);
          resolve();
        };
        v.addEventListener("canplaythrough", done, { once: true });
        v.addEventListener("loadeddata", done, { once: true });
        v.addEventListener("error", done, { once: true });
      });
    };

    const decodeUrl = (src) =>
      Promise.race([
        new Promise((resolve) => {
          const im = new Image();
          im.onload = () => {
            if (im.decode) {
              im.decode().then(resolve).catch(resolve);
            } else resolve();
          };
          im.onerror = () => resolve();
          im.src = src;
        }),
        loaderSleep(12000).then(() => {}),
      ]);

    let barDisplay = 0;
    let barTargetPct = 0;
    let barRafId = 0;
    const tickBar = () => {
      barDisplay += (barTargetPct - barDisplay) * 0.2;
      if (barTargetPct - barDisplay < 0.35) barDisplay = barTargetPct;
      setBar(barDisplay);
      if (barDisplay < barTargetPct - 0.08) {
        barRafId = requestAnimationFrame(tickBar);
      } else {
        barRafId = 0;
      }
    };
    const setTargetBar = (pct) => {
      barTargetPct = Math.max(barTargetPct, Math.min(100, pct));
      if (!barRafId) barRafId = requestAnimationFrame(tickBar);
    };

    runLoaderReadyPipeline = async () => {
      if (loaderPipelineDone) return;

      if (portfolioDeepTarget === "works") {
        loaderPipelineDone = true;
        setBar(100);
        if (loaderHintEl) loaderHintEl.textContent = "Ready";
        if (loaderEnter) loaderEnter.classList.add("is-ready");
        if (loaderOverlay && window.gsap) {
          window.gsap.killTweensOf(loaderOverlay);
          window.gsap.set(loaderOverlay, { autoAlpha: 0, y: 0 });
        }
        if (loaderOverlay) loaderOverlay.classList.add("is-hidden");
        settleSiteHeader();
        fireAfterLoaderDismissed();
        return;
      }

      loaderPipelineDone = true;

      let acc = 0;
      const bump = (key) => {
        acc += W[key];
        setTargetBar(acc);
      };

      try {
        if (loaderHintEl) loaderHintEl.textContent = "Loading fonts…";
        if (document.fonts?.ready) {
          await raceLoaderStep(document.fonts.ready, 12000, "fonts.ready");
        }
        bump("fonts");

        if (loaderHintEl) loaderHintEl.textContent = "Loading page…";
        await raceLoaderStep(waitWindowLoad(), 28000, "window load");
        bump("load");

        if (loaderHintEl) loaderHintEl.textContent = "Loading video…";
        await raceLoaderStep(waitIntroVideo(), 14000, "intro video");
        bump("video");

        if (loaderHintEl) loaderHintEl.textContent = "Loading images…";
        const urls = new Set();
        const addUrl = (s) => {
          if (!s || s.startsWith("data:")) return;
          try {
            urls.add(new URL(s, window.location.href).href);
          } catch {
            urls.add(s);
          }
        };
        document.querySelectorAll("img[src]").forEach((el) => {
          addUrl(el.getAttribute("src"));
        });
        document.querySelectorAll("[data-preview-src]").forEach((el) => {
          addUrl(el.getAttribute("data-preview-src"));
        });
        LOADER_EXTRA_DECODE_URLS.forEach(addUrl);
        await raceLoaderStep(
          Promise.all([...urls].map((u) => decodeUrl(u))),
          45000,
          "img decode"
        );
        bump("images");

        if (loaderHintEl) loaderHintEl.textContent = "Loading photo gallery…";
        const corridorStart = acc;
        const corridorSpan = W.corridor;
        await raceLoaderStep(waitForPhotoCorridorBindings(14000), 14000, "3D module");
        const pollCorridor = () => {
          const p =
            typeof window.__photoCorridor3dLoadProgress === "number"
              ? window.__photoCorridor3dLoadProgress
              : 0;
          setTargetBar(corridorStart + corridorSpan * Math.min(1, p));
        };
        pollCorridor();
        const pollId = window.setInterval(pollCorridor, 100);
        try {
          if (window.__photoCorridor3dTexturesPromise) {
            await raceLoaderStep(
              window.__photoCorridor3dTexturesPromise,
              32000,
              "3D corridor textures"
            );
          }
        } catch {
          /* corridor optional */
        }
        window.clearInterval(pollId);
        pollCorridor();
        bump("corridor");

        const interactStart = acc;
        const interactSpan = W.interact;
        const subInteract = (t01) =>
          setTargetBar(interactStart + interactSpan * Math.min(1, Math.max(0, t01)));

        if (typeof runLoaderInteractPhase === "function") {
          await raceLoaderStep(
            runLoaderInteractPhase({
              loaderHintEl,
              subInteract,
            }),
            40000,
            "interaction warmup"
          );
        } else {
          await raceLoaderStep(
            (async () => {
              if (loaderHintEl) loaderHintEl.textContent = "Preparing interactions…";
              if (window.ScrollTrigger) {
                window.ScrollTrigger.refresh();
              }
              await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
              });
              await warmIntroVideoPlayback();
              if (window.__photoCorridor3dRendererWarmup) {
                await window.__photoCorridor3dRendererWarmup();
              }
              await new Promise((resolve) => {
                const idle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 48));
                idle(() => resolve());
              });
              subInteract(1);
            })(),
            28000,
            "fallback interact"
          );
        }
        acc = interactStart + interactSpan;

        if (loaderHintEl) loaderHintEl.textContent = "Ready";
      } catch {
        /* still unlock */
      } finally {
        barTargetPct = 100;
        barDisplay = 100;
        setBar(100);
        if (loaderHintEl && loaderHintEl.textContent !== "Ready") {
          loaderHintEl.textContent = "Ready";
        }
        loaderEnter.classList.add("is-ready");
      }
    };

    loaderEnter.addEventListener("click", () => {
      dismissLoaderAndContinue();
    });
  } else if (loaderOverlay) {
    loaderOverlay.classList.add("is-hidden");
    settleSiteHeader();
  } else {
    settleSiteHeader();
  }

  const rail = document.getElementById("rail");
  const slides = Array.from(document.querySelectorAll(".rail .slide"));
  const space = document.querySelector(".scroll-space");
  const dots = document.getElementById("dots");
  const showcaseItems = Array.from(
    document.querySelectorAll(".showcase__content .showcase__item")
  );

  if (!rail || slides.length === 0 || !space || !dots) {
    if (typeof runLoaderReadyPipeline === "function") {
      queueMicrotask(() => runLoaderReadyPipeline());
    }
    return;
  }

  const total = slides.length;
  let index = 0;
  let railST = null;
  let railTween = null;
  let playIntroTypewriter = null;
  /** True during arrow-driven section transition (drag disabled). */
  let interactionLocked = false;
  let refreshStoryNavArrows = () => {};
  /** Runs after ScrollTrigger.refresh on resize (guestbook scribble mini-game layout). */
  let onGuestbookScribbleResize = null;
  const introRingMotion = { breath: null, el: null };
  /** Assigned in setupEditorialSystems; pauses intro ring video when user leaves first slide. */
  const introMediaState = { resetLeavingSlide: null, introActive: true };
  /** Set by Hobbies desk flip: run after `index` updates (dots / rail). */
  let onStoryIndexApplied = null;

  // --- About page: diagonal infinite photo corridor + lightbox (scoped by DOM presence) ---
  function initAboutPhotoCorridor() {
    const corridor = document.getElementById("photoCorridor");
    const track = document.getElementById("photoCorridorTrack");
    if (!corridor || !track || !window.gsap) return;

    const g = window.gsap;
    const Flip = window.Flip;
    if (Flip && typeof g.registerPlugin === "function") {
      g.registerPlugin(Flip);
    }
    const clampFn = (min, max) => g.utils.clamp(min, max);

    // Prefer the 20 items authored in HTML. Fallback: if empty, do nothing.
    const cards = Array.from(track.querySelectorAll(".pc-polaroid"));
    if (cards.length === 0) return;
    const CARD_COUNT = cards.length;
    // Cards move vertically in local space; the track is rotated -45deg in CSS.
    const AXIS_X = 0;
    const AXIS_Y = 1;
    const state = {
      open: false,
      centerX: 0,
      centerY: 0,
      span: 0,
      cardW: 96,
      step: 0,
      axisShift: 0,
      vel: 0,
      raf: 0,
    };
    const aboutIndex = slides.findIndex((s) => s.dataset?.key === "about");
    const itemState = cards.map((el, i) => ({
      el,
      baseRotate: g.utils.random(-3, 3, 0.1),
      offset: 0,
      scalar: 0,
      // Small offset on the axis-normal direction to create a "thickness stack"
      // (like cards leaning in a 3D corridor).
      normalOffset: (i % 7) * 4 - 12,
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
      busy: false,
      i,
    }));

    const modulo = (v, len) => ((v % len) + len) % len;

    /** Corridor size + stack spacing only (does not reset scroll offsets). */
    const readCorridorMetrics = () => {
      const bounds = corridor.getBoundingClientRect();
      state.centerX = bounds.width * 0.5;
      state.centerY = bounds.height * 0.5;
      state.cardW = cards[0]?.getBoundingClientRect().width || 96;
      state.step = Math.max(56, state.cardW * 0.62);
      state.span = state.step * Math.max(1, CARD_COUNT - 1);
      state.axisShift = state.span * 0.34;
    };

    /** Initial layout + window resize: recompute spacing and reset positions. */
    const readGeometry = () => {
      readCorridorMetrics();
      const mid = (CARD_COUNT - 1) / 2;
      itemState.forEach((item, i) => {
        const jitter = ((i % 3) - 1) * 10; // tiny hand-placed feeling on the axis
        item.offset = (i - mid) * state.step + state.axisShift + jitter;
        item.scalar = item.offset;
        item.offset = item.scalar;
      });
    };

    const project = (scalar) => ({
      x: state.centerX + scalar * AXIS_X,
      y: state.centerY + scalar * AXIS_Y,
    });

    const getDepthProfile = (scalar) => {
      const half = state.span * 0.5;
      const u = (scalar + half) / Math.max(1, state.span); // 0..1 along the conveyor
      const w = Math.sin(u * Math.PI); // 0..1..0, closest at center

      // 2D editorial stack: larger + more opaque when near "center".
      const scale = 0.82 + w * 0.42;
      const opacity = 0.18 + w * 0.82;

      // Shadow stronger when closer.
      const shadowAlpha = 0.06 + w * 0.20;
      const shadowY = Math.round(10 + w * 18);
      const shadowBlur = Math.round(22 + w * 36);

      // z-index: center cards sit above.
      const zIndex = Math.round(1000 + w * 3000);
      return { scale, opacity, shadowAlpha, shadowY, shadowBlur, w, zIndex };
    };

    /** Layout one card (also used when busy during lightbox close so Flip has a real target). */
    const layoutOnePolaroid = (item) => {
      const N_X = AXIS_Y;
      const N_Y = -AXIS_X;
      const p = project(item.scalar);
      item.x = p.x + item.normalOffset * N_X;
      item.y = p.y + item.normalOffset * N_Y;
      const profile = getDepthProfile(item.scalar);
      item.rotate = item.baseRotate + Math.sin(item.scalar * 0.004) * 1.15;
      item.el.style.zIndex = `${Math.max(1, profile.zIndex)}`;
      item.el.style.boxShadow = `0 ${profile.shadowY}px ${profile.shadowBlur}px rgba(0,0,0,${profile.shadowAlpha.toFixed(3)})`;
      g.set(item.el, {
        x: item.x,
        y: item.y,
        rotation: item.rotate,
        scale: profile.scale,
        xPercent: -50,
        yPercent: -50,
        opacity: profile.opacity,
      });
    };

    const render = () => {
      itemState.forEach((item) => {
        if (item.busy) return;
        layoutOnePolaroid(item);
      });
    };

    const aboutIsActive = () => index === aboutIndex;

    const tick = () => {
      // animate only while About is active; keep other slides untouched
      if (!aboutIsActive() || state.open) {
        state.raf = window.requestAnimationFrame(tick);
        return;
      }

      state.vel *= 0.86;
      const speed = state.vel; // wheel-driven belt speed
      if (Math.abs(speed) > 0.001) {
        itemState.forEach((item) => {
          if (item.busy) return;
          item.offset += speed;
          item.scalar = modulo(item.offset + state.span * 0.5, state.span) - state.span * 0.5;
        });
      }
      render();
      state.raf = window.requestAnimationFrame(tick);
    };

    readGeometry();
    render();
    state.raf = window.requestAnimationFrame(tick);

    const onWheel = (e) => {
      if (state.open) return;
      if (!aboutIsActive()) return;
      /** 右侧 3D 廊道不驱动拍立得传送带（滚轮交给页面/左侧区域） */
      if (e.target?.closest?.("#photoCorridor3dRoot")) return;
      state.vel += clampFn(-38, 38, (e.deltaY || 0) * 0.22);
    };

    const onResize = () => {
      if (state.open) return;
      readGeometry();
      render();
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    // Lightbox overlay (created once)
    let overlay = document.querySelector(".pc-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "pc-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    let activeEl = null;
    let activeState = null;
    /** Where to put the polaroid back after lightbox (parent + nextSibling). */
    let lightboxInsertRef = null;
    let detachLightboxPolaroidClick = null;

    function open(el) {
      if (!el || state.open) return;
      const data = itemState.find((item) => item.el === el);
      if (!data) return;
      state.open = true;
      activeEl = el;
      activeState = data;
      data.busy = true;

      lightboxInsertRef = { parent: el.parentNode, next: el.nextSibling };

      overlay.classList.add("is-open");

      const rect0 = el.getBoundingClientRect();
      const aspect = rect0.width / Math.max(1, rect0.height);
      const targetH = window.innerHeight * 0.8;
      let targetW = Math.min(window.innerWidth * 0.86, targetH * aspect);
      const targetHFinal = targetW / aspect;

      // Prefer Flip: parent track has rotate(-45deg), so tweening x/y inside it never
      // reaches true viewport center and rotation:0 still looks tilted. Reparent to body.
      if (Flip && typeof Flip.getState === "function" && typeof Flip.from === "function") {
        const flipState = Flip.getState(el);
        document.body.appendChild(el);
        el.classList.add("pc-polaroid--lightbox");
        g.killTweensOf(el);
        g.set(el, {
          position: "fixed",
          top: "50%",
          left: "50%",
          margin: 0,
          x: 0,
          y: 0,
          xPercent: -50,
          yPercent: -50,
          width: targetW,
          height: targetHFinal,
          rotation: 0,
          scale: 1,
          opacity: 1,
          zIndex: 10001,
          overwrite: true,
        });
        const onPolaroidWhileOpen = (ev) => {
          ev.stopPropagation();
          close();
        };
        el.addEventListener("click", onPolaroidWhileOpen);
        detachLightboxPolaroidClick = () => {
          el.removeEventListener("click", onPolaroidWhileOpen);
          detachLightboxPolaroidClick = null;
        };

        Flip.from(flipState, {
          duration: 0.88,
          ease: "power3.out",
          absolute: true,
          nested: true,
          scale: true,
        });
        return;
      }

      // Fallback (no Flip): cancel parent -45° in local space → child rotation ≈ 45° reads upright.
      g.to(el, { zIndex: 5000, duration: 0.01 });
      g.to(el, {
        x: state.centerX,
        y: state.centerY,
        rotation: 45,
        scale: targetW / Math.max(1, rect0.width),
        xPercent: -50,
        yPercent: -50,
        opacity: 1,
        duration: 0.9,
        ease: "power3.out",
        overwrite: "auto",
      });
    }

    function close() {
      if (!state.open) return;
      state.open = false;
      if (typeof detachLightboxPolaroidClick === "function") detachLightboxPolaroidClick();

      if (!activeEl || !activeState || !lightboxInsertRef?.parent) {
        overlay.classList.remove("is-open");
        activeEl = null;
        activeState = null;
        lightboxInsertRef = null;
        return;
      }

      const el = activeEl;
      const st = activeState;
      const { parent, next } = lightboxInsertRef;

      if (Flip && typeof Flip.getState === "function" && typeof Flip.from === "function" && el.classList.contains("pc-polaroid--lightbox")) {
        const flipState = Flip.getState(el);
        if (next) parent.insertBefore(el, next);
        else parent.appendChild(el);
        el.classList.remove("pc-polaroid--lightbox");
        g.killTweensOf(el);
        g.set(el, {
          clearProps:
            "position,top,left,right,bottom,margin,width,height,maxWidth,maxHeight,transform",
        });
        readCorridorMetrics();
        layoutOnePolaroid(st);
        window.requestAnimationFrame(() => {
          Flip.from(flipState, {
            duration: 0.82,
            ease: "power3.inOut",
            absolute: true,
            nested: true,
            scale: true,
            onComplete: () => {
              overlay.classList.remove("is-open");
              st.busy = false;
              const profile = getDepthProfile(st.scalar);
              el.style.zIndex = `${Math.max(1, profile.zIndex)}`;
              el.style.boxShadow = `0 ${profile.shadowY}px ${profile.shadowBlur}px rgba(0,0,0,${profile.shadowAlpha.toFixed(3)})`;
              activeEl = null;
              activeState = null;
              lightboxInsertRef = null;
              render();
            },
          });
        });
        return;
      }

      overlay.classList.remove("is-open");
      const profile = getDepthProfile(st.scalar);
      const N_X = AXIS_Y;
      const N_Y = -AXIS_X;
      const p = project(st.scalar);
      const x = p.x + st.normalOffset * N_X;
      const y = p.y + st.normalOffset * N_Y;
      const rotate = st.baseRotate + Math.sin(st.scalar * 0.004) * 1.15;
      g.to(el, {
        x,
        y,
        rotation: rotate,
        scale: profile.scale,
        xPercent: -50,
        yPercent: -50,
        opacity: profile.opacity,
        duration: 0.8,
        ease: "power3.inOut",
        overwrite: "auto",
        onComplete: () => {
          st.busy = false;
          el.style.zIndex = `${Math.max(1, profile.zIndex)}`;
          el.style.boxShadow = `0 ${profile.shadowY}px ${profile.shadowBlur}px rgba(0,0,0,${profile.shadowAlpha.toFixed(3)})`;
          activeEl = null;
          activeState = null;
          lightboxInsertRef = null;
          render();
        },
      });
    }

    overlay.addEventListener("click", () => close());

    track.addEventListener("click", (e) => {
      const el = e.target?.closest?.(".pc-polaroid");
      if (!el) return;
      if (state.open) close();
      else open(el);
    });

    window.addEventListener(
      "pagehide",
      () => {
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", onResize);
        if (state.raf) window.cancelAnimationFrame(state.raf);
      },
      { once: true }
    );
  }

  function syncIntroRingMotion(isIntroActive) {
    const g = window.gsap;
    if (!g || !introRingMotion.breath || !introRingMotion.el) return;
    const { breath, el } = introRingMotion;
    if (isIntroActive) {
      introMediaState.introActive = true;
      breath.resume();
    } else {
      if (introMediaState.introActive && typeof introMediaState.resetLeavingSlide === "function") {
        introMediaState.resetLeavingSlide();
      }
      introMediaState.introActive = false;
      breath.pause();
      g.to(el, {
        x: 0,
        marginTop: 0,
        duration: 0.65,
        ease: "power2.out",
        overwrite: "auto",
      });
    }
  }

  const palette = [
    "#8c6a5b", // clay
    "#6e8b7f", // sage
    "#5f6f86", // slate blue
    "#b08a5a", // ochre
    "#8a4f4f", // muted red
    "#3f5e66", // deep teal
  ];
  const ringWords = [
    "INTRODUCTION",
    "ABOUT",
    "WORKS",
    "HOBBIES",
    "GUESTBOOK",
    "CONTACT",
  ];

  initAboutPhotoCorridor();

  // --- Works showcase: 3s auto-rotating cards inside frame ---
  if (showcaseItems.length > 0) {
    let showcaseIndex = 0;
    let showcaseTimer = null;
    let pauseTimeout = null;
    let isPaused = false;

    function setShowcaseCard(i) {
      showcaseIndex = (i + showcaseItems.length) % showcaseItems.length;
      if (window.gsap) {
        showcaseItems.forEach((el) => {
          window.gsap.killTweensOf(el);
          window.gsap.set(el, { clearProps: "opacity,transform" });
        });
      }
      showcaseItems.forEach((el, idx) => {
        el.classList.toggle("is-active", idx === showcaseIndex);
      });
    }

    function startRotation() {
      if (showcaseTimer) return;
      showcaseTimer = window.setInterval(() => {
        setShowcaseCard(showcaseIndex + 1);
      }, 3000);
    }

    function stopRotation() {
      if (!showcaseTimer) return;
      window.clearInterval(showcaseTimer);
      showcaseTimer = null;
    }

    // initial state
    setShowcaseCard(0);
    startRotation();

    // Hover pauses, then auto-resume 3s after mouse leaves (no extra click needed).
    showcaseItems.forEach((card) => {
      card.addEventListener("mouseenter", () => {
        isPaused = true;
        if (pauseTimeout) window.clearTimeout(pauseTimeout);
        pauseTimeout = null;
        stopRotation();
      });
      card.addEventListener("mouseleave", () => {
        isPaused = false;
        if (pauseTimeout) window.clearTimeout(pauseTimeout);
        pauseTimeout = window.setTimeout(() => {
          startRotation();
        }, 3000);
      });
    });
  }

  function renderDots() {
    dots.querySelectorAll("button.dot").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
      dot.setAttribute("aria-current", i === index ? "page" : "false");
    });
    const activeKey = slides[index]?.dataset?.key || "";
    document.body.classList.toggle("is-guestbook-active", activeKey === "guestbook");
    onStoryIndexApplied?.();
  }

  function clamp(n) {
    return Math.max(0, Math.min(total - 1, n));
  }

  /** Same timing as story arrows so dots / keyboard / nav share one warmed GSAP path (not native smooth). */
  const STORY_NAV_DUR = 0.9;
  const STORY_NAV_EASE = "power2.out";

  function goTo(i) {
    if (interactionLocked) return;
    const next = clamp(i);
    const span = railST ? Math.max(1e-6, railST.end - railST.start) : 0;

    if (railST && window.gsap) {
      if (next === index) return;
      if (prefersReduced()) {
        const targetY = railST.start + (next / Math.max(1, total - 1)) * span;
        window.scrollTo({ top: targetY, left: 0, behavior: "auto" });
        index = next;
        renderDots();
        refreshStoryNavArrows();
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        return;
      }

      interactionLocked = true;
      rail.classList.add("is-nav-animating");

      const startY = window.scrollY;
      const targetY = railST.start + (next / Math.max(1, total - 1)) * span;
      const scrollObj = { y: startY };

      window.gsap.to(scrollObj, {
        y: targetY,
        duration: STORY_NAV_DUR,
        ease: STORY_NAV_EASE,
        overwrite: "auto",
        onUpdate: () => {
          window.scrollTo(0, scrollObj.y);
          if (window.ScrollTrigger) window.ScrollTrigger.update();
        },
        onComplete: () => {
          window.scrollTo(0, targetY);
          index = next;
          renderDots();
          refreshStoryNavArrows();
          rail.classList.remove("is-nav-animating");
          interactionLocked = false;
          if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        },
      });
      return;
    }

    index = next;
    const t = index / Math.max(1, total - 1);
    const y = t * (document.body.scrollHeight - window.innerHeight);
    window.scrollTo({
      top: y,
      behavior: prefersReduced() ? "auto" : "smooth",
    });
  }

  // Dots
  const dotEls = [];
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "dot";
    const label =
      slides[i]?.querySelector(".slide__eyebrow")?.textContent?.trim() ||
      `Page ${i + 1}`;
    dot.setAttribute("aria-label", `Go to ${label}`);
    dot.setAttribute("title", label);
    dot.style.setProperty("--dot-color", palette[i % palette.length]);
    const word = ringWords[i % ringWords.length];
    const repeated = `${word} • ${word} • ${word} • ${word} •`;
    const ringId = `ringPath-${i}-${Math.random().toString(16).slice(2)}`;
    dot.insertAdjacentHTML(
      "beforeend",
      `<svg class="dot__ring" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <defs><path id="${ringId}" d="M32,32 m-22,0 a22,22 0 1,1 44,0 a22,22 0 1,1 -44,0"/></defs>
        <text class="dot__ringText"><textPath href="#${ringId}" startOffset="50%" text-anchor="middle">${repeated}</textPath></text>
      </svg>`
    );
    dot.addEventListener("click", () => goTo(i));
    dots.appendChild(dot);
    dotEls.push(dot);
  }

  function applyPush(activeIndex) {
    const maxSteps = 4;
    const stepPx = 10; // push strength per step

    for (let i = 0; i < dotEls.length; i++) {
      const dot = dotEls[i];
      const d = i - activeIndex;
      if (d === 0) {
        dot.style.setProperty("--push", "0px");
        continue;
      }

      const ad = Math.abs(d);
      if (ad > maxSteps) {
        dot.style.setProperty("--push", "0px");
        continue;
      }

      const dir = d < 0 ? -1 : 1;
      const strength = (maxSteps - ad + 1) / (maxSteps + 1); // closer dots move more
      const push = dir * stepPx * strength;
      dot.style.setProperty("--push", `${push.toFixed(2)}px`);
    }
  }

  function clearPush() {
    for (const dot of dotEls) dot.style.setProperty("--push", "0px");
  }

  dotEls.forEach((dot, i) => {
    dot.addEventListener("mouseenter", () => applyPush(i));
    dot.addEventListener("mouseleave", clearPush);
    dot.addEventListener("focus", () => applyPush(i));
    dot.addEventListener("blur", clearPush);
  });
  renderDots();

  function setScrollSpace() {
    // Match ScrollTrigger end exactly so each slide gets its own scroll range (no overlap).
    const scrollDistance = (total - 1) * window.innerWidth;
    space.style.height = `${window.innerHeight + scrollDistance}px`;
  }

  function updateFromScroll() {
    const maxY = document.body.scrollHeight - window.innerHeight;
    const t = maxY <= 0 ? 0 : window.scrollY / maxY;
    const x = -t * (total - 1) * window.innerWidth;
    rail.style.transform = `translate3d(${x}px, 0, 0)`;
    index = clamp(Math.round(t * (total - 1)));
    renderDots();
  }

  function initStoryNavArrows() {
    if (!window.gsap || !railST || prefersReduced()) return;

    const leftBtn = document.createElement("button");
    leftBtn.type = "button";
    leftBtn.className = "story-nav-arrow story-nav-arrow--prev";
    leftBtn.setAttribute("aria-label", "Previous section");
    leftBtn.innerHTML =
      '<span aria-hidden="true" class="story-nav-arrow__glyph">←</span>';

    const rightBtn = document.createElement("button");
    rightBtn.type = "button";
    rightBtn.className = "story-nav-arrow story-nav-arrow--next";
    rightBtn.setAttribute("aria-label", "Next section");
    rightBtn.innerHTML =
      '<span aria-hidden="true" class="story-nav-arrow__glyph">→</span>';

    const footerNav = document.querySelector(".footer__nav");
    const dotsHost = document.getElementById("dots");
    if (footerNav && dotsHost && footerNav.contains(dotsHost)) {
      footerNav.insertBefore(leftBtn, dotsHost);
      footerNav.appendChild(rightBtn);
    } else {
      document.body.appendChild(leftBtn);
      document.body.appendChild(rightBtn);
    }

    function updateArrows() {
      const atStart = index <= 0;
      const atEnd = index >= total - 1;
      leftBtn.disabled = atStart;
      rightBtn.disabled = atEnd;
      leftBtn.style.visibility = atStart ? "hidden" : "";
      rightBtn.style.visibility = atEnd ? "hidden" : "";
    }

    refreshStoryNavArrows = updateArrows;
    updateArrows();

    function runNav(delta) {
      const next = clamp(index + delta);
      if (next === index) return;
      goTo(next);
    }

    leftBtn.addEventListener("click", () => runNav(-1));
    rightBtn.addEventListener("click", () => runNav(1));
  }

  function bindStoryLinkMotion() {
    if (!window.gsap) return;
    document.querySelectorAll(".story-link").forEach((link) => {
      const slide = link.closest(".slide");
      if (slide?.dataset.key === "guestbook") return;
      link.addEventListener("mouseenter", () => {
        window.gsap.to(link, {
          y: -2,
          duration: EDIT_DUR_SHORT,
          ease: EDIT_EASE,
          overwrite: "auto",
        });
      });
      link.addEventListener("mouseleave", () => {
        window.gsap.to(link, {
          y: 0,
          duration: EDIT_DUR_SHORT,
          ease: EDIT_EASE,
          overwrite: "auto",
        });
      });
    });
  }

  function setupEditorialSystems() {
    const g = window.gsap;
    let lastRailPointerId = null;
    let dragActive = false;
    let forceCancelRailDrag = () => {
      dragActive = false;
      rail.classList.remove("is-dragging");
      document.documentElement.classList.remove("is-rail-dragging");
      try {
        if (lastRailPointerId != null) {
          rail.releasePointerCapture?.(lastRailPointerId);
        }
      } catch {
        /* ignore */
      } finally {
        lastRailPointerId = null;
      }
    };

    let dragStartClientX = 0;
    let dragStartScrollY = 0;

    /* === Guestbook + scribble mini-game: must run even when GSAP / railST fail === */
    const gbSlide = document.querySelector('.slide[data-key="guestbook"]');
    if (gbSlide) {
      const guestbookSlideIndex = slides.findIndex(
        (s) => s.dataset.key === "guestbook"
      );
      const scribbleArena = gbSlide.querySelector(".accent--scribble");
      if (scribbleArena) {
        scribbleArena.removeAttribute("aria-hidden");
        scribbleArena.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
        });
        const playBtn = document.createElement("button");
        playBtn.type = "button";
        playBtn.className = "scribble-game-play";
        playBtn.textContent = "Play";
        playBtn.setAttribute("aria-label", "Play mini game");

        const backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = "scribble-game-back";
        backBtn.textContent = "Reset";
        backBtn.setAttribute("aria-label", "Reset to initial state");
        backBtn.hidden = true;

        const dotA = document.createElement("span");
        dotA.className = "scribble-game-dot scribble-game-dot--a";
        const dotB = document.createElement("span");
        dotB.className = "scribble-game-dot scribble-game-dot--b";
        const rules = document.createElement("div");
        rules.className = "scribble-game-rules";
        rules.setAttribute("aria-hidden", "true");
        // User-provided game rules (typeset inside the dashed oval).
        const rulesLines = [
          { kind: "title", parts: [{ t: "word", v: "Sync and Seek." }] },
          {
            kind: "sub",
            parts: [
              { t: "word", v: "Control" },
              { t: "ws", v: " " },
              { t: "word", v: "each" },
              { t: "ws", v: " " },
              { t: "word", v: "sphere" },
              { t: "ws", v: " " },
              { t: "word", v: "with" },
              { t: "ws", v: " " },
              { t: "key", v: "WASD" },
              { t: "ws", v: " " },
              { t: "word", v: "&" },
              { t: "ws", v: " " },
              { t: "key", v: "↑ ↓ ← →" },
            ],
          },
          {
            kind: "sub",
            parts: [
              { t: "word", v: "Discovery" },
              { t: "ws", v: " " },
              { t: "word", v: "happens" },
              { t: "ws", v: " " },
              { t: "word", v: "at" },
              { t: "ws", v: " " },
              { t: "word", v: "the" },
              { t: "ws", v: " " },
              { t: "word", v: "point" },
              { t: "ws", v: " " },
              { t: "word", v: "of" },
              { t: "ws", v: " " },
              { t: "word", v: "connection." },
            ],
          },
        ];

        let wordIndex = 0;
        rulesLines.forEach((line) => {
          const lineEl = document.createElement("div");
          lineEl.className = `scribble-game-rules-line scribble-game-rules-line--${line.kind}`;
          // Hard-bind subtitle font to match `.slide__subhead` exactly.
          if (line.kind === "sub") {
            lineEl.style.fontFamily =
              '"Source Sans 3", system-ui, sans-serif';
          }
          line.parts.forEach((p) => {
            if (p.t === "ws") {
              lineEl.appendChild(document.createTextNode(p.v));
              return;
            }
            const span = document.createElement("span");
            span.className =
              p.t === "key" ? "scribble-game-word scribble-game-key" : "scribble-game-word";
            span.textContent = p.v;
            span.style.setProperty("--wd", String(wordIndex));
            wordIndex += 1;
            lineEl.appendChild(span);
          });
          rules.appendChild(lineEl);
        });
        const note = document.createElement("div");
        note.className = "scribble-game-note";
        note.textContent = "congratulation";
        const confetti = document.createElement("div");
        confetti.className = "scribble-game-confetti";
        const winFx = document.createElement("div");
        winFx.className = "scribble-win-fx";
        winFx.appendChild(confetti);
        winFx.appendChild(note);

        const state = {
          active: false,
          finished: false,
          won: false,
          gameStartTime: 0,
          radius: 4,
          speed: 14,
          a: { x: 0, y: 0 },
          b: { x: 0, y: 0 },
          start: {
            a: { x: 0, y: 0 },
            b: { x: 0, y: 0 },
          },
          base: {
            a: { x: 0, y: 0 },
            b: { x: 0, y: 0 },
          },
        };

        const movedOnKeyDown = new Set();
        let lastGameToggleTs = 0;
        let winArmed = false;
        let moveCount = 0;
        let activationTs = 0;
        let resetReady = true;
        let confettiClearTid = 0;
        const GAME_KEY_CODES = new Set([
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
        ]);

        const normalizeGameKeyCode = (e) => {
          if (e.code && GAME_KEY_CODES.has(e.code)) return e.code;
          const k = e.key;
          if (k === "ArrowUp") return "ArrowUp";
          if (k === "ArrowDown") return "ArrowDown";
          if (k === "ArrowLeft") return "ArrowLeft";
          if (k === "ArrowRight") return "ArrowRight";
          if (k === "w" || k === "W") return "KeyW";
          if (k === "a" || k === "A") return "KeyA";
          if (k === "s" || k === "S") return "KeyS";
          if (k === "d" || k === "D") return "KeyD";
          return null;
        };

        const clampDot = (v, min, max) => Math.max(min, Math.min(max, v));

        const applyScribbleKeyStep = (code) => {
          if (
            !scribbleArena.classList.contains("is-game-active") ||
            state.finished
          )
            return false;
          if (!resetReady) return false;
          if (
            typeof state.gameStartTime === "number" &&
            Date.now() - state.gameStartTime < 500
          ) {
            return false;
          }

          const sp = state.speed;
          switch (code) {
            case "ArrowLeft":
              state.b.x -= sp;
              break;
            case "ArrowRight":
              state.b.x += sp;
              break;
            case "ArrowUp":
              state.b.y -= sp;
              break;
            case "ArrowDown":
              state.b.y += sp;
              break;
            case "KeyA":
              state.a.x -= sp;
              break;
            case "KeyD":
              state.a.x += sp;
              break;
            case "KeyW":
              state.a.y -= sp;
              break;
            case "KeyS":
              state.a.y += sp;
              break;
            default:
              return false;
          }
          const { w, h } = arenaBounds();
          const min = state.radius + 2;
          const maxX = Math.max(min, w - state.radius - 2);
          const maxY = Math.max(min, h - state.radius - 2);
          state.a.x = clampDot(state.a.x, min, maxX);
          state.a.y = clampDot(state.a.y, min, maxY);
          state.b.x = clampDot(state.b.x, min, maxX);
          state.b.y = clampDot(state.b.y, min, maxY);
          draw();
          winArmed = true;
          moveCount += 1;
          checkWin();
          return true;
        };

        scribbleArena.appendChild(dotA);
        scribbleArena.appendChild(dotB);
        scribbleArena.appendChild(rules);
        scribbleArena.appendChild(backBtn);
        scribbleArena.appendChild(playBtn);
        scribbleArena.appendChild(winFx);

        const arenaBounds = () => ({
          w: Math.max(40, scribbleArena.clientWidth),
          h: Math.max(40, scribbleArena.clientHeight),
        });

        const draw = () => {
          const ax = state.a.x - state.base.a.x;
          const ay = state.a.y - state.base.a.y;
          const bx = state.b.x - state.base.b.x;
          const by = state.b.y - state.base.b.y;
          dotA.style.transform = `translate(${ax}px, ${ay}px)`;
          dotB.style.transform = `translate(${bx}px, ${by}px)`;
        };

        const readTranslateFromTransform = (el) => {
          const tr = getComputedStyle(el).transform;
          if (!tr || tr === "none") return { x: 0, y: 0 };
          const m2 = tr.match(/matrix\(([^)]+)\)/);
          if (m2) {
            const parts = m2[1].split(",").map((n) => parseFloat(n.trim()));
            return { x: parts[4] || 0, y: parts[5] || 0 };
          }
          const m3 = tr.match(/matrix3d\(([^)]+)\)/);
          if (m3) {
            const parts = m3[1].split(",").map((n) => parseFloat(n.trim()));
            return { x: parts[12] || 0, y: parts[13] || 0 };
          }
          return { x: 0, y: 0 };
        };

        const syncFromDOM = () => {
          const arenaRect = scribbleArena.getBoundingClientRect();
          const aRect = dotA.getBoundingClientRect();
          const bRect = dotB.getBoundingClientRect();
          const aCx = aRect.left + aRect.width / 2 - arenaRect.left;
          const aCy = aRect.top + aRect.height / 2 - arenaRect.top;
          const bCx = bRect.left + bRect.width / 2 - arenaRect.left;
          const bCy = bRect.top + bRect.height / 2 - arenaRect.top;

          const aT = readTranslateFromTransform(dotA);
          const bT = readTranslateFromTransform(dotB);

          state.base.a.x = aCx - aT.x;
          state.base.a.y = aCy - aT.y;
          state.base.b.x = bCx - bT.x;
          state.base.b.y = bCy - bT.y;

          state.a.x = aCx;
          state.a.y = aCy;
          state.b.x = bCx;
          state.b.y = bCy;
          draw();
        };

        const reflowAfterResize = () => {
          if (
            !scribbleArena.classList.contains("is-game-active") &&
            !scribbleArena.classList.contains("is-game-done")
          ) {
            return;
          }

          syncFromDOM();

          if (!state.active || state.finished) return;

          const { w, h } = arenaBounds();
          const min = state.radius + 2;
          const maxX = Math.max(min, w - state.radius - 2);
          const maxY = Math.max(min, h - state.radius - 2);
          state.a.x = clampDot(state.a.x, min, maxX);
          state.a.y = clampDot(state.a.y, min, maxY);
          state.b.x = clampDot(state.b.x, min, maxX);
          state.b.y = clampDot(state.b.y, min, maxY);
          draw();
        };

        const resetDots = () => {
          const { w, h } = arenaBounds();
          const min = state.radius + 2;
          const maxX = Math.max(min, w - state.radius - 2);
          const maxY = Math.max(min, h - state.radius - 2);
          const pad = Math.max(
            state.radius + 8,
            Math.min(72, Math.floor(Math.min(w, h) * 0.15))
          );

          state.a.x = pad;
          state.a.y = pad;
          state.b.x = w - pad;
          state.b.y = h - pad;
          state.a.x = clampDot(state.a.x, min, maxX);
          state.a.y = clampDot(state.a.y, min, maxY);
          state.b.x = clampDot(state.b.x, min, maxX);
          state.b.y = clampDot(state.b.y, min, maxY);

          const minDist = state.radius * 2 + 28;
          let dx = state.b.x - state.a.x;
          let dy = state.b.y - state.a.y;
          let dist0 = Math.hypot(dx, dy);
          if (dist0 < minDist && maxX > min && maxY > min) {
            const cx = (state.a.x + state.b.x) / 2;
            const cy = (state.a.y + state.b.y) / 2;
            const u = dist0 > 1e-6 ? dx / dist0 : 1;
            const v = dist0 > 1e-6 ? dy / dist0 : 0;
            const half = minDist / 2;
            state.a.x = clampDot(cx - u * half, min, maxX);
            state.a.y = clampDot(cy - v * half, min, maxY);
            state.b.x = clampDot(cx + u * half, min, maxX);
            state.b.y = clampDot(cy + v * half, min, maxY);
          }

          draw();
          try {
            syncFromDOM();
          } catch {
            /* ignore */
          }
        };

        const burst = () => {
          if (confettiClearTid) {
            window.clearTimeout(confettiClearTid);
            confettiClearTid = 0;
          }
          confetti.innerHTML = "";
          let maxMs = 0;
          const count = 28;
          for (let i = 0; i < count; i += 1) {
            const p = document.createElement("span");
            p.className = "scribble-game-piece";
            p.style.setProperty("--x", `${(Math.random() * 2 - 1).toFixed(3)}`);
            p.style.setProperty("--y", `${(Math.random() * 2 - 1).toFixed(3)}`);
            const dMs = 1250 + Math.random() * 1100;
            maxMs = Math.max(maxMs, dMs);
            p.style.setProperty("--d", `${dMs.toFixed(0)}ms`);
            const h = Math.floor(Math.random() * 360);
            const s = 72 + Math.floor(Math.random() * 25);
            const l = 48 + Math.floor(Math.random() * 22);
            p.style.setProperty("--piece-bg", `hsl(${h} ${s}% ${l}%)`);
            p.style.boxShadow = `0 0 8px hsla(${h}, 85%, 58%, 0.55)`;
            // Ensure the animation runs even if CSS/overrides interfere.
            p.style.animation = `scribble-confetti ${dMs.toFixed(
              0
            )}ms ease-out forwards`;
            p.style.setProperty("--r", `${(Math.random() * 360).toFixed(0)}deg`);
            p.style.opacity = "0.95";
            confetti.appendChild(p);
          }
          confettiClearTid = window.setTimeout(() => {
            confetti.innerHTML = "";
            confettiClearTid = 0;
          }, maxMs + 150);
        };

        const checkWin = () => {
          /* Touching circles: center distance ≤ r+r (radius is half visual dot size). Older `2r-3`
             required overlap and often never fired when dots only “kissed” on screen. */
          const threshold = state.radius * 2 + 0.5;
          const dx = state.a.x - state.b.x;
          const dy = state.a.y - state.b.y;
          const d = Math.hypot(dx, dy);
          if (!winArmed) return;
          if (
            typeof state.gameStartTime === "number" &&
            Date.now() - state.gameStartTime < 500
          ) {
            return;
          }
          if (moveCount < 1) return;
          if (state.won) return;
          if (d <= threshold) {
            movedOnKeyDown.clear();
            state.won = true;
            state.finished = true;
            state.active = false;
            // Keep user on this slide briefly after win (avoid accidental arrow-page switch).
            lockGuestbookArrowNav();
            scribbleArena.classList.add("is-game-done");
            scribbleArena.classList.remove("is-game-active");
            playBtn.textContent = "Play again";
            playBtn.setAttribute("aria-label", "Play mini game again");
            try {
              playBtn.blur();
            } catch {
              /* ignore */
            }
            note.classList.add("is-visible");
            // Force visibility (beat `display:none` / opacity from setGame + any !important rules).
            note.style.setProperty("display", "block", "important");
            note.style.setProperty("opacity", "1", "important");
            note.style.setProperty("visibility", "visible", "important");
            note.style.setProperty("z-index", "1", "important");
            note.style.pointerEvents = "none";
            backBtn.textContent = "Reset";
            backBtn.setAttribute(
              "aria-label",
              "Reset to drifting dots; only Play stays to start again"
            );
            backBtn.hidden = false;
            burst();
            confetti.style.setProperty("display", "block", "important");
            confetti.style.setProperty("opacity", "1", "important");
            confetti.style.setProperty("visibility", "visible", "important");
          }
        };

        const setGame = (on) => {
          if (on) {
            try {
              syncFromDOM();
            } catch {
              /* ignore */
            }
          }
          if (on && document.activeElement) {
            try {
              document.activeElement.blur();
            } catch {
              /* ignore */
            }
          }
          movedOnKeyDown.clear();
          winArmed = false;
          if (on) {
            moveCount = 0;
            activationTs = Date.now();
            state.gameStartTime = Date.now();
          }

          state.active = on;
          if (on) {
            state.finished = false;
            state.won = false;
          } else {
            state.finished = false;
            state.won = false;
          }
          scribbleArena.classList.toggle("is-game-active", on);
          scribbleArena.classList.remove("is-game-done");
          if (confettiClearTid) {
            window.clearTimeout(confettiClearTid);
            confettiClearTid = 0;
          }
          note.classList.remove("is-visible");
          note.style.setProperty("display", "none", "important");
          note.style.setProperty("opacity", "0", "important");
          note.style.removeProperty("visibility");
          note.style.removeProperty("z-index");
          confetti.innerHTML = "";
          confetti.style.removeProperty("display");
          confetti.style.removeProperty("opacity");
          confetti.style.removeProperty("visibility");
          playBtn.textContent = on ? "Reset" : "Play";
          playBtn.setAttribute(
            "aria-label",
            on ? "Reset mini game" : "Play mini game"
          );
          if (!on) {
            backBtn.hidden = true;
          } else {
            backBtn.textContent = "Play again";
            backBtn.setAttribute("aria-label", "Play mini game again");
            backBtn.hidden = false;
          }
          if (on) {
            const ta = document.getElementById("gbNote");
            if (ta && document.activeElement === ta) ta.blur();
            const captureStartAndBlur = () => {
              state.start = {
                a: { x: state.a.x, y: state.a.y },
                b: { x: state.b.x, y: state.b.y },
              };
              lastGameToggleTs = Date.now();
              resetReady = true;
              queueMicrotask(() => {
                try {
                  playBtn.blur();
                } catch {
                  /* ignore */
                }
              });
            };

            resetReady = false;
            requestAnimationFrame(() => {
              try {
                resetDots();
              } catch {
                /* ignore */
              }
              captureStartAndBlur();
            });
          }
          if (!on) {
            try {
              dotA.style.transform = "";
              dotB.style.transform = "";
            } catch {
              /* ignore */
            }
          }
        };

        const resumeAfterWin = () => {
          movedOnKeyDown.clear();
          state.active = true;
          state.finished = false;
          state.won = false;
          state.gameStartTime = Date.now();
          winArmed = false;
          moveCount = 0;
          activationTs = Date.now();
          resetReady = false;

          scribbleArena.classList.add("is-game-active");
          scribbleArena.classList.remove("is-game-done");

          if (confettiClearTid) {
            window.clearTimeout(confettiClearTid);
            confettiClearTid = 0;
          }
          note.classList.remove("is-visible");
          note.style.setProperty("display", "none", "important");
          note.style.setProperty("opacity", "0", "important");
          note.style.removeProperty("visibility");
          note.style.removeProperty("z-index");
          confetti.innerHTML = "";
          confetti.style.removeProperty("display");
          confetti.style.removeProperty("opacity");
          confetti.style.removeProperty("visibility");

          backBtn.hidden = false;
          backBtn.textContent = "Play again";
          backBtn.setAttribute(
            "aria-label",
            "Play mini game again (restart controls)"
          );
          playBtn.textContent = "Reset";
          playBtn.setAttribute("aria-label", "Reset mini game");

          resetDots();
          lastGameToggleTs = Date.now();
          resetReady = true;

          queueMicrotask(() => {
            try {
              playBtn.blur();
            } catch {
              /* ignore */
            }
          });
        };

        /** After win: Reset → idle (CSS drift, no keyboard); only “Play” shows. */
        const exitWinToIdle = () => {
          movedOnKeyDown.clear();
          winArmed = false;
          moveCount = 0;
          state.active = false;
          state.finished = false;
          state.won = false;
          activationTs = Date.now();
          state.gameStartTime = Date.now();
          resetReady = true;
          lockGuestbookArrowNav();

          scribbleArena.classList.remove("is-game-active", "is-game-done");

          if (confettiClearTid) {
            window.clearTimeout(confettiClearTid);
            confettiClearTid = 0;
          }
          confetti.innerHTML = "";
          confetti.style.removeProperty("display");
          confetti.style.removeProperty("opacity");
          confetti.style.removeProperty("visibility");

          note.classList.remove("is-visible");
          note.style.setProperty("display", "none", "important");
          note.style.setProperty("opacity", "0", "important");
          note.style.removeProperty("visibility");
          note.style.removeProperty("z-index");

          try {
            dotA.style.transform = "";
            dotB.style.transform = "";
          } catch {
            /* ignore */
          }

          backBtn.hidden = true;
          backBtn.textContent = "Reset";
          backBtn.setAttribute("aria-label", "Reset to initial state");
          playBtn.textContent = "Play";
          playBtn.setAttribute("aria-label", "Play mini game");
          lastGameToggleTs = Date.now();
        };

        let lastPlayPointerTs = 0;
        playBtn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          lastPlayPointerTs = Date.now();
          forceCancelRailDrag();

          const isGameActive = scribbleArena.classList.contains("is-game-active");
          if (!isGameActive) {
            const isGameDone =
              scribbleArena.classList.contains("is-game-done") || state.finished;
            if (isGameDone) {
              resumeAfterWin();
            } else {
              setGame(true);
            }
            return;
          }
          // Active-state "Reset" should exit back to idle (CSS drift; only "Play").
          exitWinToIdle();
        });

        playBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          forceCancelRailDrag();
          if (Date.now() - lastPlayPointerTs < 220) return;

          const isGameActive = scribbleArena.classList.contains("is-game-active");
          if (!isGameActive) {
            const isGameDone =
              scribbleArena.classList.contains("is-game-done") || state.finished;
            if (isGameDone) {
              resumeAfterWin();
            } else {
              setGame(true);
            }
            return;
          }
          // Active-state "Reset" should exit back to idle (CSS drift; only "Play").
          exitWinToIdle();
        });

        let lastBackPointerTs = 0;
        const onBack = () => {
          // Reset always returns to idle (CSS drift; only "Play"), whether mid-game or after win.
          movedOnKeyDown.clear();
          winArmed = false;
          exitWinToIdle();
        };

        backBtn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          lastBackPointerTs = Date.now();
          forceCancelRailDrag();
          onBack();
        });

        backBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          forceCancelRailDrag();
          if (Date.now() - lastBackPointerTs < 220) return;
          onBack();
        });

        window.addEventListener(
          "keydown",
          (e) => {
            if (!scribbleArena.classList.contains("is-game-active")) return;
            if (state.finished) return;
            if (Date.now() - lastGameToggleTs < 120) return;
            if (e.repeat) return;

            if (!state.active) {
              state.active = true;
              state.finished = false;
              try {
                syncFromDOM();
              } catch {
                /* ignore */
              }
            }
            if (document.activeElement === playBtn) {
              try {
                playBtn.blur();
              } catch {
                /* ignore */
              }
            }
            if (
              document.activeElement &&
              document.activeElement.id === "gbNote" &&
              document.activeElement.tagName === "TEXTAREA"
            ) {
              return;
            }
            const code = normalizeGameKeyCode(e);
            if (!code) return;
            if (e.isComposing || e.key === "Process" || e.keyCode === 229) {
              return;
            }
            movedOnKeyDown.add(code);
            if (applyScribbleKeyStep(code)) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
            } else {
              movedOnKeyDown.delete(code);
            }
          },
          true
        );

        window.addEventListener(
          "keyup",
          (e) => {
            if (!scribbleArena.classList.contains("is-game-active")) return;
            if (state.finished) return;
            if (
              typeof state.gameStartTime === "number" &&
              Date.now() - state.gameStartTime < 500
            ) {
              return;
            }
            if (
              document.activeElement &&
              document.activeElement.id === "gbNote" &&
              document.activeElement.tagName === "TEXTAREA"
            ) {
              return;
            }
            const code = normalizeGameKeyCode(e);
            if (!code) return;
            if (movedOnKeyDown.delete(code)) return;
            if (applyScribbleKeyStep(code)) {
              e.preventDefault();
              e.stopPropagation();
            }
          },
          true
        );

        onGuestbookScribbleResize = () => {
          reflowAfterResize();
        };
      }

      const gbRead = gbSlide.querySelector(".guestbook-read");
      const gbFrame = gbSlide.querySelector(".guestbook-frame");
      if (gbRead && gbFrame) {
        bindInformationGroup([
          ...gbRead.querySelectorAll(":scope > *"),
          gbFrame,
        ]);
      }

      /* Letter panel + storage: needs `g` when ScrollTrigger path runs below */
      const slideInner = gbSlide.querySelector(".slide__inner--guestbook");
      const letterPanel = gbSlide.querySelector("#guestbookLetterPanel");
      const thanksEl = gbSlide.querySelector("#guestbookThanks");
      const stage = gbSlide.querySelector(".guestbook-stage");
      const envelope = gbSlide.querySelector("#guestbookEnvelope");
      const compose = gbSlide.querySelector("#guestbookCompose");
      const ta = gbSlide.querySelector("#gbNote");
      const wall = gbSlide.querySelector("#guestbookWall");
      const closeWriteBtn = gbSlide.querySelector("#guestbookCloseWrite");
      const thanksBackBtn = gbSlide.querySelector("#guestbookThanksBack");

      if (
        slideInner &&
        letterPanel &&
        thanksEl &&
        thanksBackBtn &&
        stage &&
        envelope &&
        compose &&
        ta &&
        wall
      ) {
        const applyImmediateStyles = (target, vars) => {
          if (!target || !vars) return;
          if (typeof vars.autoAlpha === "number") {
            target.style.opacity = String(vars.autoAlpha);
            target.style.visibility = vars.autoAlpha <= 0 ? "hidden" : "visible";
          }
          const transforms = [];
          if (typeof vars.y === "number") transforms.push(`translateY(${vars.y}px)`);
          if (typeof vars.rotate === "number") transforms.push(`rotate(${vars.rotate}deg)`);
          if (typeof vars.scale === "number") transforms.push(`scale(${vars.scale})`);
          if (transforms.length) target.style.transform = transforms.join(" ");
        };
        const gbSet = (target, vars) => {
          if (g) {
            g.set(target, vars);
            return;
          }
          applyImmediateStyles(target, vars);
        };
        const gbKill = (target) => {
          if (g) g.killTweensOf(target);
        };
        const gbTo = (target, vars) => {
          if (g) {
            g.to(target, vars);
            return;
          }
          applyImmediateStyles(target, vars);
          if (typeof vars?.onComplete === "function") {
            queueMicrotask(vars.onComplete);
          }
        };
        const gbFromTo = (target, fromVars, toVars) => {
          if (g) {
            g.fromTo(target, fromVars, toVars);
            return;
          }
          applyImmediateStyles(target, fromVars);
          applyImmediateStyles(target, toVars);
          if (typeof toVars?.onComplete === "function") {
            queueMicrotask(toVars.onComplete);
          }
        };

        const blurFocusInsideLetterPanel = () => {
          const active = document.activeElement;
          if (active && letterPanel.contains(active)) {
            active.blur();
          }
        };

        slideInner.classList.remove("is-writing", "is-thanks");
        letterPanel.hidden = true;
        letterPanel.setAttribute("aria-hidden", "true");
        thanksEl.hidden = true;
        compose.setAttribute("aria-hidden", "true");
        envelope.classList.remove("is-open");
        envelope.setAttribute("aria-expanded", "false");

        const GB_NOTES_KEY = "guestbook.notes.v1";
        const GB_DRAFT_KEY = "guestbook.draft.v1";
        const hasGuestbookStorage = (() => {
          try {
            const probe = "__gb_probe__";
            window.localStorage.setItem(probe, "1");
            window.localStorage.removeItem(probe);
            return true;
          } catch {
            return false;
          }
        })();
        const readStoredNotes = () => {
          if (!hasGuestbookStorage) return [];
          try {
            const raw = window.localStorage.getItem(GB_NOTES_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed)
              ? parsed.filter((x) => typeof x === "string" && x.trim().length)
              : [];
          } catch {
            return [];
          }
        };
        const writeStoredNotes = (notes) => {
          if (!hasGuestbookStorage) return;
          try {
            window.localStorage.setItem(GB_NOTES_KEY, JSON.stringify(notes));
          } catch {
            /* ignore */
          }
        };
        const readDraft = () => {
          if (!hasGuestbookStorage) return "";
          try {
            return window.localStorage.getItem(GB_DRAFT_KEY) || "";
          } catch {
            return "";
          }
        };
        const writeDraft = (value) => {
          if (!hasGuestbookStorage) return;
          try {
            window.localStorage.setItem(GB_DRAFT_KEY, value || "");
          } catch {
            /* ignore */
          }
        };

        gbSet(compose, { autoAlpha: 0, y: 6 });
        gbSet(wall, { autoAlpha: 0.62, scale: 0.997 });
        gbSet(thanksEl, { autoAlpha: 0 });

        let phase = "idle";
        let floatStripSeq = 0;
        let barrageRoot = document.getElementById("guestbookBarrage");
        if (!barrageRoot) {
          barrageRoot = document.createElement("div");
          barrageRoot.id = "guestbookBarrage";
          barrageRoot.className = "guestbook-barrage";
          barrageRoot.setAttribute("aria-hidden", "true");
          document.body.appendChild(barrageRoot);
        }

        const syncBarrageVisibility = () => {
          const onGuestbook =
            guestbookSlideIndex >= 0 && index === guestbookSlideIndex;
          const show = phase === "thanks" && onGuestbook;
          barrageRoot.classList.toggle("is-visible", show);

          document.body.classList.toggle(
            "is-guestbook-writing",
            phase === "writing" && onGuestbook
          );
        };

        function addFloatStrip(raw, options) {
          if (!barrageRoot || !raw) return;
          const opts = { persist: true, ...options };
          const text = String(raw).trim();
          if (!text) return;
          if (opts.persist) {
            const list = readStoredNotes();
            list.push(text);
            writeStoredNotes(list.slice(-120));
          }
          const shown = text.length > 80 ? `${text.slice(0, 77)}…` : text;
          const idx = floatStripSeq;
          floatStripSeq += 1;
          const strip = document.createElement("div");
          strip.className = "guestbook-float-strip";
          strip.textContent = shown;
          const row = idx % 2;
          strip.style.setProperty("--gf-row", String(row));
          strip.style.setProperty("--gf-dur", `${17 + (idx % 6) * 1.85}s`);
          strip.style.setProperty("--gf-delay", `${(idx % 5) * 0.55}s`);
          strip.style.zIndex = String(10 + idx);
          if (prefersReduced()) {
            strip.classList.add("guestbook-float-strip--static");
            strip.style.top = `${8 + row * 30}px`;
          }
          barrageRoot.appendChild(strip);
        }

        function transitionToThanks() {
          blurFocusInsideLetterPanel();
          phase = "thanks";
          forceCancelRailDrag();
          slideInner.classList.remove("is-writing");
          slideInner.classList.add("is-thanks");
          stage.classList.remove("is-open");
          envelope.classList.remove("is-open");
          envelope.setAttribute("aria-expanded", "false");
          letterPanel.hidden = true;
          letterPanel.style.display = "";
          letterPanel.setAttribute("aria-hidden", "true");
          compose.setAttribute("aria-hidden", "true");
          thanksEl.hidden = false;
          gbKill(thanksEl);
          gbFromTo(
            thanksEl,
            { autoAlpha: 0, y: 7, rotate: -0.5 },
            {
              autoAlpha: 1,
              y: 0,
              rotate: 0,
              duration: 0.52,
              ease: "power2.out",
            }
          );
          requestAnimationFrame(() => {
            thanksBackBtn.focus({ preventScroll: true });
          });
          syncBarrageVisibility();
        }

        function backToIdle() {
          if (phase !== "thanks") return;
          phase = "idle";
          syncBarrageVisibility();
          gbKill(thanksEl);

          thanksEl.hidden = true;
          forceCancelRailDrag();
          slideInner.classList.remove("is-thanks");
          gbSet(thanksEl, { autoAlpha: 0 });
          ta.value = "";
          gbSet(compose, { autoAlpha: 0, y: 6 });
          blurFocusInsideLetterPanel();
          letterPanel.hidden = true;
          letterPanel.style.display = "";
          letterPanel.setAttribute("aria-hidden", "true");
          compose.setAttribute("aria-hidden", "true");
          gbSet(wall, { autoAlpha: 0.62, scale: 0.997 });
          envelope.focus({ preventScroll: true });
        }

        function openCompose() {
          if (phase !== "idle") return;
          forceCancelRailDrag();
          phase = "writing";
          syncBarrageVisibility();
          slideInner.classList.remove("is-thanks");
          slideInner.classList.add("is-writing");
          thanksEl.hidden = true;
          gbSet(thanksEl, { autoAlpha: 0 });
          letterPanel.hidden = false;
          letterPanel.style.display = "flex";
          letterPanel.setAttribute("aria-hidden", "false");
          compose.setAttribute("aria-hidden", "false");
          stage.classList.add("is-open");
          envelope.classList.add("is-open");
          envelope.setAttribute("aria-expanded", "true");
          gbKill(compose);
          gbSet(compose, { autoAlpha: 1, y: 0 });
          gbFromTo(
            compose,
            { autoAlpha: 0.94, y: 4 },
            { autoAlpha: 1, y: 0, duration: 0.28, ease: "power2.out" }
          );
          requestAnimationFrame(() => ta.focus());
        }

        function closeCompose() {
          if (phase !== "writing") return;
          phase = "idle";
          syncBarrageVisibility();
          gbKill(compose);

          slideInner.classList.remove("is-writing");
          forceCancelRailDrag();
          stage.classList.remove("is-open");
          envelope.classList.remove("is-open");
          envelope.setAttribute("aria-expanded", "false");
          blurFocusInsideLetterPanel();
          letterPanel.hidden = true;
          letterPanel.style.display = "";
          letterPanel.setAttribute("aria-hidden", "true");
          compose.setAttribute("aria-hidden", "true");
          gbSet(compose, { autoAlpha: 0, y: 6 });
          gbSet(wall, { autoAlpha: 0.62, scale: 0.997 });
          envelope.focus({ preventScroll: true });
        }

        envelope.addEventListener("click", () => {
          if (phase === "writing" && letterPanel.hidden) {
            phase = "idle";
          }
          if (phase === "idle") openCompose();
          else if (phase === "writing") closeCompose();
        });

        closeWriteBtn?.addEventListener("click", () => {
          if (
            phase !== "writing" &&
            !slideInner.classList.contains("is-writing")
          ) {
            return;
          }
          gbKill(compose);
          gbTo(compose, {
            autoAlpha: 0,
            y: 6,
            duration: 0.26,
            ease: "power2.out",
            onComplete: transitionToThanks,
          });
        });

        window.addEventListener(
          "keydown",
          (e) => {
            if (e.key !== "Escape") return;
            if (guestbookSlideIndex < 0 || index !== guestbookSlideIndex) return;
            if (phase !== "writing") return;
            closeCompose();
          },
          true
        );

        compose.addEventListener("submit", (e) => {
          e.preventDefault();
          const text = (ta.value || "").trim();
          if (text) {
            addFloatStrip(text);
            writeDraft("");
          }
          ta.value = "";
          gbKill(compose);
          gbTo(compose, {
            autoAlpha: 0,
            y: 6,
            duration: 0.28,
            ease: "power2.out",
            onComplete: transitionToThanks,
          });
        });

        thanksBackBtn.addEventListener("click", () => {
          backToIdle();
        });

        const savedNotes = readStoredNotes();
        savedNotes.forEach((note) => addFloatStrip(note, { persist: false }));
        const savedDraft = readDraft();
        if (savedDraft) ta.value = savedDraft;
        ta.addEventListener("input", () => {
          writeDraft(ta.value);
        });

        window.addEventListener("scroll", syncBarrageVisibility, { passive: true });
        syncBarrageVisibility();
      }
    }

    if (!g) return;
    const reduced = prefersReduced();

    const siteMeta = document.querySelector(".site-meta");
    if (siteMeta && !reduced) {
      g.fromTo(
        siteMeta,
        { y: 0 },
        {
          y: 2,
          duration: 2.6,
          ease: "power1.inOut",
          yoyo: true,
          repeat: -1,
        }
      );
    }

    if (!railST) {
      console.warn(
        "[story] railST missing after initGSAP — attempting ScrollTrigger refresh."
      );
      try {
        window.ScrollTrigger?.refresh();
      } catch {
        /* ignore */
      }
      if (railTween?.scrollTrigger) {
        railST = railTween.scrollTrigger;
      }
    }

    /** Drag: 0.8–1.0 = more responsive; light GSAP ease (no heavy inertia). */
    const DRAG_SCROLL_MULT = 0.9;
    const DRAG_SMOOTH_DUR = 0.16;
    const dragScrollProxy = { y: window.scrollY };
    const cancelRailDrag = (e) => {
      if (!dragActive) return;
      // Synthesize an "up" to release pointer capture.
      try {
        onRailPointerUp(e);
      } catch {
        dragActive = false;
        rail.classList.remove("is-dragging");
        document.documentElement.classList.remove("is-rail-dragging");
      }
    };

    forceCancelRailDrag = () => {
      dragActive = false;
      try {
        g.killTweensOf(dragScrollProxy);
      } catch {
        /* ignore */
      }
      dragScrollProxy.y = window.scrollY;
      rail.classList.remove("is-dragging");
      document.documentElement.classList.remove("is-rail-dragging");
      try {
        if (lastRailPointerId != null) {
          rail.releasePointerCapture?.(lastRailPointerId);
        }
      } catch {
        /* ignore */
      } finally {
        lastRailPointerId = null;
      }
    };

    const onRailPointerDown = (e) => {
      if (interactionLocked) return;
      if (e.button !== 0) return;
      if (
        e.target?.closest?.('.slide[data-key="guestbook"]') ||
        document.body.classList.contains("is-guestbook-active")
      )
        return;
      const hit = document.elementFromPoint?.(e.clientX, e.clientY);
      if (
        hit?.closest(
          "a, button, input, textarea, select, .dot, .story-nav-arrow, .accent--scribble, .scribble-game-play, .scribble-game-dot, .scribble-game-note, .scribble-game-confetti, .scribble-win-fx"
        )
      )
        return;
      if (
        e.target.closest(
          "a, button, input, textarea, select, .dot, .story-nav-arrow, .accent--scribble, .scribble-game-play, .scribble-game-dot, .scribble-game-note, .scribble-game-confetti, .scribble-win-fx"
        )
      )
        return;
      e.preventDefault();
      dragActive = true;
      dragStartClientX = e.clientX;
      dragStartScrollY = window.scrollY;
      dragScrollProxy.y = window.scrollY;
      lastRailPointerId = e.pointerId ?? null;
      g.killTweensOf(dragScrollProxy);
      rail.classList.add("is-dragging");
      document.documentElement.classList.add("is-rail-dragging");
      rail.setPointerCapture?.(e.pointerId);
    };

    const onRailPointerMove = (e) => {
      if (!dragActive || !railST || interactionLocked) return;
      e.preventDefault();
      const dx = e.clientX - dragStartClientX;
      const rawScroll = dragStartScrollY - dx * DRAG_SCROLL_MULT;
      let y = Math.max(railST.start, Math.min(railST.end, rawScroll));
      if (y !== rawScroll) {
        dragStartScrollY = y;
        dragStartClientX = e.clientX;
      }
      g.to(dragScrollProxy, {
        y,
        duration: DRAG_SMOOTH_DUR,
        ease: EDIT_EASE,
        overwrite: "auto",
        onUpdate: () => window.scrollTo(0, dragScrollProxy.y),
      });
    };

    const onRailPointerUp = (e) => {
      if (!dragActive) return;
      dragActive = false;
      g.killTweensOf(dragScrollProxy);
      dragScrollProxy.y = window.scrollY;
      rail.classList.remove("is-dragging");
      document.documentElement.classList.remove("is-rail-dragging");
      try {
        if (e && e.pointerId !== undefined) rail.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      lastRailPointerId = null;
    };

    if (railST) {
      rail.addEventListener("pointerdown", onRailPointerDown, { passive: false });
      rail.addEventListener("pointermove", onRailPointerMove, { passive: false });
      rail.addEventListener("pointerup", onRailPointerUp);
      rail.addEventListener("pointercancel", onRailPointerUp);
      window.addEventListener("pointerup", onRailPointerUp, true);
      window.addEventListener("pointercancel", onRailPointerUp, true);
      // SAFETY: auto fix stuck drag state.
      window.addEventListener(
        "pointerdown",
        () => {
          if (dragActive) {
            forceCancelRailDrag();
          }
        },
        true
      );
      window.addEventListener("blur", () => onRailPointerUp());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") onRailPointerUp();
      });
    }

    const introInner = document.querySelector('.slide[data-key="introduction"] .slide__inner');
    if (introInner) {
      const els = introInner.querySelectorAll(
        ".slide__eyebrow, .slide__headline, .slide__subhead, .slide__body"
      );
      bindInformationGroup([...els]);
    }

    const aboutSlide = document.querySelector('.slide[data-key="about"]');
    if (aboutSlide) {
      const innerEls = aboutSlide.querySelectorAll(".slide__inner > *");
      const cardEls = aboutSlide.querySelectorAll(".card");
      bindInformationGroup([...innerEls, ...cardEls]);

      const cardsRoot = aboutSlide.querySelector(".cards");
      const cards = [...aboutSlide.querySelectorAll(".card")];
      const aboutTextEls = aboutSlide.querySelectorAll(
        ".slide__inner .slide__eyebrow, .slide__inner .slide__headline, .slide__inner .slide__subhead, .slide__inner .slide__body"
      );
      cardsRoot?.classList.add("cards--interactive");

      const restPose = [
        { x: 0, y: 0, rotation: -5, scale: 1 },
        { x: 14, y: -8, rotation: 2, scale: 1 },
        { x: -10, y: -16, rotation: -1, scale: 1 },
        { x: 8, y: -24, rotation: 4, scale: 1 },
      ];

      requestAnimationFrame(() => {
        cards.forEach((c, i) => {
          const r = restPose[i] || restPose[0];
          g.set(c, { transformOrigin: "50% 80%", ...r, filter: "none", opacity: 0.92 });
        });
      });

      let picked = null;
      const clearPick = () => {
        picked = null;
        cards.forEach((c, i) => {
          const r = restPose[i] || restPose[0];
          g.to(c, {
            x: r.x,
            y: r.y,
            rotation: r.rotation,
            scale: 1,
            opacity: 0.92,
            filter: "none",
            duration: EDIT_DUR,
            ease: EDIT_EASE,
            overwrite: "auto",
          });
        });
        g.to(aboutTextEls, {
          opacity: ACT_MUTED,
          duration: EDIT_DUR,
          ease: EDIT_EASE,
          overwrite: "auto",
        });
      };

      cards.forEach((card, i) => {
        card.addEventListener("mouseenter", () => {
          if (picked) return;
          const r = restPose[i] || restPose[0];
          g.to(card, {
            x: r.x + 4,
            y: r.y - 4,
            rotation: r.rotation + 1.2,
            duration: EDIT_DUR_SHORT,
            ease: EDIT_EASE,
            overwrite: "auto",
          });
        });
        card.addEventListener("mouseleave", () => {
          if (picked) return;
          const r = restPose[i] || restPose[0];
          g.to(card, {
            x: r.x,
            y: r.y,
            rotation: r.rotation,
            duration: EDIT_DUR_SHORT,
            ease: EDIT_EASE,
            overwrite: "auto",
          });
        });
        card.addEventListener("click", () => {
          if (picked === card) {
            clearPick();
            return;
          }
          picked = card;
          cards.forEach((c, j) => {
            if (c === card) {
              g.to(c, {
                x: 6,
                y: -36,
                rotation: 0,
                scale: 1.02,
                opacity: 1,
                filter: "none",
                duration: EDIT_DUR,
                ease: EDIT_EASE,
                overwrite: "auto",
              });
            } else {
              g.to(c, {
                opacity: 0.5,
                filter: "blur(1.2px)",
                scale: 0.99,
                duration: EDIT_DUR,
                ease: EDIT_EASE,
                overwrite: "auto",
              });
            }
          });
          g.to(aboutTextEls, {
            opacity: 1,
            duration: EDIT_DUR,
            ease: EDIT_EASE,
            overwrite: "auto",
          });
        });
      });
    }

    const worksSlide = document.querySelector('.slide[data-key="works"]');
    const showcase = worksSlide?.querySelector(".showcase");
    if (showcase && showcaseItems.length) {
      const preview = document.createElement("div");
      preview.className = "showcase__preview";
      const previewLabel = document.createElement("div");
      previewLabel.className = "showcase__previewLabel";
      preview.appendChild(previewLabel);
      const contentEl = showcase.querySelector(".showcase__content");
      if (contentEl) {
        showcase.insertBefore(preview, contentEl);
      } else {
        showcase.appendChild(preview);
      }
      g.set(preview, { y: 8, autoAlpha: 0 });

      const openPreview = (item) => {
        previewLabel.textContent =
          item.querySelector(".showcase__title")?.textContent?.trim() || "";
        const thumb = item.getAttribute("data-preview-src");
        if (thumb) {
          preview.style.setProperty("--showcase-thumb", `url("${thumb}")`);
          preview.classList.add("showcase__preview--thumb");
        } else {
          preview.style.removeProperty("--showcase-thumb");
          preview.classList.remove("showcase__preview--thumb");
        }
        g.to(preview, {
          autoAlpha: 0.88,
          y: 0,
          duration: EDIT_DUR,
          ease: EDIT_EASE,
          overwrite: "auto",
        });
      };
      const closePreview = () => {
        preview.style.removeProperty("--showcase-thumb");
        preview.classList.remove("showcase__preview--thumb");
        g.to(preview, {
          autoAlpha: 0,
          y: 6,
          duration: EDIT_DUR_SHORT,
          ease: EDIT_EASE,
          overwrite: "auto",
        });
      };

      showcaseItems.forEach((item) => {
        item.addEventListener("mouseenter", () => {
          if (!item.classList.contains("is-active")) return;
          g.to(item, {
            scale: 1.025,
            opacity: 0.42,
            duration: EDIT_DUR_SHORT,
            ease: EDIT_EASE,
            overwrite: "auto",
          });
          openPreview(item);
        });
        item.addEventListener("mouseleave", () => {
          if (!item.classList.contains("is-active")) return;
          g.to(item, {
            scale: 1,
            opacity: 1,
            duration: EDIT_DUR_SHORT,
            ease: EDIT_EASE,
            overwrite: "auto",
          });
          closePreview();
        });
      });

      showcase.addEventListener("mouseleave", closePreview);

      const worksInnerEls = worksSlide.querySelectorAll(".slide__inner > *");
      bindInformationGroup([...worksInnerEls]);
    }

    const hobbiesSlide = document.querySelector('.slide[data-key="hobbies"]');
    const hobbiesSub = hobbiesSlide?.querySelector(".slide__subhead");
    if (hobbiesSub) {
      try {
      const map = {
        Reading: "to slow down",
        Music: "to disappear",
        Sport: "to feel alive",
        Travel: "to get lost",
      };
      hobbiesSub.classList.add("hobbies-subhead");
      const defaultLine = document.createElement("span");
      defaultLine.className = "hobbies-line hobbies-line--default";
      const altLine = document.createElement("span");
      altLine.className = "hobbies-line hobbies-line--alt";
      altLine.setAttribute("aria-live", "polite");
      Object.keys(map).forEach((word, idx) => {
        if (idx > 0) defaultLine.appendChild(document.createTextNode(". "));
        const sp = document.createElement("span");
        sp.className = "hobby-keyword is-hoverable";
        sp.textContent = word;
        sp.dataset.alt = map[word];
        defaultLine.appendChild(sp);
      });
      defaultLine.appendChild(document.createTextNode("."));
      hobbiesSub.textContent = "";
      hobbiesSub.appendChild(defaultLine);
      hobbiesSub.appendChild(altLine);

      const showAlt = (text) => {
        altLine.textContent = text;
        g.to(defaultLine, { opacity: 0, duration: 0.75, ease: EDIT_EASE });
        g.to(altLine, { opacity: 1, duration: 0.75, ease: EDIT_EASE });
      };
      const showDefault = () => {
        g.to(altLine, { opacity: 0, duration: 0.75, ease: EDIT_EASE });
        g.to(defaultLine, { opacity: 1, duration: 0.75, ease: EDIT_EASE });
      };

      defaultLine.querySelectorAll(".hobby-keyword").forEach((kw) => {
        kw.addEventListener("mouseenter", () => showAlt(kw.dataset.alt || ""));
        kw.addEventListener("mouseleave", () => showDefault());
      });

      if (railTween && !prefersReduced()) {
        const hu = wrapTextForTypeReveal(defaultLine, true);
        const hTl = buildTypewriterTimeline(g, hu, TYPEWRITER_STEP_SEC);
        bindTypewriterScrollStart(g, hobbiesSlide, railTween, hTl);
      } else if (prefersReduced()) {
        g.set(defaultLine, { autoAlpha: 1, y: 0 });
      }

      } catch (err) {
        console.warn("[hobbies editorial]", err);
      }
    }

    if (hobbiesSlide) {
      try {
        const hEls = hobbiesSlide.querySelectorAll(
          ".slide__eyebrow, .slide__headline, .monologue-container, .slide__subhead, .slide__body"
        );
        bindInformationGroup([...hEls]);
      } catch (err) {
        console.warn("[hobbies editorial]", err);
      }
    }

    const contactSlide = document.querySelector('.slide[data-key="contact"]');
    const contactInner = contactSlide?.querySelector(".slide__inner");
    if (contactInner) {
      const cEls = contactInner.querySelectorAll(
        ".slide__eyebrow, .slide__headline, .slide__subhead, .slide__body, .contact-item"
      );
      bindInformationGroup([...cEls]);

      const toast = document.createElement("div");
      toast.className = "contact-copy-toast";
      toast.textContent = "Copied";
      contactSlide.appendChild(toast);

      const copyButtons = Array.from(contactInner.querySelectorAll(".contact-copy"));
      copyButtons.forEach((btn) => {
        btn.addEventListener("click", async () => {
          const t = (btn.getAttribute("data-copy") || "").trim();
          if (!t) return;
          try {
            await navigator.clipboard.writeText(t);
          } catch {
            return;
          }
          g.timeline()
            .to(toast, { opacity: 1, duration: 0.5, ease: EDIT_EASE, overwrite: "auto" })
            .to(toast, { opacity: 0, duration: 0.55, ease: EDIT_EASE, delay: 0.9, overwrite: "auto" });
        });
      });

      // --- Contact: Lyric Scroller (left column) ---
      const lyricRoot = contactSlide.querySelector(".contact-lyric-scroller");
      if (lyricRoot) {
        const viewport = lyricRoot.querySelector(".contact-lyric-scroller__viewport");
        const track = lyricRoot.querySelector(".contact-lyric-scroller__track");
        const originalStanzas = Array.from(lyricRoot.querySelectorAll(".lyric-stanza"));
        if (viewport && track && originalStanzas.length) {
          // Duplicate once for seamless looping scroll (no jump back to top).
          // We clone the original stanzas and append them to the track.
          const frag = document.createDocumentFragment();
          originalStanzas.forEach((s) => {
            const c = s.cloneNode(true);
            c.setAttribute("data-clone", "1");
            frag.appendChild(c);
          });
          track.appendChild(frag);

          const stanzas = Array.from(track.querySelectorAll(".lyric-stanza"));
          const ORIGINAL_COUNT = originalStanzas.length;

          let currentIndex = 0;
          let maxTranslate = 0;
          let manualLockUntil = 0;
          let lastWheelTs = 0;
          let playToken = 0;

          const prefers = prefersReduced();

          const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
          const wrap = (n, len) => ((n % len) + len) % len;

          function measure() {
            maxTranslate = Math.max(0, track.scrollHeight - viewport.clientHeight);
          }

          function centerTranslateY(i) {
            const viewportH = viewport.getBoundingClientRect().height;
            const stanzaEl = stanzas[i];
            const stanzaH = stanzaEl.getBoundingClientRect().height || 0;
            const stanzaTop = stanzaEl.offsetTop;
            // Center stanza inside the viewport.
            const desiredTop = stanzaTop - (viewportH - stanzaH) / 2;
            return clamp(desiredTop, 0, maxTranslate);
          }

          function scrollToStanza(i, { immediate = false } = {}) {
            const next = clamp(i, 0, stanzas.length - 1);
            measure();
            const ty = centerTranslateY(next);
            if (immediate) {
              track.style.transition = "none";
              track.style.transform = `translateY(${-ty}px)`;
              requestAnimationFrame(() => {
                track.style.transition = "transform 0.8s ease-in-out";
              });
            } else {
              track.style.transform = `translateY(${-ty}px)`;
            }
          }

          function clearVisuals() {
            stanzas.forEach((st) => {
              st.classList.remove(
                "active",
                "is-current",
                "is-neighbor",
                "is-hold",
                "is-played",
                "is-fading",
                "is-active"
              );
              st.querySelectorAll(".lyric-line").forEach((line) => {
                line.classList.remove("is-revealed", "is-glow");
              });
            });
          }

          function markNeighborhood(centerIdx) {
            stanzas.forEach((st) => st.classList.remove("active", "is-current", "is-neighbor"));
            const len = stanzas.length;
            const i = wrap(centerIdx, len);
            const prev = wrap(i - 1, len);
            const next = wrap(i + 1, len);
            stanzas[i].classList.add("active");
            stanzas[i].classList.add("is-current");
            if (prev !== i) stanzas[prev].classList.add("is-neighbor");
            if (next !== i) stanzas[next].classList.add("is-neighbor");
          }

          const LINE_STEP_MS = 640; // slower line-by-line reading cadence
          const GLOW_MS = 520; // longer glow duration per line
          const STANZA_NEXT_SCROLL_DELAY_MS = 3200; // keep black longer after stanza fully black
          const NEXT_STANZA_GREY_LEADIN_MS = 900; // next stanza sits grey longer before glow
          const SCROLL_TRANSITION_MS = 1400; // slower stanza-to-stanza transition

          function revealStanzaLines(i, token) {
            const idx = clamp(i, 0, stanzas.length - 1);
            const stanza = stanzas[idx];
            const lines = Array.from(stanza.querySelectorAll(".lyric-line"));
            if (!lines.length) return;

            markNeighborhood(idx);
            stanza.classList.remove("is-played", "is-fading");

            // Ensure this stanza starts from grey for unplayed state.
            lines.forEach((line) => {
              line.classList.remove("is-revealed", "is-glow");
            });

            let k = 0;
            const tick = () => {
              if (playToken !== token) return;
              const line = lines[k];
              if (!line) return;

              line.classList.add("is-revealed", "is-glow");
              window.setTimeout(() => {
                if (playToken !== token) return;
                line.classList.remove("is-glow");
              }, GLOW_MS);

              k += 1;
              if (k < lines.length) {
                window.setTimeout(tick, LINE_STEP_MS);
                return;
              }

              // Finished stanza: fully black, then 0.5s later scroll next stanza up.
              stanza.classList.add("is-hold");
              stanza.classList.add("is-played");

              const next = idx + 1;
              window.setTimeout(() => {
                if (playToken !== token) return;
                // When we reach the end of the duplicated list, snap back to the real start
                // (without visible jump) and restart the cycle.
                if (next >= stanzas.length) {
                  clearVisuals();
                  currentIndex = 0;
                  scrollToStanza(0, { immediate: true });
                  window.setTimeout(() => {
                    if (playToken !== token) return;
                    revealStanzaLines(0, token);
                  }, 50);
                  return;
                }

                currentIndex = next;
                scrollToStanza(next);
                // Leaving stanza becomes the "upper neighbor" and fades lighter.
                stanza.classList.remove("is-hold");
                stanza.classList.add("is-fading");
                stanza.classList.remove("is-played");
                markNeighborhood(next);
                // After scroll completes, reveal the next stanza line-by-line.
                window.setTimeout(() => {
                  if (playToken !== token) return;
                  revealStanzaLines(next, token);
                }, SCROLL_TRANSITION_MS);
              }, STANZA_NEXT_SCROLL_DELAY_MS);
            };

            // Ensure current stanza is visible as "all grey" briefly before line-by-line glow.
            window.setTimeout(() => {
              if (playToken !== token) return;
              tick();
            }, NEXT_STANZA_GREY_LEADIN_MS);
          }

          function startPlaybackFrom(i) {
            playToken += 1;
            const token = playToken;
            currentIndex = clamp(i, 0, stanzas.length - 1);

            clearVisuals();

            // Always start at the requested stanza.
            scrollToStanza(currentIndex, { immediate: true });
            markNeighborhood(currentIndex);

            if (prefers) {
              // Reduced motion: reveal everything instantly.
              stanzas.forEach((st) => {
                st.classList.add("is-played");
                st.querySelectorAll(".lyric-line").forEach((line) => {
                  line.classList.add("is-revealed");
                });
              });
              return;
            }

            window.setTimeout(() => {
              if (playToken !== token) return;
              revealStanzaLines(currentIndex, token);
            }, 50);
          }

          function stopPlayback() {
            playToken += 1; // invalidates all scheduled timeouts
          }

          // Wheel override: when hovering the scroller, wheel steps stanzas and pauses auto.
          let hover = false;
          viewport.addEventListener("mouseenter", () => {
            hover = true;
          });
          viewport.addEventListener("mouseleave", () => {
            hover = false;
          });

          viewport.addEventListener(
            "wheel",
            (e) => {
              if (!hover || prefers) return;
              const now = Date.now();
              if (now - lastWheelTs < 650) return;
              lastWheelTs = now;
              manualLockUntil = now + 6500;
              const dir = e.deltaY > 0 ? 1 : -1;
              startPlaybackFrom(currentIndex + dir);
            },
            { passive: true }
          );

          // Init
          clearVisuals();
          scrollToStanza(0, { immediate: true });
          markNeighborhood(0);

          // Auto-play only when the contact slide enters the rail viewport.
          if (railTween && window.ScrollTrigger) {
            window.ScrollTrigger.create({
              trigger: contactSlide,
              containerAnimation: railTween,
              start: "left 60%",
              onEnter: () => startPlaybackFrom(0),
              onEnterBack: () => startPlaybackFrom(0),
              onLeave: stopPlayback,
              onLeaveBack: stopPlayback,
            });
          } else if (!prefers) {
            startPlaybackFrom(0);
          }
        }
      }
    }

    const introSlide = document.querySelector('.slide[data-key="introduction"]');
    if (introSlide) {
      const zoneWrap = document.createElement("div");
      zoneWrap.className = "intro-zones lion-circle-container";
      const z1 = document.createElement("div");
      z1.className = "intro-zone";
      z1.dataset.hint = "The margins are deliberate.";
      const z2 = document.createElement("div");
      z2.className = "intro-zone";
      z2.dataset.hint = "Nothing here asks for urgency.";
      zoneWrap.appendChild(z1);
      zoneWrap.appendChild(z2);
      const hint = document.createElement("div");
      hint.className = "intro-zone-hint";
      introSlide.appendChild(zoneWrap);
      introSlide.appendChild(hint);

      const showHint = (t) => {
        hint.textContent = t;
        hint.classList.add("is-visible");
      };
      const hideHint = () => hint.classList.remove("is-visible");
      [z1, z2].forEach((z) => {
        z.addEventListener("mouseenter", () => showHint(z.dataset.hint || ""));
        z.addEventListener("mouseleave", hideHint);
      });

      const introRing = introSlide.querySelector(".accent--ring");
      const introRingMedia = introSlide.querySelector(".accent--ring__video");
      const introIsVideo = introRingMedia instanceof HTMLVideoElement;
      let introSoundEngaged = false;
      const setIntroRingHover = (on) => {
        const showGlow = on || introSoundEngaged;
        if (introRing) introRing.classList.toggle("accent--ring--intro-hover", showGlow);
        if (!introRingMedia || !introIsVideo) return;
        if (on) {
          introRingMedia.play().catch(() => {});
        } else if (!introSoundEngaged) {
          introRingMedia.pause();
          introRingMedia.currentTime = 0;
        }
      };
      zoneWrap.addEventListener("mouseenter", () => {
        introSlide.classList.add("is-lion-circle-hover");
        setIntroRingHover(true);
      });
      zoneWrap.addEventListener("mouseleave", () => {
        introSlide.classList.remove("is-lion-circle-hover");
        setIntroRingHover(false);
      });
      zoneWrap.addEventListener("click", () => {
        if (!introRingMedia) return;
        introSoundEngaged = true;
        if (introIsVideo) {
          introRingMedia.muted = false;
          introRingMedia.play().catch(() => {});
        }
        if (introRing) introRing.classList.add("accent--ring--intro-hover");
      });

      introMediaState.resetLeavingSlide = () => {
        introSoundEngaged = false;
        introSlide.classList.remove("is-lion-circle-hover");
        if (introRing) introRing.classList.remove("accent--ring--intro-hover");
        if (introRingMedia && introIsVideo) {
          introRingMedia.pause();
          introRingMedia.currentTime = 0;
          introRingMedia.muted = true;
        }
      };
    }
  }

  /**
   * Split text into inline spans (L→R) for scroll-scrubbed “typing / ghost” reveal.
   * @param {HTMLElement} root
   * @param {boolean} byWord
   * @returns {HTMLElement[]}
   */
  function wrapTextForTypeReveal(root, byWord) {
    const units = [];
    if (!root) return units;
    const queue = [];
    const collect = (node) => {
      node.childNodes.forEach((ch) => {
        if (ch.nodeType === Node.TEXT_NODE) {
          if (ch.textContent.length) queue.push(ch);
        } else if (ch.nodeType === Node.ELEMENT_NODE && ch.tagName !== "SCRIPT") {
          if (ch.tagName === "BR") return;
          collect(ch);
        }
      });
    };
    collect(root);
    queue.forEach((textNode) => {
      let t = textNode.textContent;
      if (byWord) {
        /* Collapse pretty-print / newlines so “\n + indent” never becomes a pre-wrapped whitespace span. */
        t = t.replace(/\s+/g, " ").trim();
        if (!t.length) {
          textNode.remove();
          return;
        }
      }
      const parent = textNode.parentNode;
      if (!parent) return;
      const chunks = byWord ? t.match(/\S+|\s+/g) || [t] : Array.from(t);
      const frag = document.createDocumentFragment();
      chunks.forEach((chunk) => {
        /* Whitespace must stay real text nodes: space-only inline-blocks often collapse to 0 width → glued words. */
        if (/^\s+$/.test(chunk)) {
          frag.appendChild(document.createTextNode(" "));
          return;
        }
        const span = document.createElement("span");
        span.className = "type-reveal__unit";
        span.textContent = chunk;
        frag.appendChild(span);
        units.push(span);
      });
      parent.replaceChild(frag, textNode);
    });
    return units;
  }

  /**
   * Time-based typewriter: each unit fades in on a fixed stagger (not scrubbed to horizontal scroll).
   * Whitespace-only units stay visible for spacing.
   */
  /**
   * Appends typewriter tweens onto an existing timeline at `atTime` (no nested paused child timelines).
   * Returns the time where the next block can start.
   */
  function appendTypewriterToTimeline(g, tl, units, stepSec, atTime, fromX = TYPEWRITER_FROM_X_EM) {
    units.forEach((u) => {
      if (!u.textContent.trim()) g.set(u, { autoAlpha: 1, x: 0 });
    });
    const meaningful = units.filter((u) => u.textContent.trim().length);
    if (!meaningful.length) return atTime;
    g.set(meaningful, { autoAlpha: 0, x: fromX });
    const dur = Math.max(0.045, Math.min(0.11, stepSec * 1.05));
    meaningful.forEach((u, i) => {
      tl.fromTo(
        u,
        { autoAlpha: 0, x: fromX },
        {
          autoAlpha: 1,
          x: 0,
          duration: dur,
          ease: "power2.out",
        },
        atTime + i * stepSec
      );
    });
    return atTime + (meaningful.length - 1) * stepSec + dur;
  }

  function buildTypewriterTimeline(g, units, stepSec) {
    const tl = g.timeline({ paused: true });
    appendTypewriterToTimeline(g, tl, units, stepSec, 0);
    if (!tl.duration()) {
      tl.kill();
      return null;
    }
    return tl;
  }

  /** Play typewriter once when the slide crosses into view (horizontal rail), independent of scrub position. */
  function bindTypewriterScrollStart(g, slide, railTween, timeline) {
    if (!railTween || !timeline || !timeline.duration()) return;
    let played = false;
    window.ScrollTrigger.create({
      trigger: slide,
      containerAnimation: railTween,
      start: "left 72%",
      onEnter: () => {
        if (played) return;
        played = true;
        timeline.restart(true);
      },
    });
  }

  /** Time-based typewriter; intro auto-plays, other slides play on first enter. Reduced motion: show copy immediately. */
  function initSlideTextReveal(slide, railTween) {
    const g = window.gsap;
    const inner = slide.querySelector(".slide__inner");
    if (!inner) return;

    const key = slide.dataset.key;
    const step = TYPEWRITER_STEP_SEC;

    if (prefersReduced()) {
      if (key === "introduction") {
        const headline = inner.querySelector(".slide__headline");
        const subhead = inner.querySelector(".slide__subhead");
        const eyebrow = inner.querySelector(".slide__eyebrow");
        const bodies = inner.querySelectorAll(".slide__body");
        [eyebrow, headline, subhead, ...bodies].forEach((el) => {
          if (el) g.set(el, { autoAlpha: 1, y: 0 });
        });
      } else {
        g.set(inner, { autoAlpha: 1, y: 0, scale: 1 });
      }
      return;
    }

    if (key === "introduction") {
      const gapB = 0.1;

      const eyebrow = inner.querySelector(".slide__eyebrow");
      const headline = inner.querySelector(".slide__headline");
      const subhead = inner.querySelector(".slide__subhead");

      const master = g.timeline({ paused: true });

      if (eyebrow) {
        g.set(eyebrow, { autoAlpha: 1, y: 0 });
      }

      let t = 0;
      if (headline) {
        const headUnits = wrapTextForTypeReveal(headline, true);
        if (headUnits.length) {
          t = appendTypewriterToTimeline(g, master, headUnits, step, t);
        } else {
          g.set(headline, { autoAlpha: 1, y: 0 });
        }
        t += 0.12;
      }

      let anySeq = Boolean(headline);
      if (subhead) {
        anySeq = true;
        const u = wrapTextForTypeReveal(subhead, true);
        t = appendTypewriterToTimeline(g, master, u, step, t);
      }
      const typingWrap = inner.querySelector(".typing-wrapper");
      if (typingWrap) {
        if (anySeq) t += gapB;
        const u = wrapTextForTypeReveal(typingWrap, true);
        t = appendTypewriterToTimeline(g, master, u, step, t, 0);
      } else {
        inner.querySelectorAll(".slide__body").forEach((body) => {
          if (anySeq) t += gapB;
          anySeq = true;
          const u = wrapTextForTypeReveal(body, true);
          t = appendTypewriterToTimeline(g, master, u, step, t);
        });
      }

      playIntroTypewriter = () => master.restart(true);
      return;
    }

    if (key === "about") {
      const eyebrow = inner.querySelector(".slide__eyebrow");
      const headline = inner.querySelector(".slide__headline");
      const bodies = inner.querySelectorAll(".slide__body");
      [eyebrow, headline, ...bodies].forEach((el) => {
        if (el) g.set(el, { autoAlpha: 1, y: 0 });
      });
      return;
    }

    const skipSubhead = key === "hobbies";
    const blocks = [
      { sel: ".slide__eyebrow", skip: false },
      { sel: ".slide__headline", skip: false },
      { sel: ".slide__subhead", skip: skipSubhead },
      { sel: ".slide__body", skip: false, multi: true },
      { sel: ".story-link", skip: false },
    ];

    const slideMaster = g.timeline({ paused: true });
    let t = 0;
    let anyBlock = false;
    blocks.forEach((b) => {
      if (b.skip) return;
      const nodes = b.multi
        ? [...inner.querySelectorAll(b.sel)]
        : (() => {
            const n = inner.querySelector(b.sel);
            return n ? [n] : [];
          })();
      nodes.forEach((el) => {
        const u = wrapTextForTypeReveal(el, true);
        if (!u.some((x) => x.textContent.trim())) return;
        if (anyBlock) t += 0.1;
        anyBlock = true;
        t = appendTypewriterToTimeline(g, slideMaster, u, step, t);
      });
    });
    bindTypewriterScrollStart(g, slide, railTween, slideMaster);
  }

  function initGSAP() {
    if (!window.gsap || !window.ScrollTrigger) return false;
    window.gsap.registerPlugin(window.ScrollTrigger);

    // Horizontal scroll mapping + pin
    railTween = window.gsap.to(rail, {
      x: () => -(total - 1) * window.innerWidth,
      ease: "none",
      scrollTrigger: {
        id: "railAnim",
        trigger: space,
        start: "top top",
        end: () => `+=${window.innerWidth * (total - 1)}`,
        scrub: 0.9,
        pin: true,
        anticipatePin: 1,
        snap: total > 1 ? 1 / (total - 1) : 1,
        onUpdate: (self) => {
          index = clamp(Math.round(self.progress * (total - 1)));
          renderDots();
          syncIntroRingMotion(index === 0);
          refreshStoryNavArrows();
        },
      },
    });

    // Capture the ScrollTrigger so that goTo() works even before user scrolls.
    if (railTween && railTween.scrollTrigger) {
      railST = railTween.scrollTrigger;
    }

    // Per-slide: L→R progressive “typing / float-shadow” on copy (scroll-scrubbed)
    slides.forEach((slide) => {
      initSlideTextReveal(slide, railTween);

      const accent = slide.querySelector(".accent");
      if (accent && slide.dataset.key !== "introduction") {
        window.gsap.fromTo(
          accent,
          { autoAlpha: 0.9, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            ease: EDIT_EASE,
            scrollTrigger: {
              trigger: slide,
              containerAnimation: railTween,
              start: "left 72%",
              end: "left 36%",
              scrub: 0.75,
            },
          }
        );
      }
    });

    const introSlide = document.querySelector('.slide[data-key="introduction"]');
    const introRingAnchor = introSlide?.querySelector(".accent--ring-anchor");
    if (introRingAnchor) {
      window.gsap.fromTo(
        introRingAnchor,
        { autoAlpha: 0.9, y: 14 },
        {
          autoAlpha: 1,
          y: 0,
          ease: EDIT_EASE,
          scrollTrigger: {
            trigger: introSlide,
            containerAnimation: railTween,
            start: "left 72%",
            end: "left 36%",
            scrub: 0.75,
          },
        }
      );

      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        window.gsap.set(introRingAnchor, { scale: 0.99, transformOrigin: "50% 50%" });
        introRingMotion.el = introRingAnchor;
        introRingMotion.breath = window.gsap.to(introRingAnchor, {
          scale: 1.01,
          duration: 3,
          ease: "power1.inOut",
          yoyo: true,
          repeat: -1,
        });
        introRingMotion.breath.pause();

        const maxNudge = 4;
        window.addEventListener(
          "mousemove",
          (e) => {
            if (index !== 0 || !introRingMotion.el) return;
            const nx = (e.clientX / window.innerWidth - 0.5) * 2;
            const ny = (e.clientY / window.innerHeight - 0.5) * 2;
            const tx = Math.max(-maxNudge, Math.min(maxNudge, nx * maxNudge));
            const ty = Math.max(-maxNudge, Math.min(maxNudge, ny * maxNudge));
            window.gsap.to(introRingMotion.el, {
              x: tx,
              marginTop: ty,
              duration: 1.1,
              ease: "power2.out",
              overwrite: "auto",
            });
          },
          { passive: true }
        );

        syncIntroRingMotion(index === 0);
      }
    }

    const worksSlide = document.querySelector('.slide[data-key="works"]');
    const showcaseFrame = worksSlide?.querySelector(".showcase__frame");
    if (showcaseFrame) {
      window.gsap.fromTo(
        showcaseFrame,
        { autoAlpha: 0.92 },
        {
          autoAlpha: 1,
          ease: EDIT_EASE,
          scrollTrigger: {
            trigger: worksSlide,
            containerAnimation: railTween,
            start: "left 65%",
            end: "left 30%",
            scrub: 0.8,
          },
        }
      );
    }

    return true;
  }

  function initHobbiesDeskFlip() {
    const flipRoot = document.getElementById("hobbiesDeskFlip");
    const toFront = document.getElementById("hobbiesFlipToFront");
    const backPanel = document.getElementById("hobbiesDeskBackPanel");
    const backImage = document.getElementById("hobbiesBackImage");
    const monologueEl = document.getElementById("typing-monologue");
    const frame = flipRoot?.querySelector(".hobbies-desk__frame");
    if (!flipRoot || !frame || !backImage || !toFront) return;

    const reducedMotionMql = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    const getPetalLayerEl = () => {
      let el = document.getElementById("hobbiesPetalLayer");
      if (!el) {
        el = document.createElement("div");
        el.id = "hobbiesPetalLayer";
        el.className = "hobbies-petal-layer";
        el.setAttribute("aria-hidden", "true");
        document.body.appendChild(el);
      }
      return el;
    };

    /**
     * Pure px transforms (no %/calc) for reliable Web Animations across browsers.
     * Still runs under prefers-reduced-motion, with fewer/shorter particles.
     */
    const burstHobbyPetals = (clientX, clientY) => {
      const layer = getPetalLayerEl();
      const light = reducedMotionMql.matches;
      const colors = [
        "#c9a227",
        "#e8c86e",
        "#ddb8a7",
        "#c4a574",
        "#f0e6d2",
        "#b89a6a",
      ];
      const n = light ? 12 : 28;
      for (let i = 0; i < n; i += 1) {
        const p = document.createElement("span");
        p.className = "hobbies-petal";
        const angle = (Math.PI * 2 * (i + Math.random())) / n;
        const dist = (light ? 40 : 72) + Math.random() * (light ? 55 : 110);
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist + (light ? 12 : 28) + Math.random() * (light ? 24 : 42);
        const rot = (Math.random() - 0.5) * (light ? 240 : 520);
        const w = (light ? 6 : 5) + Math.random() * (light ? 6 : 9);
        const h = (light ? 8 : 7) + Math.random() * (light ? 8 : 11);
        p.style.left = `${clientX - w / 2}px`;
        p.style.top = `${clientY - h / 2}px`;
        p.style.width = `${w}px`;
        p.style.height = `${h}px`;
        p.style.background = colors[i % colors.length];
        layer.appendChild(p);
        const anim = p.animate(
          [
            {
              transform: "translate(0px, 0px) rotate(0deg) scale(1)",
              opacity: 1,
            },
            {
              transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(0.35)`,
              opacity: 0,
            },
          ],
          {
            duration: (light ? 420 : 820) + Math.random() * (light ? 200 : 420),
            delay: Math.random() * (light ? 0 : 60),
            easing: "cubic-bezier(0.22, 0.82, 0.38, 0.97)",
            fill: "forwards",
          }
        );
        anim.onfinish = () => p.remove();
      }
    };

    /** Burst at viewport coords aligned with the right copy column (monologue), not the desk hotspot. */
    const burstHobbyPetalsAtRightColumn = () => {
      const slide = document.querySelector('.slide[data-key="hobbies"]');
      const anchor =
        slide?.querySelector(".monologue-container") ??
        slide?.querySelector(".slide__inner");
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + Math.max(r.height * 0.28, 20);
      burstHobbyPetals(x, y);
    };

    /** After typing completes: burst from end-of-text (fallback: column anchor). */
    const burstHobbyPetalsAtMonologueEnd = () => {
      if (!monologueEl) {
        burstHobbyPetalsAtRightColumn();
        return;
      }
      const text = monologueEl.textContent;
      if (!text.length) {
        burstHobbyPetalsAtRightColumn();
        return;
      }
      const br = monologueEl.getBoundingClientRect();
      let x;
      let y;
      try {
        const range = document.createRange();
        range.selectNodeContents(monologueEl);
        range.collapse(false);
        const rects = range.getClientRects();
        let caret = null;
        if (rects.length > 0) {
          caret = rects[rects.length - 1];
        } else {
          caret = range.getBoundingClientRect();
        }
        range.detach?.();
        x = caret.right;
        y = caret.top + caret.height / 2;
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < br.left - 4 ||
          x > br.right + 24 ||
          y < br.top - 8 ||
          y > br.bottom + 8
        ) {
          x = br.left + br.width * 0.92;
          y = br.top + br.height * 0.5;
        }
      } catch {
        x = br.left + br.width * 0.92;
        y = br.top + br.height * 0.5;
      }
      burstHobbyPetals(x, y);
    };

    const monologues = {
      Book: "Reality is too loud. This is my escape hatch to other worlds.",
      Basketball:
        "The sound of the swish... it's just the wind playing along.",
      Camera:
        "Chasing light to freeze a feeling. Do you want to be in the frame?",
      Speaker: "When the music starts, the world simply fades away.",
      PC: "I believe logic can be poetic. Art is written in 0s and 1s.",
      Hiking:
        "Trails stretch ahead; each tight knot in the laces is a quiet promise to keep walking.",
    };

    /** data-hobby hotspot key → monologues key */
    const hobbyKeyToMonologueItem = {
      books: "Book",
      boots: "Hiking",
      basketball: "Basketball",
      camera: "Camera",
      stereo: "Speaker",
      monitor: "PC",
    };

    let monologueTypeTimer = null;

    const stopMonologueTyping = () => {
      if (monologueTypeTimer != null) {
        clearInterval(monologueTypeTimer);
        monologueTypeTimer = null;
      }
    };

    const resetMonologueUi = () => {
      stopMonologueTyping();
      if (!monologueEl) return;
      monologueEl.textContent = "";
      monologueEl.classList.add("typing-complete");
    };

    const startMonologueTyping = (itemKey) => {
      if (!monologueEl) return;
      const full = monologues[itemKey];
      if (!full) return;
      stopMonologueTyping();
      monologueEl.textContent = "";
      monologueEl.classList.remove("typing-complete");
      let i = 0;
      monologueTypeTimer = setInterval(() => {
        i += 1;
        monologueEl.textContent = full.slice(0, i);
        if (i >= full.length) {
          stopMonologueTyping();
          monologueEl.classList.add("typing-complete");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              burstHobbyPetalsAtMonologueEnd();
            });
          });
        }
      }, 50);
    };

    const hobbiesIdx = slides.findIndex((s) => s.dataset.key === "hobbies");
    onStoryIndexApplied = () => {
      if (hobbiesIdx < 0) return;
      if (index === hobbiesIdx) return;
      resetMonologueUi();
      if (!flipRoot.classList.contains("is-flipped")) return;
      flipRoot.classList.remove("is-flipped");
      backPanel?.setAttribute("aria-hidden", "true");
    };

    /** Paths match files in /Hobbies (user-named assets). */
    const hobbyBackImages = {
      books: "Hobbies/Book.png",
      boots: "Hobbies/Hiking.png",
      monitor: "Hobbies/Vibe coding.png",
      camera: "Hobbies/Photography.png",
      stereo: "Hobbies/Music.png",
      basketball: "Hobbies/Basketball.png",
    };

    /** With object-fit: cover, tune focal point per artwork (y% from image top). */
    const hobbyBackObjectPosition = {
      books: "center 88%",
      boots: "center 30%",
    };

    let lastSpot = null;

    const captionForHobbyKey = (key, spot) => {
      if (key === "books") {
        if (spot?.classList.contains("hobbies-desk__spot--books-desk")) {
          return frame.querySelector(".hobbies-desk__caption--books-desk");
        }
        return frame.querySelector(".hobbies-desk__caption--books-shelf");
      }
      return frame.querySelector(`.hobbies-desk__caption--${key}`);
    };

    /** 翻面大图：启动时即发起解码缓存，点击前 await，避免背面长时间纯黑。 */
    const hobbyDecodeByUrl = new Map();
    const decodeHobbyImage = (src) => {
      if (hobbyDecodeByUrl.has(src)) return hobbyDecodeByUrl.get(src);
      const p = new Promise((resolve) => {
        const im = new Image();
        if ("fetchPriority" in im) im.fetchPriority = "high";
        im.onload = () => {
          if (typeof im.decode === "function") {
            im.decode().then(resolve).catch(resolve);
          } else resolve();
        };
        im.onerror = () => resolve();
        im.src = src;
      });
      hobbyDecodeByUrl.set(src, p);
      return p;
    };
    Object.values(hobbyBackImages).forEach((u) => decodeHobbyImage(u));

    const applyBackContent = (key, spot) => {
      const cap = captionForHobbyKey(key, spot);
      const src = hobbyBackImages[key];
      if (!cap || !src) return false;
      const tag = cap.textContent.trim();
      backImage.alt = tag || "Hobby artwork";
      backImage.style.objectPosition =
        hobbyBackObjectPosition[key] ?? "center center";
      if ("fetchPriority" in backImage) {
        backImage.fetchPriority = "high";
      }
      backImage.src = src;
      return true;
    };

    const setFlipped = (on) => {
      if (!on) {
        resetMonologueUi();
      }
      flipRoot.classList.toggle("is-flipped", on);
      backPanel?.setAttribute("aria-hidden", on ? "false" : "true");
      requestAnimationFrame(() => {
        if (on) {
          toFront?.focus({ preventScroll: true });
        } else if (lastSpot && typeof lastSpot.focus === "function") {
          lastSpot.focus({ preventScroll: true });
        }
      });
    };

    flipRoot.querySelectorAll(".hobbies-desk__spot[data-hobby]").forEach((spot) => {
      spot.addEventListener("click", async () => {
        const key = spot.dataset.hobby;
        if (!key) return;
        const src = hobbyBackImages[key];
        if (src) await decodeHobbyImage(src);
        if (!applyBackContent(key, spot)) return;
        lastSpot = spot;
        setFlipped(true);
        const itemKey = hobbyKeyToMonologueItem[key];
        if (itemKey) {
          startMonologueTyping(itemKey);
        } else {
          resetMonologueUi();
        }
      });
    });

    toFront?.addEventListener("click", (e) => {
      e.preventDefault();
      setFlipped(false);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!flipRoot.classList.contains("is-flipped")) return;
      setFlipped(false);
    });

    resetMonologueUi();
  }

  // Keyboard: horizontal story (don't steal arrows while guestbook mini-game is active)
  window.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const isGuestbookSlide = slides[index]?.dataset?.key === "guestbook";
    if (isGuestbookSlide && Date.now() < guestbookNavLockUntilTs) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (
      document.querySelector(
        '.slide[data-key="guestbook"] .accent--scribble.is-game-active'
      )
    ) {
      return;
    }
    const active = clamp(index + (e.key === "ArrowRight" ? 1 : -1));
    goTo(active);
  });

  setScrollSpace();
  bindStoryLinkMotion();
  const usingGSAP = initGSAP();
  if (usingGSAP && !railST && railTween?.scrollTrigger) {
    railST = railTween.scrollTrigger;
  }
  if (usingGSAP) {
    setupEditorialSystems();
    initStoryNavArrows();
    if (window.ScrollTrigger) {
      window.ScrollTrigger.refresh();
    }
    if (playIntroTypewriter) {
      const hasEnterLoader = Boolean(
        loaderOverlay && loaderBarFill && loaderEnter
      );
      const runIntro = () => playIntroTypewriter();
      if (hasEnterLoader) {
        afterLoaderDismissed = runIntro;
        if (loaderOverlay.classList.contains("is-hidden")) {
          queueMicrotask(runIntro);
        }
      } else {
        requestAnimationFrame(() => {
          requestAnimationFrame(runIntro);
        });
      }
    }
  }
  if (portfolioDeepTarget === "works") {
    afterLoaderDismissed = () => {
      requestAnimationFrame(() => {
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        const wi = slides.findIndex((s) => s.dataset?.key === "works");
        if (wi >= 0) goTo(wi);
      });
    };
  }
  if (!usingGSAP) {
    updateFromScroll();
    window.addEventListener("scroll", updateFromScroll, { passive: true });
  }

  runLoaderInteractPhase = async ({ loaderHintEl, subInteract }) => {
    subInteract(0.06);
    if (loaderHintEl) loaderHintEl.textContent = "Syncing layout…";
    if (window.ScrollTrigger) {
      window.ScrollTrigger.refresh();
    }
    if (railST) {
      window.scrollTo({ top: railST.start, left: 0, behavior: "auto" });
      window.ScrollTrigger.update();
    }
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    subInteract(0.22);

    if (loaderHintEl) loaderHintEl.textContent = "Warming video…";
    await warmIntroVideoPlayback();
    subInteract(0.42);

    if (loaderHintEl) loaderHintEl.textContent = "Warming 3D view…";
    if (window.__photoCorridor3dRendererWarmup) {
      await window.__photoCorridor3dRendererWarmup();
    }
    subInteract(0.52);

    if (loaderHintEl) loaderHintEl.textContent = "Warming portfolio 3D (Draco)…";
    await warmAiModelAssetsForLaterVisit();
    subInteract(0.62);

    if (loaderHintEl) loaderHintEl.textContent = "Warming navigation…";
    if (window.gsap && railST) {
      const g = window.gsap;
      const y = window.scrollY;
      const o = { y };
      await new Promise((resolve) => {
        g.to(o, {
          y,
          duration: 0.02,
          ease: "none",
          onUpdate: () => {
            window.scrollTo(0, o.y);
            if (window.ScrollTrigger) {
              window.ScrollTrigger.update();
            }
          },
          onComplete: resolve,
        });
      });
    }
    if (railST) {
      window.scrollTo({ top: railST.start, left: 0, behavior: "auto" });
      window.ScrollTrigger?.update();
    }
    subInteract(0.82);

    if (loaderHintEl) loaderHintEl.textContent = "Almost ready…";
    await new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
    });
    if (window.ScrollTrigger) {
      window.ScrollTrigger.refresh();
    }
    await new Promise((resolve) => {
      const idle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 64));
      idle(() => resolve());
    });
    subInteract(1);
  };

  try {
    initHobbiesDeskFlip();
  } catch (err) {
    console.warn("[hobbies desk flip init]", err);
  }

  if (typeof runLoaderReadyPipeline === "function") {
    queueMicrotask(() => runLoaderReadyPipeline());
  }

  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      const stProgress =
        usingGSAP && railST && typeof railST.progress === "number"
          ? railST.progress
          : null;
      setScrollSpace();
      if (!usingGSAP) updateFromScroll();
      if (window.ScrollTrigger) {
        window.ScrollTrigger.refresh();
        if (
          usingGSAP &&
          railST &&
          stProgress != null &&
          Number.isFinite(stProgress) &&
          railST.end > railST.start
        ) {
          const y = railST.start + stProgress * (railST.end - railST.start);
          window.scrollTo(0, y);
          window.ScrollTrigger.update();
        }
      }
      onGuestbookScribbleResize?.();
    });
  });
})();

