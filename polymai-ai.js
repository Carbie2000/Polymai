
const LS = {
  provider: "polymai:ai:provider",
  openaiKey: "polymai:ai:openaiKey",
  openaiModel: "polymai:ai:openaiModel",
  webllmModel: "polymai:ai:webllmModel",
  chatHistoryPrefix: "polymai:ai:chatHistory:v1:",
};

const DEFAULTS = {
  provider: "webllm",
  openaiModel: "gpt-4o-mini",
  webllmModel: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC",
};

const state = {
  engine: null,
  busy: false,
  abort: null,
};

function chatKey() {
  try {
    const p = (typeof location !== "undefined" && location && location.pathname) ? String(location.pathname) : "";
    const safe = p.slice(0, 240) || "default";
    return LS.chatHistoryPrefix + safe;
  } catch {
    return LS.chatHistoryPrefix + "default";
  }
}

function loadChatHistory() {
  try {
    const raw = localStorage.getItem(chatKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveChatHistory(items) {
  try {
    localStorage.setItem(chatKey(), JSON.stringify(items || []));
  } catch {}
}

function appendChatHistory(role, content) {
  const msg = String(content || "").trim();
  if (!msg) return;
  const next = loadChatHistory();
  next.push({ role: role === "assistant" ? "assistant" : "user", content: msg, ts: Date.now() });
  // Keep the last ~30 messages and cap total characters for token sanity.
  const tail = next.slice(-30);
  let total = 0;
  const trimmed = [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const item = tail[i];
    total += String(item.content || "").length;
    trimmed.push(item);
    if (total > 12000) break;
  }
  saveChatHistory(trimmed.reverse());
}

function formatChatHistoryForPrompt() {
  const hist = loadChatHistory();
  if (!hist.length) return "";
  const tail = hist.slice(-12);
  return tail
    .map((m) => {
      const role = m && m.role === "assistant" ? "Assistant" : "User";
      const txt = String(m && m.content ? m.content : "").replace(/\s+\n/g, "\n").trim();
      return role + ": " + txt;
    })
    .join("\n\n")
    .trim();
}

function readLS(key, fallback = "") {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === "class") n.className = String(v || "");
    else if (k === "text") n.textContent = String(v ?? "");
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) n.setAttribute(k, "");
    else if (v != null) n.setAttribute(k, String(v));
  });
  (children || []).forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}

function getContextText() {
  // 1) Explicit app-provided context hook (preferred).
  try {
    const fn = window.polymaiAiGetContext;
    if (typeof fn === "function") {
      const val = fn();
      const s = typeof val === "string" ? val : JSON.stringify(val);
      const trimmed = (s || "").trim();
      if (trimmed) return trimmed.length > 20000 ? trimmed.slice(0, 20000) + "…(truncated)" : trimmed;
    }
  } catch {
    // ignore and fall back
  }

  // 2) Fallback: derive context from the visible page content (good for brochure sites / docs).
  try {
    function fnv1a(str) {
      const s = String(str || "");
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(16);
    }

    function readJson(key) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    function writeJson(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }

    const parts = [];
    const title = (document && document.title) ? String(document.title).trim() : "";
    if (title) parts.push(`Title: ${title}`);
    const descEl = document && document.querySelector ? document.querySelector('meta[name="description"]') : null;
    const desc = descEl && descEl.getAttribute ? String(descEl.getAttribute("content") || "").trim() : "";
    if (desc) parts.push(`Description: ${desc}`);
    const urlPath = (location && location.pathname) ? String(location.pathname) : "";
    if (urlPath) parts.push(`Path: ${urlPath}`);

    const root = (document && document.querySelector && (document.querySelector("main") || document.querySelector("#app"))) || document.body;
    if (root && root.cloneNode) {
      const clone = root.cloneNode(true);
      try {
        clone.querySelectorAll && clone.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
        clone.querySelectorAll && clone.querySelectorAll(".polymai-ai-btn,.polymai-ai-backdrop,.polymai-ai-modal").forEach((n) => n.remove());
      } catch {}
      const text = String((clone.innerText || clone.textContent || ""))
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (text) {
        const pathKey = String(location && location.pathname ? location.pathname : "").slice(0, 240);
        const key = `polymai:ai:pageSummary:v1:${pathKey}`;
        const hash = fnv1a(text);
        const cached = readJson(key);
        if (cached && cached.hash === hash && typeof cached.summary === "string" && cached.summary.trim()) {
          parts.push(`Page summary (cached):\n${cached.summary.trim()}`);
        } else {
          const hParts = [];
          try {
            const hEls = clone.querySelectorAll ? Array.from(clone.querySelectorAll("h1,h2,h3")) : [];
            for (const h of hEls.slice(0, 18)) {
              const t = String((h.innerText || h.textContent || "")).trim();
              if (t) hParts.push(`- ${t}`);
            }
          } catch {}

          const paraParts = [];
          try {
            const pEls = clone.querySelectorAll ? Array.from(clone.querySelectorAll("p")) : [];
            for (const p of pEls.slice(0, 10)) {
              const t = String((p.innerText || p.textContent || "")).replace(/\s+/g, " ").trim();
              if (t) paraParts.push(t.length > 240 ? t.slice(0, 240) + "…" : t);
            }
          } catch {}

          const listParts = [];
          try {
            const liEls = clone.querySelectorAll ? Array.from(clone.querySelectorAll("li")) : [];
            for (const li of liEls.slice(0, 18)) {
              const t = String((li.innerText || li.textContent || "")).replace(/\s+/g, " ").trim();
              if (t) listParts.push(`- ${t.length > 180 ? t.slice(0, 180) + "…" : t}`);
            }
          } catch {}

          const summarySections = [];
          if (hParts.length) summarySections.push(`Headings:\n${hParts.join("\n")}`);
          if (paraParts.length) summarySections.push(`Key copy:\n${paraParts.map((t) => `- ${t}`).join("\n")}`);
          if (listParts.length) summarySections.push(`Key bullets:\n${listParts.join("\n")}`);
          let summary = summarySections.join("\n\n").trim();
          if (!summary) summary = text;
          if (summary.length > 6000) summary = summary.slice(0, 6000) + "…(truncated)";

          writeJson(key, { hash, summary, ts: Date.now() });
          parts.push(`Page summary:\n${summary}`);
        }
      }
    }

    const combined = parts.join("\n\n").trim();
    if (!combined) return "";
    return combined.length > 20000 ? combined.slice(0, 20000) + "…(truncated)" : combined;
  } catch {
    return "";
  }
}

async function ensureWebllmEngine(setStatus) {
  if (state.engine) return state.engine;
  setStatus("Downloading local model (WebLLM)…");
  const webllm = await import("https://esm.run/@mlc-ai/web-llm");
  const engine = new webllm.MLCEngine();
  engine.setInitProgressCallback?.((p) => {
    let pct = 0;
    if (typeof p === "number") pct = p * 100;
    else if (p && typeof p.progress === "number") pct = p.progress * 100;
    pct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
    setStatus(`Downloading model… ${Math.round(pct)}%`);
  });
  const modelId = readLS(LS.webllmModel, DEFAULTS.webllmModel) || DEFAULTS.webllmModel;
  await engine.reload(modelId, { temperature: 0.7, top_p: 1.0 });
  state.engine = engine;
  return engine;
}

async function callOpenAI({ apiKey, model, prompt, signal }) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      text: { format: { type: "text" } },
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${txt || res.statusText}`);
  }
  const json = await res.json();
  if (typeof json?.output_text === "string" && json.output_text.trim()) return json.output_text.trim();
  const out = Array.isArray(json?.output) ? json.output : [];
  const chunks = [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
    }
  }
  const combined = chunks.join("\n").trim();
  return combined || JSON.stringify(json, null, 2);
}

async function callWebllm({ messages, setStatus }) {
  const engine = await ensureWebllmEngine(setStatus);
  setStatus("Thinking (local)…");
  const stream = await engine.chat.completions.create({ stream: true, messages });
  let acc = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) acc += delta;
  }
  const final = await engine.getMessage();
  return final?.content ? String(final.content) : acc;
}

function mount() {
  const btn = el("button", { class: "polymai-ai-btn", type: "button" }, [
    el("span", { class: "polymai-ai-dot", "aria-hidden": "true" }),
    el("span", { text: "AI Assist" }),
  ]);

  const backdrop = el("div", { class: "polymai-ai-backdrop", role: "dialog", "aria-modal": "true" });
  const modal = el("div", { class: "polymai-ai-modal" });
  const title = el("div", { class: "polymai-ai-title" }, [
    el("span", { class: "polymai-ai-dot", "aria-hidden": "true" }),
    el("strong", { text: "AI Assist" }),
  ]);
  const closeBtn = el("button", { class: "polymai-ai-close", type: "button", text: "Close" });
  const head = el("div", { class: "polymai-ai-head" }, [title, closeBtn]);

  const providerSel = el("select", { class: "polymai-ai-select" }, []);
  ["webllm", "openai"].forEach((p) => {
    providerSel.appendChild(el("option", { value: p, text: p === "webllm" ? "Local WebLLM" : "OpenAI (BYO key)" }));
  });
  providerSel.value = readLS(LS.provider, DEFAULTS.provider) || DEFAULTS.provider;

  const openaiKey = el("input", { class: "polymai-ai-input", type: "password", placeholder: "OpenAI API key (sk-...)" });
  const openaiModel = el("input", { class: "polymai-ai-input", type: "text", placeholder: DEFAULTS.openaiModel });
  openaiModel.value = readLS(LS.openaiModel, DEFAULTS.openaiModel) || DEFAULTS.openaiModel;

	  const includeCtx = el("input", { type: "checkbox" });
	  includeCtx.checked = true;

	  const rememberChat = el("input", { type: "checkbox" });
	  rememberChat.checked = true;

  const prompt = el("textarea", { class: "polymai-ai-textarea", placeholder: "Ask for help… (e.g. summarize this page, suggest next actions)" });
  const status = el("div", { class: "polymai-ai-status", text: "Idle" });
  const out = el("div", { class: "polymai-ai-out" });

	  const runBtn = el("button", { class: "polymai-ai-action", type: "button", text: "Run" });
	  const stopBtn = el("button", { class: "polymai-ai-action secondary", type: "button", text: "Stop" });
	  stopBtn.disabled = true;
	  const clearHistoryBtn = el("button", { class: "polymai-ai-action secondary", type: "button", text: "Clear history" });

  const setStatus = (s) => { status.textContent = s || ""; };
  const setBusy = (busy) => {
    state.busy = !!busy;
    runBtn.disabled = busy;
    stopBtn.disabled = !busy;
    providerSel.disabled = busy;
  };

  const renderProvider = () => {
    const p = providerSel.value || "webllm";
    const showOpenai = p === "openai";
    openaiKey.parentElement.style.display = showOpenai ? "" : "none";
    openaiModel.parentElement.style.display = showOpenai ? "" : "none";
  };

	  providerSel.addEventListener("change", () => {
	    writeLS(LS.provider, providerSel.value || DEFAULTS.provider);
	    renderProvider();
	  });

	  clearHistoryBtn.addEventListener("click", () => {
	    try { localStorage.removeItem(chatKey()); } catch {}
	    out.textContent = "";
	    setStatus("History cleared");
	    setTimeout(() => { if (!state.busy) setStatus("Idle"); }, 800);
	  });

  runBtn.addEventListener("click", async () => {
    const p = (providerSel.value || DEFAULTS.provider).trim();
    const q = (prompt.value || "").trim();
    if (!q) return;
    out.textContent = "";
    setBusy(true);
    setStatus("Starting…");
	    try {
	      const ctx = includeCtx.checked ? getContextText() : "";
	      const history = rememberChat.checked ? formatChatHistoryForPrompt() : "";
	      const fullPrompt = [
	        history ? "Conversation history:\n" + history : "",
	        "User request:\n" + q,
	        ctx ? "Context (page/app content):\n" + ctx : "",
	      ]
	        .filter(Boolean)
	        .join("\n\n");

	      const systemText = ctx
	        ? "You are a helpful in-app assistant. Be concise and actionable.\n\nSystem context (page/app content):\n" + ctx
	        : "You are a helpful in-app assistant. Be concise and actionable.";
	      if (p === "openai") {
	        const apiKey = readLS(LS.openaiKey, "").trim() || openaiKey.value.trim();
	        if (!apiKey) throw new Error("Missing OpenAI API key.");
        writeLS(LS.openaiKey, apiKey);
        const model = (openaiModel.value || readLS(LS.openaiModel, DEFAULTS.openaiModel)).trim() || DEFAULTS.openaiModel;
        writeLS(LS.openaiModel, model);
        state.abort = new AbortController();
	        setStatus("Thinking (OpenAI)…");
	        const txt = await callOpenAI({ apiKey, model, prompt: fullPrompt, signal: state.abort.signal });
	        out.textContent = txt;
	        if (rememberChat.checked) {
	          appendChatHistory("user", q);
	          appendChatHistory("assistant", txt);
	        }
	        setStatus("Done");
	      } else {
	        const messages = [{ role: "system", content: systemText }];
	        if (rememberChat.checked) {
	          const hist = loadChatHistory().slice(-12);
	          for (const m of hist) {
	            const role = m && m.role === "assistant" ? "assistant" : "user";
	            const content = String(m && m.content ? m.content : "");
	            if (content.trim()) messages.push({ role, content });
	          }
	        }
	        messages.push({ role: "user", content: q });
	        const txt = await callWebllm({ messages, setStatus });
	        out.textContent = txt;
	        if (rememberChat.checked) {
	          appendChatHistory("user", q);
	          appendChatHistory("assistant", txt);
	        }
	        setStatus("Done");
	      }
	    } catch (e) {
      if (String(e?.name || "").toLowerCase() === "aborterror") {
        setStatus("Stopped");
      } else {
        setStatus("Error");
        out.textContent = String(e?.message || e || "Unknown error");
      }
    } finally {
      state.abort = null;
      setBusy(false);
      setTimeout(() => { if (!state.busy) setStatus("Idle"); }, 800);
    }
  });

  stopBtn.addEventListener("click", () => {
    try { state.abort?.abort(); } catch {}
  });

  const body = el("div", { class: "polymai-ai-body" }, [
    el("div", {}, [
      el("label", { text: "Provider" }),
      providerSel,
    ]),
    el("div", {}, [
      el("label", { text: "OpenAI API key (stored locally)" }),
      openaiKey,
    ]),
    el("div", {}, [
      el("label", { text: "OpenAI model" }),
      openaiModel,
    ]),
	    el("div", { class: "polymai-ai-row" }, [
	      includeCtx,
	      el("label", { text: "Include app context (if provided)" }),
	    ]),
	    el("div", { class: "polymai-ai-row" }, [
	      rememberChat,
	      el("label", { text: "Remember this chat (local memory)" }),
	    ]),
	    el("div", {}, [
	      el("label", { text: "Prompt" }),
	      prompt,
	    ]),
	    el("div", { class: "polymai-ai-actions" }, [runBtn, stopBtn, clearHistoryBtn]),
	    status,
	    out,
	  ]);

  modal.appendChild(head);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  const open = () => {
    backdrop.classList.add("open");
    prompt.focus();
    renderProvider();
  };
  const close = () => backdrop.classList.remove("open");
  btn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  document.body.appendChild(btn);
  document.body.appendChild(backdrop);
  renderProvider();
}

window.addEventListener("load", () => {
  try { mount(); } catch {}
});