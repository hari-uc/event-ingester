// Plain browser JS — no build step. Hits the /api routes and renders the
// dashboard. Keep this readable; there's no framework here by design.

const API = "/api";

const state = {
  active: "transactions",
  txn: {
    filters: {
      merchant_id: "",
      payment_status: "",
      settlement_status: "",
      start: "",
      end: "",
      sort_by: "updated_at",
      order: "desc",
    },
    limit: 20,
    offset: 0,
    total: 0,
  },
  recon: {
    filters: { group_by: "merchant", start: "", end: "" },
  },
  disc: {
    filters: { merchant_id: "" },
    limit: 25,
    offset: 0,
    count: 0,
  },
};

// ---------- helpers ----------

function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === null || v === undefined) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAmount(amount, currency) {
  const n = Number(amount);
  if (isNaN(n)) return `${currency ?? ""} ${amount ?? ""}`;
  return `${currency ?? ""} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortId(id) {
  if (!id) return "—";
  return id.slice(0, 8);
}

function badge(status) {
  if (!status) return "—";
  return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function reason(r) {
  return `<span class="reason reason-${escapeHtml(r)}">${escapeHtml(r.replaceAll("_", " "))}</span>`;
}

async function api(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

function formToObj(form) {
  const out = {};
  for (const [k, v] of new FormData(form).entries()) {
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

// ---------- tabs ----------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  state.active = tab;
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab),
  );
  document.querySelectorAll(".panel").forEach((p) =>
    p.classList.toggle("active", p.id === tab),
  );
  if (tab === "transactions") loadTransactions();
  else if (tab === "reconciliation") loadReconciliation();
  else if (tab === "discrepancies") loadDiscrepancies();
}

// ---------- transactions ----------

const txnForm = document.getElementById("txn-filters");
txnForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.txn.filters = { ...state.txn.filters, ...formToObj(txnForm) };
  state.txn.offset = 0;
  loadTransactions();
});
txnForm.addEventListener("reset", () => {
  setTimeout(() => {
    state.txn.filters = {
      merchant_id: "", payment_status: "", settlement_status: "",
      start: "", end: "", sort_by: "updated_at", order: "desc",
    };
    state.txn.offset = 0;
    loadTransactions();
  }, 0);
});
document.getElementById("txn-prev").addEventListener("click", () => {
  state.txn.offset = Math.max(0, state.txn.offset - state.txn.limit);
  loadTransactions();
});
document.getElementById("txn-next").addEventListener("click", () => {
  if (state.txn.offset + state.txn.limit >= state.txn.total) return;
  state.txn.offset += state.txn.limit;
  loadTransactions();
});

async function loadTransactions() {
  const tbody = document.querySelector("#txn-table tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="empty">Loading…</td></tr>`;
  try {
    const data = await api(
      `/transactions?${qs({ ...state.txn.filters, limit: state.txn.limit, offset: state.txn.offset })}`,
    );
    state.txn.total = data.total;
    renderTransactions(data.items);
    updateTxnPager();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTransactions(items) {
  const tbody = document.querySelector("#txn-table tbody");
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No transactions match these filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map(
      (t) => `
      <tr>
        <td><code title="${escapeHtml(t.id)}">${shortId(t.id)}</code></td>
        <td>${escapeHtml(t.merchant_id)}</td>
        <td class="right">${fmtAmount(t.amount, t.currency)}</td>
        <td>${badge(t.payment_status)}</td>
        <td>${badge(t.settlement_status)}</td>
        <td class="muted">${fmtDate(t.updated_at)}</td>
        <td><button class="link" data-txn="${escapeHtml(t.id)}">Details</button></td>
      </tr>`,
    )
    .join("");
  tbody.querySelectorAll("button[data-txn]").forEach((b) =>
    b.addEventListener("click", () => openDetail(b.dataset.txn)),
  );
}

function updateTxnPager() {
  const { total, offset, limit } = state.txn;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  document.getElementById("txn-count").textContent = `${total.toLocaleString()} total`;
  document.getElementById("txn-page").textContent = total === 0 ? "—" : `${start}–${end}`;
  document.getElementById("txn-prev").disabled = offset === 0;
  document.getElementById("txn-next").disabled = end >= total;
}

// ---------- transaction detail modal ----------

const modal = document.getElementById("modal");
modal.querySelectorAll("[data-close]").forEach((el) =>
  el.addEventListener("click", closeModal),
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
});

async function openDetail(id) {
  const body = document.getElementById("modal-body");
  const title = document.getElementById("modal-title");
  title.textContent = `Transaction ${shortId(id)}`;
  body.innerHTML = `<p class="muted">Loading…</p>`;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  try {
    const t = await api(`/transactions/${id}`);
    body.innerHTML = `
      <dl class="kv">
        <dt>ID</dt><dd><code>${escapeHtml(t.id)}</code></dd>
        <dt>Merchant</dt><dd>${escapeHtml(t.merchant?.name ?? t.merchant_id)} <span class="muted">(${escapeHtml(t.merchant_id)})</span></dd>
        <dt>Amount</dt><dd>${fmtAmount(t.amount, t.currency)}</dd>
        <dt>Payment</dt><dd>${badge(t.payment_status)}</dd>
        <dt>Settlement</dt><dd>${badge(t.settlement_status)}</dd>
        <dt>Initiated</dt><dd>${fmtDate(t.initiated_at)}</dd>
        <dt>Processed</dt><dd>${fmtDate(t.processed_at)}</dd>
        <dt>Failed</dt><dd>${fmtDate(t.failed_at)}</dd>
        <dt>Settled</dt><dd>${fmtDate(t.settled_at)}</dd>
        <dt>Updated</dt><dd>${fmtDate(t.updated_at)}</dd>
      </dl>
      <h3>Event history (${t.events.length})</h3>
      ${
        t.events.length
          ? `<ul class="timeline">${t.events
              .map(
                (e) => `
                <li>
                  <strong>${escapeHtml(e.event_type)}</strong>
                  <span class="ts">${fmtDate(e.event_timestamp)}</span>
                  <div class="muted"><code>${escapeHtml(e.event_id)}</code></div>
                </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">No events on record.</p>`
      }
    `;
  } catch (err) {
    body.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
}

function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

// ---------- reconciliation ----------

const reconForm = document.getElementById("recon-filters");
reconForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.recon.filters = { ...state.recon.filters, ...formToObj(reconForm) };
  loadReconciliation();
});
reconForm.addEventListener("reset", () => {
  setTimeout(() => {
    state.recon.filters = { group_by: "merchant", start: "", end: "" };
    loadReconciliation();
  }, 0);
});

async function loadReconciliation() {
  const table = document.getElementById("recon-table");
  table.querySelector("thead").innerHTML = "";
  table.querySelector("tbody").innerHTML = `<tr><td class="empty">Loading…</td></tr>`;
  try {
    const data = await api(`/reconciliation/summary?${qs(state.recon.filters)}`);
    renderReconciliation(data);
  } catch (err) {
    table.querySelector("tbody").innerHTML =
      `<tr><td class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderReconciliation(data) {
  const table = document.getElementById("recon-table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  if (!data.rows.length) {
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td class="empty">No data.</td></tr>`;
    return;
  }

  const isStatus = data.group_by === "status";
  const isDate   = data.group_by === "date";

  const keyHeader = isDate ? "Date" : isStatus ? "Payment / Settlement" : "Merchant";

  thead.innerHTML = isStatus
    ? `<tr><th>${keyHeader}</th><th class="right">Count</th><th class="right">Total</th></tr>`
    : `<tr>
         <th>${keyHeader}</th>
         <th class="right">Count</th>
         <th class="right">Total</th>
         <th>Initiated</th>
         <th>Processed</th>
         <th>Failed</th>
         <th>Settled</th>
         <th>Pending</th>
       </tr>`;

  tbody.innerHTML = data.rows
    .map((r) => {
      if (isStatus) {
        const [pay, set] = r.key.split("/");
        return `
          <tr>
            <td>${badge(pay)} ${badge(set)}</td>
            <td class="right">${Number(r.txn_count).toLocaleString()}</td>
            <td class="right">${Number(r.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>`;
      }
      return `
        <tr>
          <td>${escapeHtml(r.key)}</td>
          <td class="right">${Number(r.txn_count).toLocaleString()}</td>
          <td class="right">${Number(r.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td>${r.initiated ?? 0}</td>
          <td>${r.processed ?? 0}</td>
          <td>${r.failed ?? 0}</td>
          <td>${r.settled ?? 0}</td>
          <td>${r.pending_settlement ?? 0}</td>
        </tr>`;
    })
    .join("");
}

// ---------- discrepancies ----------

const discForm = document.getElementById("disc-filters");
discForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.disc.filters = { ...state.disc.filters, ...formToObj(discForm) };
  state.disc.offset = 0;
  loadDiscrepancies();
});
discForm.addEventListener("reset", () => {
  setTimeout(() => {
    state.disc.filters = { merchant_id: "" };
    state.disc.offset = 0;
    loadDiscrepancies();
  }, 0);
});
document.getElementById("disc-prev").addEventListener("click", () => {
  state.disc.offset = Math.max(0, state.disc.offset - state.disc.limit);
  loadDiscrepancies();
});
document.getElementById("disc-next").addEventListener("click", () => {
  if (state.disc.count < state.disc.limit) return;
  state.disc.offset += state.disc.limit;
  loadDiscrepancies();
});

async function loadDiscrepancies() {
  const tbody = document.querySelector("#disc-table tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="empty">Loading…</td></tr>`;
  try {
    const data = await api(
      `/reconciliation/discrepancies?${qs({ ...state.disc.filters, limit: state.disc.limit, offset: state.disc.offset })}`,
    );
    state.disc.count = data.count;
    renderDiscrepancies(data.items);
    updateDiscPager();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderDiscrepancies(items) {
  const tbody = document.querySelector("#disc-table tbody");
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No discrepancies on this page.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map(
      (t) => `
      <tr>
        <td><code title="${escapeHtml(t.id)}">${shortId(t.id)}</code></td>
        <td>${escapeHtml(t.merchant_id)}</td>
        <td class="right">${fmtAmount(t.amount, t.currency)}</td>
        <td>${badge(t.payment_status)}</td>
        <td>${badge(t.settlement_status)}</td>
        <td>${(t.reasons ?? []).map(reason).join(" ")}</td>
        <td><button class="link" data-txn="${escapeHtml(t.id)}">Details</button></td>
      </tr>`,
    )
    .join("");
  tbody.querySelectorAll("button[data-txn]").forEach((b) =>
    b.addEventListener("click", () => openDetail(b.dataset.txn)),
  );
}

function updateDiscPager() {
  const { count, limit, offset } = state.disc;
  const start = count === 0 ? 0 : offset + 1;
  const end = offset + count;
  document.getElementById("disc-count").textContent =
    `${count} on page${count === limit ? " (more available)" : ""}`;
  document.getElementById("disc-page").textContent = count === 0 ? "—" : `${start}–${end}`;
  document.getElementById("disc-prev").disabled = offset === 0;
  document.getElementById("disc-next").disabled = count < limit;
}

// ---------- boot ----------

loadTransactions();
