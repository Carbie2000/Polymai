const $ = (s) => document.querySelector(s);

const els = {
  status: $("#pm-status"),
  role: $("#pm-role"),
  activeChild: $("#pm-active-child"),
  buyerName: $("#pm-buyer-name"),
  addChildBtn: $("#pm-add-child-btn"),
  resetBtn: $("#pm-reset-btn"),
  wishForm: $("#pm-wish-form"),
  wishTitle: $("#pm-wish-title"),
  wishNotes: $("#pm-wish-notes"),
  wishLink: $("#pm-wish-link"),
  filter: $("#pm-filter"),
  list: $("#pm-list"),
  empty: $("#pm-empty"),
};

const uid = () => Math.random().toString(36).slice(2, 10);

const demoState = () => ({
  children: [
    { id: "c1", name: "Ava" },
    { id: "c2", name: "Noah" },
  ],
  wishes: [
    {
      id: "w1",
      childId: "c1",
      title: "Purple hoodie (size 8)",
      notes: "Soft, no zipper",
      link: "",
      status: "open",
      buyer: "",
    },
    {
      id: "w2",
      childId: "c2",
      title: "LEGO set",
      notes: "Something with cars",
      link: "",
      status: "claimed",
      buyer: "Grandma",
    },
  ],
  activeChildId: "c1",
  role: "kid",
  buyerName: "",
  filter: "all",
});

let state = demoState();

function setStatus(msg) {
  els.status.textContent = msg;
  if (!msg) return;
  window.clearTimeout(setStatus._t);
  setStatus._t = window.setTimeout(() => {
    els.status.textContent = "";
  }, 2400);
}

function childName(id) {
  const c = state.children.find((x) => x.id === id);
  return c ? c.name : "Unknown";
}

function syncControls() {
  els.role.value = state.role;

  els.activeChild.innerHTML = "";
  for (const c of state.children) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    els.activeChild.appendChild(opt);
  }
  if (!state.children.some((c) => c.id === state.activeChildId)) {
    state.activeChildId = state.children[0]?.id || "";
  }
  els.activeChild.value = state.activeChildId || "";

  els.buyerName.value = state.buyerName;
  const adult = state.role === "adult";
  els.buyerName.disabled = !adult;

  const wishInputs = [els.wishTitle, els.wishNotes, els.wishLink, $("#pm-add-wish")];
  for (const el of wishInputs) el.disabled = adult || !state.activeChildId;
  $("#pm-kid-help").hidden = adult;

  for (const opt of els.filter.options) {
    const v = opt.value;
    opt.disabled = !adult && (v === "claimed" || v === "bought");
  }
  if (!adult && (state.filter === "claimed" || state.filter === "bought")) state.filter = "all";
  els.filter.value = state.filter;
}

function filteredWishes() {
  const adult = state.role === "adult";
  const f = state.filter;
  let list = state.wishes.filter((w) => w.childId === state.activeChildId);
  if (!adult) return list;
  if (f === "open") list = list.filter((w) => w.status === "open");
  if (f === "claimed") list = list.filter((w) => w.status === "claimed");
  if (f === "bought") list = list.filter((w) => w.status === "bought");
  return list;
}

function wishBadge(w) {
  if (state.role !== "adult") return `<span class="pm-badge">Open`;
  if (w.status === "claimed") return `<span class="pm-badge pm-badge-claimed">Claimed${w.buyer ? ` • ${escapeHtml(w.buyer)}` : ""}`;
  if (w.status === "bought") return `<span class="pm-badge pm-badge-bought">Bought${w.buyer ? ` • ${escapeHtml(w.buyer)}` : ""}`;
  return `<span class="pm-badge">Open`;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render() {
  syncControls();
  const wishes = filteredWishes();
  els.list.innerHTML = "";
  els.empty.hidden = wishes.length !== 0;

  for (const w of wishes) {
    const li = document.createElement("li");
    li.className = "pm-item";
    li.dataset.wishId = w.id;

    const link = w.link ? `<div class="pm-item-meta"><a href="${escapeHtml(w.link)}" target="_blank" rel="noreferrer noopener">Open link</a></div>` : "";
    const notes = w.notes ? `<div class="pm-item-meta">${escapeHtml(w.notes)}</div>` : "";

    li.innerHTML = `
      <div class="pm-item-top">
        <div>
          <p class="pm-item-title">${escapeHtml(w.title)}</p>
          <div class="pm-item-meta">For <strong>${escapeHtml(childName(w.childId))}</strong></div>
        </div>
        <div class="pm-badges">${wishBadge(w)}</div>
      </div>
      ${notes}
      ${link}
      <div class="pm-actions" aria-label="Actions"></div>
    `;

    const actions = li.querySelector(".pm-actions");
    const adult = state.role === "adult";

    if (adult) {
      const claim = document.createElement("button");
      claim.type = "button";
      claim.className = "pm-btn pm-btn-secondary";
      claim.textContent = "Claim";
      claim.disabled = w.status === "bought";
      claim.addEventListener("click", () => onClaim(w.id));

      const unclaim = document.createElement("button");
      unclaim.type = "button";
      unclaim.className = "pm-btn pm-btn-secondary";
      unclaim.textContent = "Unclaim";
      unclaim.disabled = w.status === "open" || w.status === "bought";
      unclaim.addEventListener("click", () => onUnclaim(w.id));

      const bought = document.createElement("button");
      bought.type = "button";
      bought.className = "pm-btn pm-btn-primary";
      bought.textContent = "Mark bought";
      bought.disabled = w.status === "bought";
      bought.addEventListener("click", () => onBought(w.id));

      actions.append(claim, unclaim, bought);
    } else {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "pm-btn pm-btn-danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => onDelete(w.id));
      actions.append(del);
    }

    els.list.appendChild(li);
  }
}

function requireBuyerName() {
  const name = (state.buyerName || "").trim();
  if (!name) {
    setStatus("Enter a buyer name first.");
    els.buyerName.focus();
    return null;
  }
  return name;
}

function onClaim(wishId) {
  const name = requireBuyerName();
  if (!name) return;
  const w = state.wishes.find((x) => x.id === wishId);
  if (!w || w.status === "bought") return;
  w.status = "claimed";
  w.buyer = name;
  setStatus("Claimed.");
  render();
}

function onUnclaim(wishId) {
  const w = state.wishes.find((x) => x.id === wishId);
  if (!w || w.status !== "claimed") return;
  w.status = "open";
  w.buyer = "";
  setStatus("Unclaimed.");
  render();
}

function onBought(wishId) {
  const name = requireBuyerName();
  if (!name) return;
  const w = state.wishes.find((x) => x.id === wishId);
  if (!w) return;
  w.status = "bought";
  w.buyer = name;
  setStatus("Marked as bought.");
  render();
}

function onDelete(wishId) {
  const w = state.wishes.find((x) => x.id === wishId);
  if (!w) return;
  state.wishes = state.wishes.filter((x) => x.id !== wishId);
  setStatus("Deleted wish.");
  render();
}

function addChildFlow() {
  const name = window.prompt("Child name:");
  const clean = (name || "").trim();
  if (!clean) return;
  const id = uid();
  state.children.push({ id, name: clean.slice(0, 40) });
  state.activeChildId = id;
  setStatus("Child added.");
  render();
}

els.role.addEventListener("change", () => {
  state.role = els.role.value;
  setStatus(state.role === "adult" ? "Adult mode: claim and mark bought." : "Kid mode: purchase info hidden.");
  render();
});

els.activeChild.addEventListener("change", () => {
  state.activeChildId = els.activeChild.value;
  render();
});

els.buyerName.addEventListener("input", () => {
  state.buyerName = els.buyerName.value;
});

els.filter.addEventListener("change", () => {
  state.filter = els.filter.value;
  render();
});

els.addChildBtn.addEventListener("click", addChildFlow);

els.resetBtn.addEventListener("click", () => {
  state = demoState();
  setStatus("Reset to demo data.");
  render();
});

els.wishForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.role !== "kid") return;
  const title = (els.wishTitle.value || "").trim();
  const notes = (els.wishNotes.value || "").trim();
  const link = (els.wishLink.value || "").trim();
  if (!title) return;

  state.wishes.unshift({
    id: uid(),
    childId: state.activeChildId,
    title: title.slice(0, 80),
    notes: notes.slice(0, 300),
    link: link.slice(0, 500),
    status: "open",
    buyer: "",
  });

  els.wishTitle.value = "";
  els.wishNotes.value = "";
  els.wishLink.value = "";
  setStatus("Wish added.");
  els.wishTitle.focus();
  render();
});

render();