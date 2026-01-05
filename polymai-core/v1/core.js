(function () {
  const g = typeof window !== "undefined" ? window : globalThis;
  if (g.Polymai) return;

  function safe(fn) {
    try { return fn(); } catch (e) { console.warn("Polymai core error:", e); return undefined; }
  }

  const storage = {
    get(key, fallback = null) {
      return safe(() => {
        const raw = localStorage.getItem(`polymai:${key}`);
        return raw == null ? fallback : JSON.parse(raw);
      }) ?? fallback;
    },
    set(key, value) {
      safe(() => localStorage.setItem(`polymai:${key}`, JSON.stringify(value)));
    },
    remove(key) {
      safe(() => localStorage.removeItem(`polymai:${key}`));
    }
  };

  const store = (() => {
    const state = new Map();
    const subs = new Map();
    return {
      get(key, fallback = null) { return state.has(key) ? state.get(key) : fallback; },
      set(key, value) {
        state.set(key, value);
        const list = subs.get(key) || [];
        for (const fn of list) safe(() => fn(value));
      },
      subscribe(key, fn) {
        const list = subs.get(key) || [];
        list.push(fn);
        subs.set(key, list);
        return () => {
          const next = (subs.get(key) || []).filter((f) => f !== fn);
          subs.set(key, next);
        };
      }
    };
  })();

  const features = {
    isEnabled(name) {
      const flags = storage.get("features", {});
      return Boolean(flags && typeof flags === "object" && flags[name]);
    },
    set(name, enabled) {
      const flags = storage.get("features", {});
      flags[name] = Boolean(enabled);
      storage.set("features", flags);
    }
  };

  function ensureToastRegion() {
    let region = document.querySelector(".pm-toast-region");
    if (region) return region;
    region = document.createElement("div");
    region.className = "pm-toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-relevant", "additions");
    document.body.appendChild(region);
    return region;
  }

  const toast = {
    show(message, opts = {}) {
      safe(() => {
        const region = ensureToastRegion();
        const el = document.createElement("div");
        const tone = opts.tone || "info";
        el.className = `pm-toast pm-toast--${tone}`;
        const title = opts.title ? `<strong>${String(opts.title)}</strong>` : "";
        const meta = opts.meta ? `<div class="pm-toast__meta">${String(opts.meta)}</div>` : "";
        el.innerHTML = `${title}<div>${String(message || "")}</div>${meta}`;
        region.appendChild(el);
        const ms = typeof opts.ms === "number" ? opts.ms : 2600;
        window.setTimeout(() => { try { el.remove(); } catch {} }, Math.max(800, ms));
      });
    },
    success(msg, opts) { toast.show(msg, { ...(opts || {}), tone: "success" }); },
    error(msg, opts) { toast.show(msg, { ...(opts || {}), tone: "error" }); },
    info(msg, opts) { toast.show(msg, { ...(opts || {}), tone: "info" }); }
  };

  function ensureModal() {
    let backdrop = document.querySelector(".pm-modal-backdrop");
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.className = "pm-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.innerHTML = `
      <div class="pm-modal" role="document">
        <div class="pm-modal__head">
          <div class="pm-modal__title" id="pm-modal-title"></div>
          <button class="pm-btn pm-btn--ghost" type="button" data-pm-close>Close</button>
        </div>
        <div class="pm-modal__body" id="pm-modal-body"></div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) modal.close(); });
    backdrop.querySelector("[data-pm-close]")?.addEventListener("click", () => modal.close());
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.close(); });
    return backdrop;
  }

  const modal = {
    open({ title = "", content = "" } = {}) {
      safe(() => {
        const backdrop = ensureModal();
        const t = backdrop.querySelector("#pm-modal-title");
        const b = backdrop.querySelector("#pm-modal-body");
        if (t) t.textContent = String(title || "");
        if (b) {
          if (content instanceof Node) {
            b.innerHTML = "";
            b.appendChild(content);
          } else {
            b.innerHTML = String(content || "");
          }
        }
        backdrop.setAttribute("data-open", "true");
      });
    },
    close() {
      safe(() => {
        const backdrop = document.querySelector(".pm-modal-backdrop");
        if (!backdrop) return;
        backdrop.setAttribute("data-open", "false");
      });
    }
  };

  const dom = {
    qs(sel, root) { return safe(() => (root || document).querySelector(sel)) || null; },
    qsa(sel, root) { return safe(() => Array.from((root || document).querySelectorAll(sel))) || []; },
    on(el, ev, fn, opts) { safe(() => el && el.addEventListener(ev, fn, opts)); },
  };

  g.Polymai = {
    version: "polymai-web-core@1.0.0",
    toast,
    modal,
    storage,
    store,
    features,
    dom
  };
})();

