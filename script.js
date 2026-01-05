(() => {
  const APP_ID = "snakeRoot";
  const HS_KEY = "snake.highscores";

  const clampInt = (n, a, b) => Math.max(a, Math.min(b, n | 0));
  const now = () => Date.now();
  const safeJsonParse = (s) => {
    try { return JSON.parse(s); } catch { return null; }
  };
  const normName = (s) => (String(s ?? "").trim().replace(/\s+/g, " ").slice(0, 24));
  const fmtTime = (t) => {
    try {
      const d = new Date(t);
      return isFinite(d.getTime()) ? d.toLocaleString() : "";
    } catch { return ""; }
  };

  const highscores = {
    load() {
      const raw = (() => { try { return localStorage.getItem(HS_KEY); } catch { return null; } })();
      const parsed = raw ? safeJsonParse(raw) : null;
      const arr = Array.isArray(parsed) ? parsed : [];
      const cleaned = arr
        .map((e) => ({
          name: normName(e && e.name ? e.name : ""),
          score: clampInt(Number(e && e.score), 0, 1_000_000_000),
          ts: clampInt(Number(e && e.timestamp), 0, 9_007_199_254_740_991)
        }))
        .filter((e) => e.score >= 0 && e.ts >= 0)
        .sort((a, b) => (b.score - a.score) || (b.ts - a.ts))
        .slice(0, 10);
      return cleaned;
    },
    save(list) {
      const val = JSON.stringify(Array.isArray(list) ? list : []);
      try { localStorage.setItem(HS_KEY, val); } catch {}
    },
    add(name, score) {
      const list = highscores.load();
      list.push({ name: normName(name) || "Player", score: clampInt(Number(score), 0, 1_000_000_000), ts: now() });
      list.sort((a, b) => (b.score - a.score) || (b.ts - a.ts));
      const top = list.slice(0, 10);
      highscores.save(top);
      return top;
    },
    clear() {
      try { localStorage.removeItem(HS_KEY); } catch {}
    }
  };

  const game = (() => {
    const GRID = 24;
    const START_LEN = 4;
    const START_DIR = { x: 1, y: 0 };
    const BASE_STEP_MS = 120;

    let canvas, ctx, wrap;
    let cssSize = 0;
    let dpr = 1;
    let cell = 1;

    let state = "start";
    let score = 0;

    let snake = [];
    let dir = { ...START_DIR };
    let nextDir = { ...START_DIR };
    let food = { x: 0, y: 0 };

    let accumulator = 0;
    let lastT = 0;
    let rafId = 0;

    const onState = new Set();

    const emit = () => onState.forEach((fn) => fn(getView()));

    const getView = () => ({
      state,
      score,
      grid: GRID
    });

    const resetSnake = () => {
      const mid = (GRID / 2) | 0;
      snake = [];
      for (let i = 0; i < START_LEN; i++) snake.push({ x: mid - i, y: mid });
      dir = { ...START_DIR };
      nextDir = { ...START_DIR };
    };

    const isOccupied = (x, y) => snake.some((p) => p.x === x && p.y === y);

    const spawnFood = () => {
      const empties = [];
      for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (!isOccupied(x, y)) empties.push({ x, y });
      if (!empties.length) return (food = { x: 0, y: 0 });
      const pick = empties[(Math.random() * empties.length) | 0];
      food = { x: pick.x, y: pick.y };
    };

    const startNew = () => {
      score = 0;
      resetSnake();
      spawnFood();
      accumulator = 0;
      lastT = 0;
      state = "playing";
      emit();
    };

    const setPaused = (p) => {
      if (state === "playing" && p) state = "paused";
      else if (state === "paused" && !p) state = "playing";
      emit();
    };

    const setDirection = (dx, dy) => {
      if (state !== "playing") return;
      const nd = { x: dx, y: dy };
      if (nd.x === 0 && nd.y === 0) return;
      if (nd.x === -dir.x && nd.y === -dir.y) return;
      nextDir = nd;
    };

    const step = () => {
      dir = nextDir;
      const head = snake[0];
      const nx = head.x + dir.x;
      const ny = head.y + dir.y;

      const hitWall = nx < 0 || ny < 0 || nx >= GRID || ny >= GRID;
      const hitSelf = snake.some((p, i) => i !== 0 && p.x === nx && p.y === ny);
      if (hitWall || hitSelf) {
        state = "gameover";
        emit();
        return;
      }

      const ate = nx === food.x && ny === food.y;
      snake.unshift({ x: nx, y: ny });
      if (!ate) snake.pop();
      else {
        score += 10;
        spawnFood();
      }
      emit();
    };

    const draw = () => {
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bg = getComputedStyle(document.documentElement).getPropertyValue("--pm-bg").trim();
      const fg = getComputedStyle(document.documentElement).getPropertyValue("--pm-text").trim();
      const muted = getComputedStyle(document.documentElement).getPropertyValue("--pm-muted").trim();

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = muted;
      for (let i = 1; i < GRID; i++) {
        const p = Math.round(i * cell);
        ctx.fillRect(p, 0, 1, canvas.height);
        ctx.fillRect(0, p, canvas.width, 1);
      }

      ctx.fillStyle = fg;
      const pad = Math.max(1, Math.round(cell * 0.12));
      for (let i = 0; i < snake.length; i++) {
        const s = snake[i];
        const x = Math.round(s.x * cell);
        const y = Math.round(s.y * cell);
        const w = Math.round(cell);
        const h = Math.round(cell);
        ctx.fillRect(x + pad, y + pad, w - 2 * pad, h - 2 * pad);
      }

      ctx.fillStyle = fg;
      const fx = Math.round(food.x * cell);
      const fy = Math.round(food.y * cell);
      const fw = Math.round(cell);
      const fh = Math.round(cell);
      const r = Math.max(2, Math.round(cell * 0.22));
      ctx.beginPath();
      ctx.roundRect(fx + r, fy + r, fw - 2 * r, fh - 2 * r, r);
      ctx.fill();
    };

    const tick = (t) => {
      if (!lastT) lastT = t;
      const dt = Math.min(50, t - lastT);
      lastT = t;

      if (state === "playing") {
        accumulator += dt;
        const stepMs = BASE_STEP_MS;
        while (accumulator >= stepMs) {
          accumulator -= stepMs;
          step();
          if (state !== "playing") break;
        }
      }
      draw();
      rafId = requestAnimationFrame(tick);
    };

    const resize = () => {
      if (!wrap || !canvas) return;
      dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const r = wrap.getBoundingClientRect();
      cssSize = Math.max(240, Math.floor(Math.min(r.width, r.height)));
      canvas.style.width = cssSize + "px";
      canvas.style.height = cssSize + "px";
      canvas.width = Math.max(1, Math.floor(cssSize * dpr));
      canvas.height = Math.max(1, Math.floor(cssSize * dpr));
      cell = Math.floor(canvas.width / GRID);
      const px = cell * GRID;
      canvas.width = px;
      canvas.height = px;
      draw();
    };

    const mount = (opts) => {
      canvas = opts.canvas;
      wrap = opts.wrap;
      ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      resize();
      window.addEventListener("resize", resize, { passive: true });
      rafId = requestAnimationFrame(tick);
      emit();
    };

    const destroy = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas = null; ctx = null; wrap = null;
    };

    const setState = (s) => { state = s; emit(); };

    const resetToStart = () => {
      score = 0;
      resetSnake();
      spawnFood();
      accumulator = 0;
      lastT = 0;
      state = "start";
      emit();
    };

    const onStateChange = (fn) => { onState.add(fn); return () => onState.delete(fn); };

    const getSnapshotForSave = () => ({ score });

    return {
      mount,
      destroy,
      startNew,
      resetToStart,
      setPaused,
      setDirection,
      setState,
      getView,
      onStateChange,
      getSnapshotForSave
    };
  })();

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v === null || v === undefined) {}
      else n.setAttribute(k, String(v));
    }
    for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function renderApp(model) {
    const root = document.getElementById("app");
    root.innerHTML = "";
    const app = el("div", { id: APP_ID, class: "pm-stack" });

    const hero = el("section", { id: "game", class: "pm-section hero", "aria-label": "Snake game" });

    const left = el("div", { class: "pm-card pm-stack", style: "gap: var(--pm-4);" }, [
      el("div", { class: "pm-stack", style: "gap: var(--pm-2);" }, [
        el("h1", { class: "pm-h1", id: "snakeTitle", text: model?.game?.title || "Snake" }),
        el("div", { class: "pm-muted", id: "snakeSubtitle", text: model?.game?.subtitle || "Eat, grow, and avoid collisions." })
      ]),
      el("div", { id: "snakeCanvasWrap" }, [
        el("canvas", { id: "snakeCanvas", role: "img", "aria-label": "Snake game board" })
      ])
    ]);

    const right = el("div", { class: "pm-card", id: "snakeHud" });
    const status = el("div", { id: "snakeStatus", class: "pm-muted", role: "status", "aria-live": "polite", "aria-atomic": "true" });
    const scoreRow = el("div", { class: "pm-row pm-row--between pm-row--center" }, [
      el("div", { class: "pm-h3", text: "Score" }),
      el("div", { class: "pm-h2", id: "snakeScore", text: "0" })
    ]);

    const controls = el("div", { id: "snakeControls", "aria-label": "Game controls" }, [
      el("button", { class: "pm-btn pm-btn--primary", id: "snakeStartBtn", type: "button", text: "Start" }),
      el("button", { class: "pm-btn", id: "snakeRestartBtn", type: "button", text: "Restart" }),
      el("button", { class: "pm-btn pm-btn--ghost", id: "snakePauseBtn", type: "button", text: "Pause" })
    ]);

    const help = el("div", { id: "snakeKbd" }, [
      el("div", { class: "pm-h3", text: "Keys" }),
      el("div", { class: "pm-muted", style: "margin-top: var(--pm-2);" }, [
        el("div", {}, [
          el("kbd", { text: "←" }), " ", el("kbd", { text: "↑" }), " ", el("kbd", { text: "→" }), " ", el("kbd", { text: "↓" }),
          " / ",
          el("kbd", { text: "A" }), " ", el("kbd", { text: "W" }), " ", el("kbd", { text: "D" }), " ", el("kbd", { text: "S" })
        ]),
        el("div", { style: "margin-top: var(--pm-2);" }, [el("kbd", { text: "Space" }), " pause/resume"]),
        el("div", { style: "margin-top: var(--pm-2);" }, [el("kbd", { text: "Esc" }), " reset to start"])
      ])
    ]);

    right.appendChild(status);
    right.appendChild(scoreRow);
    right.appendChild(controls);
    right.appendChild(help);

    hero.appendChild(left);
    hero.appendChild(right);

    const hsSection = el("section", { id: "highscores", class: "pm-section pm-stack", style: "gap: var(--pm-4);", "aria-label": "Highscores" }, [
      el("div", { class: "pm-row pm-row--between pm-row--center" }, [
        el("h2", { class: "pm-h2", text: model?.highscores?.title || "Highscores" }),
        el("div", { class: "pm-row pm-row--center", style: "gap: var(--pm-2);" }, [
          el("button", { class: "pm-btn pm-btn--ghost", id: "snakeClearHsBtn", type: "button", text: "Clear" })
        ])
      ]),
      el("div", { class: "pm-card pm-stack", style: "gap: var(--pm-4);" }, [
        el("div", { class: "pm-muted", id: "snakeHsHint", text: model?.highscores?.hint || "Top 10 saved locally in this browser." }),
        el("div", { style: "overflow:auto;" }, [
          el("table", { "aria-label": "Highscores table" }, [
            el("thead", {}, [el("tr", {}, [
              el("th", { scope: "col", text: "#" }),
              el("th", { scope: "col", text: "Name" }),
              el("th", { scope: "col", text: "Score" }),
              el("th", { scope: "col", text: "When" })
            ])]),
            el("tbody", { id: "snakeHsBody" })
          ])
        ])
      ])
    ]);

    app.appendChild(hero);
    app.appendChild(hsSection);
    root.appendChild(app);

    return {
      canvas: document.getElementById("snakeCanvas"),
      wrap: document.getElementById("snakeCanvasWrap"),
      statusEl: document.getElementById("snakeStatus"),
      scoreEl: document.getElementById("snakeScore"),
      startBtn: document.getElementById("snakeStartBtn"),
      restartBtn: document.getElementById("snakeRestartBtn"),
      pauseBtn: document.getElementById("snakePauseBtn"),
      hsBody: document.getElementById("snakeHsBody"),
      clearHsBtn: document.getElementById("snakeClearHsBtn")
    };
  }

  function renderHighscores(tbody, list) {
    tbody.innerHTML = "";
    const rows = (Array.isArray(list) ? list : []).slice(0, 10);
    if (!rows.length) {
      tbody.appendChild(el("tr", {}, [
        el("td", { colspan: "4", class: "pm-muted", text: "No highscores yet." })
      ]));
      return;
    }
    rows.forEach((e, i) => {
      tbody.appendChild(el("tr", {}, [
        el("td", { text: String(i + 1) }),
        el("td", { text: e.name || "Player" }),
        el("td", { text: String(e.score ?? 0) }),
        el("td", { class: "pm-muted", text: fmtTime(e.ts) })
      ]));
    });
  }

  function setupDialog() {
    const dlg = document.getElementById("snakeGameOverDialog");
    const form = document.getElementById("snakeGameOverForm");
    const nameInput = document.getElementById("snakePlayerName");
    const cancelBtn = document.getElementById("snakeDialogCancel");
    const saveBtn = document.getElementById("snakeDialogSave");

    let lastFocus = null;
    let onSave = null;

    const open = ({ defaultName, handleSave }) => {
      onSave = typeof handleSave === "function" ? handleSave : null;
      lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      nameInput.value = (defaultName || "").slice(0, 24);
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
      setTimeout(() => nameInput.focus(), 0);
    };

    const close = () => {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
      if (lastFocus && typeof lastFocus.focus === "function") setTimeout(() => lastFocus.focus(), 0);
      lastFocus = null;
    };

    cancelBtn.addEventListener("click", () => close());
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nm = normName(nameInput.value);
      if (onSave) onSave(nm);
      close();
    });

    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      form.requestSubmit();
    });

    return { open, close };
  }

  function wireControls(ui, dlg) {
    const updateUi = (v) => {
      ui.scoreEl.textContent = String(v.score);

      let msg = "";
      if (v.state === "start") msg = "Press Start to begin.";
      if (v.state === "playing") msg = "Playing. Space pauses.";
      if (v.state === "paused") msg = "Paused. Space resumes.";
      if (v.state === "gameover") msg = "Game over. Save your score.";
      ui.statusEl.textContent = msg;

      ui.startBtn.disabled = v.state !== "start";
      ui.restartBtn.disabled = v.state === "start";
      ui.pauseBtn.disabled = !(v.state === "playing" || v.state === "paused");
      ui.pauseBtn.textContent = v.state === "paused" ? "Resume" : "Pause";
      ui.pauseBtn.setAttribute("aria-pressed", v.state === "paused" ? "true" : "false");
    };

    const unsub = game.onStateChange((v) => {
      updateUi(v);
      if (v.state === "gameover") {
        const snap = game.getSnapshotForSave();
        dlg.open({
          defaultName: "",
          handleSave: (name) => {
            const list = highscores.add(name, snap.score);
            renderHighscores(ui.hsBody, list);
            game.resetToStart();
          }
        });
      }
    });

    ui.startBtn.addEventListener("click", () => game.startNew());
    ui.restartBtn.addEventListener("click", () => game.startNew());
    ui.pauseBtn.addEventListener("click", () => {
      const v = game.getView();
      if (v.state === "playing") game.setPaused(true);
      else if (v.state === "paused") game.setPaused(false);
    });

    ui.clearHsBtn.addEventListener("click", () => {
      highscores.clear();
      renderHighscores(ui.hsBody, highscores.load());
      ui.clearHsBtn.focus();
    });

    const onKeyDown = (e) => {
      const k = e.key;
      if (k === " " || k === "Spacebar") {
        e.preventDefault();
        const v = game.getView();
        if (v.state === "playing") game.setPaused(true);
        else if (v.state === "paused") game.setPaused(false);
        return;
      }
      if (k === "Escape") {
        const v = game.getView();
        if (v.state !== "start") { e.preventDefault(); game.resetToStart(); }
        return;
      }

      if (k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); game.setDirection(0, -1); }
      else if (k === "ArrowDown" || k === "s" || k === "S") { e.preventDefault(); game.setDirection(0, 1); }
      else if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); game.setDirection(-1, 0); }
      else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); game.setDirection(1, 0); }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      unsub();
      window.removeEventListener("keydown", onKeyDown);
    };
  }

  async function main() {
    const res = await fetch("./content.json", { cache: "no-store" });
    const model = await res.json();

    const ui = renderApp(model);
    const dlg = setupDialog();

    renderHighscores(ui.hsBody, highscores.load());
    game.mount({ canvas: ui.canvas, wrap: ui.wrap });

    wireControls(ui, dlg);
  }

  main().catch(() => {});
})();