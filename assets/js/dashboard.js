/* ============================================================
   INKCONNECT — DASHBOARD ENGINE
   Single-page-app style section switching for the three role
   dashboards. Each section is rendered on demand from the API
   layer. All interactions are wired via addEventListener — no
   inline JS in the markup.
   ============================================================ */

let CURRENT_SESSION = null;

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  if (!page) return;

  const roleMap = { "client-dashboard": "client", "writer-dashboard": "writer", "admin-dashboard": "admin" };
  const role = roleMap[page];
  CURRENT_SESSION = Auth.requireRole(role);
  if (!CURRENT_SESSION) return;

  initSidebarRouting();
  initMobileSidebarToggle();
  populateProfileWidgets(CURRENT_SESSION.user);

  // Clients and writers must clear the access-fee gate before their
  // dashboard initializes. If not yet approved, send them to the
  // dedicated review page instead of rendering the dashboard.
  if ((page === "client-dashboard" || page === "writer-dashboard") && roleNeedsAccessFee(role)) {
    const fresh = await API.getUser({ id: CURRENT_SESSION.user.id });
    const user = fresh.ok ? fresh.user : CURRENT_SESSION.user;
    if (fresh.ok) { Auth.setSession(user, CURRENT_SESSION.token, true); CURRENT_SESSION.user = user; }
    if ((user.accessStatus || "unpaid") !== "active") {
      window.location.href = "registration-pending.html";
      return;
    }
  }

  if (page === "client-dashboard") ClientDash.init();
  if (page === "writer-dashboard") WriterDash.init();
  if (page === "admin-dashboard") AdminDash.init();
});

function initSidebarRouting() {
  const links = document.querySelectorAll("[data-section-link]");
  const sections = document.querySelectorAll("[data-section]");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const target = link.dataset.sectionLink;
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      sections.forEach((s) => (s.style.display = s.dataset.section === target ? "" : "none"));
      document.getElementById("dash-sidebar")?.classList.remove("open");
      const loaders = { overview: null };
      window.dispatchEvent(new CustomEvent("section:show", { detail: target }));
    });
  });
}

function initMobileSidebarToggle() {
  const btn = document.querySelector("[data-sidebar-toggle]");
  const sidebar = document.getElementById("dash-sidebar");
  if (btn && sidebar) btn.addEventListener("click", () => sidebar.classList.toggle("open"));
}

function populateProfileWidgets(user) {
  document.querySelectorAll("[data-current-user-name]").forEach((el) => (el.textContent = user.fullName));
  document.querySelectorAll("[data-current-user-role]").forEach((el) => (el.textContent = user.role));
  document.querySelectorAll("[data-current-user-avatar]").forEach((el) => (el.textContent = initials(user.fullName)));
  document.querySelectorAll("[data-current-user-email]").forEach((el) => (el.textContent = user.email));
}

/* ============================================================
   SHARED WIDGET BUILDERS
   ============================================================ */
function buildBarChart(container, data, labelKey, valueKey) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  container.innerHTML = `<div class="chart-bars">${data.map((d) => `
    <div class="chart-bar-col">
      <div class="chart-bar" style="height:${Math.max(6, (d[valueKey] / max) * 150)}px" title="${d[valueKey]}"></div>
      <div class="chart-bar-label">${escapeHtml(d[labelKey])}</div>
    </div>`).join("")}</div>`;
}

function buildDonut(container, percent, color1, color2) {
  container.innerHTML = `<div class="donut-wrap">
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="58" fill="none" stroke="var(--glass-border)" stroke-width="14"/>
      <circle cx="70" cy="70" r="58" fill="none" stroke="url(#donutGrad)" stroke-width="14"
        stroke-dasharray="${2 * Math.PI * 58}" stroke-dashoffset="${2 * Math.PI * 58 * (1 - percent / 100)}"
        stroke-linecap="round" transform="rotate(-90 70 70)"/>
      <defs><linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/>
      </linearGradient></defs>
      <text x="70" y="76" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="var(--text-0)" font-weight="700">${percent}%</text>
    </svg>
    <div><slot></slot></div>
  </div>`;
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state">
    <div>${icon}</div>
    <h4 style="color:var(--text-0);margin-bottom:6px;">${title}</h4>
    <p>${sub}</p>
  </div>`;
}

async function renderWalletTransactions(container, userId) {
  if (!container) return;
  const res = await API.getTransactions({ userId });
  const tx = res.transactions.filter((t) => t.type === "deposit" || t.type === "withdraw").slice(0, 8);
  if (!tx.length) { container.innerHTML = emptyState("💳", "No deposits or withdrawals yet", "Your M-Pesa, PayPal and bank activity will show here."); return; }
  container.innerHTML = tx.map((t) => `
    <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--glass-border);">
      <div>
        <div style="font-weight:600;font-size:.88rem;text-transform:capitalize;">${t.type}</div>
        <div class="flex gap-2" style="margin-top:4px;">${PaymentMethods.methodBadge(t.method)}<span class="muted" style="font-size:.76rem;">${t.reference || ""}</span></div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--font-mono);font-weight:700;color:${t.type === "deposit" ? "var(--aurora-mint)" : "var(--aurora-rose)"};">${t.type === "deposit" ? "+" : "-"}${money(t.amount)}</div>
        <div class="muted" style="font-size:.74rem;">${timeAgo(t.createdAt)}</div>
      </div>
    </div>`).join("");
}

/** Shared by both client and writer dashboards — populates the Referrals
    tab: the shareable link, KPI totals, and the list of people who
    joined through it. */
async function renderReferrals() {
  const res = await API.getReferrals({ userId: CURRENT_SESSION.user.id });
  if (!res.ok) return;

  const c = await getEffectiveSiteConfig();
  document.getElementById("referral-bonus-label").textContent = `KES ${c.REFERRAL_BONUS_KES} (~$${c.REFERRAL_BONUS_USD})`;

  const link = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "")}register.html?ref=${res.code}`;
  const linkInput = document.getElementById("referral-link-input");
  linkInput.value = link;

  document.getElementById("referral-earned").textContent = money(res.totalEarned);
  document.getElementById("referral-count").textContent = res.referred.length;

  const copyBtn = document.getElementById("referral-copy-btn");
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(link);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1800);
    } catch {
      linkInput.select();
      toast("Select and copy the link above.", "info");
    }
  };

  const listEl = document.getElementById("referral-list");
  if (!res.referred.length) {
    listEl.innerHTML = emptyState("🎁", "No referrals yet", "Share your link — you'll see everyone who joins through it here.");
    return;
  }
  listEl.innerHTML = res.referred.map((r) => `
    <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--glass-border);">
      <div class="flex gap-2"><div class="avatar sm">${initials(r.name)}</div>
        <div><div style="font-weight:600;font-size:.88rem;">${escapeHtml(r.name)}</div><div class="muted" style="font-size:.76rem;text-transform:capitalize;">${r.role} • ${timeAgo(r.joinedAt)}</div></div>
      </div>
      <div style="text-align:right;">
        ${statusBadge(r.accessStatus === "active" ? "active" : (r.accessStatus || "unpaid"))}
        ${r.bonusEarned ? `<div class="muted" style="font-size:.72rem;margin-top:4px;color:var(--aurora-mint);">+${money(c.REFERRAL_BONUS_USD)} earned</div>` : ""}
      </div>
    </div>`).join("");
}

function statusBadge(status) {
  const map = {
    open: ["blue", "Open"], in_progress: ["amber", "In progress"], submitted: ["amber", "Submitted"],
    completed: ["green", "Completed"], pending: ["amber", "Pending"], accepted: ["green", "Accepted"],
    rejected: ["red", "Rejected"], pending_review: ["amber", "Awaiting admin approval"],
    unpaid: ["red", "Unpaid"], active: ["green", "Active"], approved: ["green", "Approved"],
  };
  const [cls, label] = map[status] || ["blue", status];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ============================================================
   NOTIFICATIONS + MESSAGING (shared across roles)
   ============================================================ */
async function renderNotifications(container) {
  const res = await API.getNotifications({ userId: CURRENT_SESSION.user.id });
  if (!res.notifications.length) { container.innerHTML = emptyState("🔔", "No notifications yet", "You'll see job updates, payments and messages here."); return; }
  container.innerHTML = `<div class="grid" style="gap:10px;">${res.notifications.map((n) => `
    <div class="glass" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;${n.read ? "opacity:.6;" : ""}">
      <div><strong style="font-size:.85rem;">${labelForNotifType(n.type)}</strong><p class="muted" style="font-size:.85rem;margin-top:2px;">${escapeHtml(n.text)}</p></div>
      <span class="muted" style="font-size:.72rem;">${timeAgo(n.createdAt)}</span>
    </div>`).join("")}</div>`;
  API.markNotificationsRead({ userId: CURRENT_SESSION.user.id });
}
function labelForNotifType(t) { return { job: "Job update", application: "Application", payment: "Payment", message: "Message", review: "Review", announcement: "📢 Announcement" }[t] || "Update"; }

let chatMessagePollTimer = null;
let chatThreadListPollTimer = null;
function stopChatPolling() { clearInterval(chatMessagePollTimer); clearInterval(chatThreadListPollTimer); }
window.addEventListener("section:show", (e) => { if (e.detail !== "messages") stopChatPolling(); });

async function renderThreads(listEl, panelEl) {
  const res = await API.getThreads({ userId: CURRENT_SESSION.user.id });
  if (!res.threads.length) { listEl.innerHTML = emptyState("💬", "No conversations", "Messages with clients/writers appear here."); return; }
  const activeThread = panelEl ? panelEl.dataset.thread : null;
  listEl.innerHTML = res.threads.map((t) => `
    <div class="chat-thread-item ${t.threadId === activeThread ? "active" : ""}" data-thread="${t.threadId}" data-other="${t.otherId}" data-other-name="${escapeHtml(t.otherName)}">
      <div class="avatar sm">${initials(t.otherName)}</div>
      <div style="min-width:0;"><div class="name">${escapeHtml(t.otherName)}</div><div class="preview">${escapeHtml(t.lastText)}</div></div>
      ${t.unread ? '<span class="unread-dot"></span>' : ""}
    </div>`).join("");
  listEl.querySelectorAll("[data-thread]").forEach((item) => item.addEventListener("click", () => openThread(item.dataset.thread, item.dataset.other, item.dataset.otherName, panelEl, listEl)));

  // Keep the thread list (and its unread dots) fresh while this section is open.
  clearInterval(chatThreadListPollTimer);
  chatThreadListPollTimer = setInterval(() => renderThreads(listEl, panelEl), 8000);
}

async function openThread(threadId, otherId, otherName, panelEl, listEl) {
  listEl.querySelectorAll(".chat-thread-item").forEach((i) => i.classList.toggle("active", i.dataset.thread === threadId));
  panelEl.dataset.thread = threadId;
  panelEl.dataset.other = otherId;
  panelEl.querySelector("[data-chat-name]").textContent = otherName;
  panelEl.querySelector("[data-chat-avatar]").textContent = initials(otherName);
  panelEl.style.display = "flex";
  await loadThreadMessages(threadId, panelEl);
  await API.markRead({ threadId, userId: CURRENT_SESSION.user.id });

  // Live-refresh the open conversation so replies show up without a manual click.
  clearInterval(chatMessagePollTimer);
  chatMessagePollTimer = setInterval(async () => {
    if (panelEl.dataset.thread !== threadId) return;
    await loadThreadMessages(threadId, panelEl);
    API.markRead({ threadId, userId: CURRENT_SESSION.user.id });
  }, 4000);
}

async function loadThreadMessages(threadId, panelEl) {
  const box = panelEl.querySelector("[data-chat-messages]");
  const res = await API.getMessages({ threadId });
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = res.messages.map((m) => `
    <div class="msg-bubble ${m.fromId === CURRENT_SESSION.user.id ? "sent" : "received"}">${escapeHtml(m.text)}<div class="msg-time">${new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div>`).join("");
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

function wireChatInput(panelEl, listEl) {
  const form = panelEl.querySelector("[data-chat-form]");
  const input = panelEl.querySelector("[data-chat-input]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !panelEl.dataset.thread) return;
    input.value = "";
    const sendBtn = form.querySelector("button[type=submit]");
    sendBtn.disabled = true;
    await API.sendMessage({ threadId: panelEl.dataset.thread, fromId: CURRENT_SESSION.user.id, toId: panelEl.dataset.other, text });
    sendBtn.disabled = false;
    await loadThreadMessages(panelEl.dataset.thread, panelEl);
    await renderThreads(listEl, panelEl);
  });
}

function startThreadWith(otherId, otherName) {
  const ids = [CURRENT_SESSION.user.id, otherId].sort();
  return `${ids[0]}__${ids[1]}`;
}

/* ============================================================
   CLIENT DASHBOARD
   ============================================================ */
const ClientDash = {
  async init() {
    await this.renderOverview();
    this.wirePostJob();
    document.getElementById("nav-my-jobs")?.addEventListener("click", () => this.renderMyJobs());
    document.getElementById("nav-applicants")?.addEventListener("click", () => this.renderApplicants());
    document.getElementById("nav-payments")?.addEventListener("click", () => this.renderPayments());
    document.getElementById("nav-wallet")?.addEventListener("click", () => this.renderWallet());
    document.getElementById("nav-referrals")?.addEventListener("click", () => renderReferrals());
    document.getElementById("nav-messages")?.addEventListener("click", () => renderThreads(document.getElementById("chat-list"), document.getElementById("chat-panel")));
    document.getElementById("nav-notifications")?.addEventListener("click", () => renderNotifications(document.getElementById("notif-list")));
    document.getElementById("nav-reviews")?.addEventListener("click", () => this.renderReviews());
    this.wireWallet();
    this.wireSettings();
    wireChatInput(document.getElementById("chat-panel"), document.getElementById("chat-list"));
  },

  async renderOverview() {
    const user = CURRENT_SESSION.user;
    const [jobsRes, walletRes, appsRes] = await Promise.all([
      API.getJobs({ clientId: user.id }), API.getWallet({ userId: user.id }), API.getApplications({ clientId: user.id }),
    ]);
    document.getElementById("kpi-open-jobs").textContent = jobsRes.jobs.filter((j) => j.status === "open").length;
    document.getElementById("kpi-active-jobs").textContent = jobsRes.jobs.filter((j) => j.status === "in_progress" || j.status === "submitted").length;
    document.getElementById("kpi-applicants").textContent = appsRes.applications.length;
    document.getElementById("kpi-balance").textContent = money(walletRes.wallet.balance);

    const byMonth = {};
    jobsRes.jobs.forEach((j) => { const m = new Date(j.createdAt).toLocaleString(undefined, { month: "short" }); byMonth[m] = (byMonth[m] || 0) + 1; });
    const chartData = Object.entries(byMonth).slice(-6).map(([label, value]) => ({ label, value }));
    buildBarChart(document.getElementById("client-chart"), chartData.length ? chartData : [{ label: "—", value: 0 }], "label", "value");

    const recent = jobsRes.jobs.slice(0, 5);
    document.getElementById("client-recent-jobs").innerHTML = recent.length ? recent.map((j) => `
      <tr><td>${escapeHtml(j.title)}</td><td>${escapeHtml(j.category)}</td><td>${money(j.budget)}</td><td>${statusBadge(j.status)}</td><td class="muted">${timeAgo(j.createdAt)}</td></tr>`).join("")
      : `<tr><td colspan="5">${emptyState("📄", "No jobs yet", "Post your first job to get started.")}</td></tr>`;
  },

  wirePostJob() {
    const form = document.getElementById("post-job-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = form.title.value.trim(), category = form.category.value, budget = form.budget.value, days = form.days.value, description = form.description.value.trim();
      let valid = true;
      if (!Validate.required(title)) { Validate.showError(form.title.closest(".field"), "Title is required."); valid = false; } else Validate.clearError(form.title.closest(".field"));
      if (!budget || budget <= 0) { Validate.showError(form.budget.closest(".field"), "Enter a valid budget."); valid = false; } else Validate.clearError(form.budget.closest(".field"));
      if (!Validate.required(description) || description.length < 20) { Validate.showError(form.description.closest(".field"), "Please add at least 20 characters."); valid = false; } else Validate.clearError(form.description.closest(".field"));
      if (!valid) return;
      const res = await API.postJob({ clientId: CURRENT_SESSION.user.id, clientName: CURRENT_SESSION.user.fullName, title, category, budget, days, description });
      if (res.ok) { toast("Job posted successfully", "success"); form.reset(); this.renderOverview(); document.querySelector('[data-section-link="my-jobs"]')?.click(); this.renderMyJobs(); }
      else toast(res.error, "error");
    });
  },

  async renderMyJobs() {
    const el = document.getElementById("my-jobs-list");
    const res = await API.getJobs({ clientId: CURRENT_SESSION.user.id });
    if (!res.jobs.length) { el.innerHTML = emptyState("📄", "No jobs posted", "Post a job and it will appear here."); return; }
    el.innerHTML = res.jobs.map((j) => `
      <div class="glass-card glass mb-2">
        <div class="flex-between">
          <div><h4>${escapeHtml(j.title)}</h4><p class="muted" style="font-size:.85rem;">${escapeHtml(j.category)} • ${money(j.budget)} • ${timeAgo(j.createdAt)}</p></div>
          ${statusBadge(j.status)}
        </div>
        <p class="body-md mt-2">${escapeHtml(j.description)}</p>
        ${j.status === "pending_review" ? `<p class="muted mt-2" style="font-size:.82rem;">🕐 An admin is reviewing this job before it goes live to writers.</p>` : ""}
        ${j.status === "rejected" ? `<p style="font-size:.82rem;color:var(--aurora-rose);margin-top:8px;">✕ Rejected: ${escapeHtml(j.rejectionReason || "Did not meet posting guidelines.")}</p>` : ""}
        <div class="flex gap-2 mt-3">
          ${j.status === "open" || j.status === "pending_review" || j.status === "rejected" ? `<button class="btn btn-danger btn-sm" data-delete-job="${j.id}">Delete</button>` : ""}
          ${j.status === "submitted" ? `<button class="btn btn-primary btn-sm" data-pay-job="${j.id}" data-amount="${j.budget}">Release payment ${money(j.budget)}</button>` : ""}
          ${j.status === "completed" ? `<button class="btn btn-outline btn-sm" data-review-job="${j.id}">Leave review</button>` : ""}
        </div>
      </div>`).join("");
    el.querySelectorAll("[data-delete-job]").forEach((b) => b.addEventListener("click", async () => { if (confirm("Delete this job posting?")) { await API.deleteJob({ id: b.dataset.deleteJob }); toast("Job deleted", "success"); this.renderMyJobs(); } }));
    el.querySelectorAll("[data-pay-job]").forEach((b) => b.addEventListener("click", async () => {
      const res = await API.payWriter({ jobId: b.dataset.payJob });
      if (res.ok) { toast("Payment released to writer", "success"); this.renderMyJobs(); this.renderOverview(); } else toast(res.error, "error");
    }));
  },

  async renderApplicants() {
    const el = document.getElementById("applicants-list");
    const res = await API.getApplications({ clientId: CURRENT_SESSION.user.id });
    if (!res.applications.length) { el.innerHTML = emptyState("👥", "No applicants yet", "Applications to your jobs will appear here."); return; }
    el.innerHTML = res.applications.map((a) => `
      <div class="glass-card glass mb-2">
        <div class="flex-between">
          <div class="flex gap-2"><div class="avatar sm">${initials(a.writerName)}</div>
            <div><strong>${escapeHtml(a.writerName)}</strong><p class="muted" style="font-size:.8rem;">Applied for "${escapeHtml(a.job ? a.job.title : "")}" • Proposed ${money(a.proposedRate)}</p></div>
          </div>
          ${statusBadge(a.status)}
        </div>
        <p class="body-md mt-2">${escapeHtml(a.coverLetter)}</p>
        ${a.status === "pending" ? `<div class="flex gap-2 mt-3">
          <button class="btn btn-primary btn-sm" data-accept="${a.id}">Accept</button>
          <button class="btn btn-outline btn-sm" data-reject="${a.id}">Reject</button>
          <button class="btn btn-ghost btn-sm" data-msg-writer="${a.writerId}" data-msg-name="${escapeHtml(a.writerName)}">Message</button>
        </div>` : `<div class="mt-3"><button class="btn btn-ghost btn-sm" data-msg-writer="${a.writerId}" data-msg-name="${escapeHtml(a.writerName)}">Message</button></div>`}
      </div>`).join("");
    el.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", async () => { const r = await API.acceptWriter({ applicationId: b.dataset.accept }); if (r.ok) { toast("Writer accepted", "success"); this.renderApplicants(); } }));
    el.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", async () => { const r = await API.rejectWriter({ applicationId: b.dataset.reject }); if (r.ok) { toast("Application rejected", "info"); this.renderApplicants(); } }));
    el.querySelectorAll("[data-msg-writer]").forEach((b) => b.addEventListener("click", () => {
      document.querySelector('[data-section-link="messages"]')?.click();
      const threadId = startThreadWith(b.dataset.msgWriter, b.dataset.msgName);
      const panel = document.getElementById("chat-panel"), list = document.getElementById("chat-list");
      renderThreads(list, panel).then(() => openThread(threadId, b.dataset.msgWriter, b.dataset.msgName, panel, list));
    }));
  },

  async renderPayments() {
    const el = document.getElementById("payments-list");
    const res = await API.getTransactions({ userId: CURRENT_SESSION.user.id });
    if (!res.transactions.length) { el.innerHTML = emptyState("💳", "No transactions", "Deposits, withdrawals and job payments show here."); return; }
    el.innerHTML = `<table class="data-table"><thead><tr><th>Type</th><th>Method</th><th>Amount</th><th>Date</th></tr></thead><tbody>${res.transactions.map((t) => `
      <tr><td style="text-transform:capitalize;">${t.type || "Job payment"}</td><td>${t.method ? PaymentMethods.methodBadge(t.method) : '<span class="muted">—</span>'}</td><td>${money(t.amount)}</td><td class="muted">${new Date(t.createdAt).toLocaleDateString()}</td></tr>`).join("")}</tbody></table>`;
  },

  async renderWallet() {
    const res = await API.getWallet({ userId: CURRENT_SESSION.user.id });
    document.getElementById("wallet-balance").textContent = money(res.wallet.balance);
    renderWalletTransactions(document.getElementById("wallet-tx-list"), CURRENT_SESSION.user.id);
  },

  wireWallet() {
    const form = document.getElementById("deposit-form");
    if (!form) return;
    PaymentMethods.wire(document.getElementById("deposit-methods"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = Number(form.amount.value);
      if (!amount || amount <= 0) return toast("Enter a valid amount", "error");
      const method = PaymentMethods.getSelected(document.getElementById("deposit-methods"));
      const data = PaymentMethods.collect(form, method);
      const err = PaymentMethods.validate(method, data);
      if (err) return toast(err, "error");

      const processingEl = document.getElementById("deposit-processing");
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      await PaymentMethods.simulateProcess(processingEl, method, "deposit");
      const reference = PaymentMethods.reference(method);
      const res = await API.deposit({ userId: CURRENT_SESSION.user.id, amount, method, accountRef: data.accountRef, accountName: data.accountName || "", reference });
      submitBtn.disabled = false;
      if (res.ok) {
        PaymentMethods.showResult(processingEl, true, `Deposited ${money(amount)} via ${PaymentMethods.labels[method]}`, reference);
        toast(`Deposited ${money(amount)} via ${PaymentMethods.labels[method]}`, "success");
        form.reset();
        this.renderWallet(); this.renderOverview();
      } else {
        PaymentMethods.showResult(processingEl, false, res.error);
        toast(res.error, "error");
      }
    });
  },

  async renderReviews() {
    const el = document.getElementById("client-reviews-list");
    el.innerHTML = emptyState("⭐", "Reviews you've given", "Leave a review after a job is completed from My Jobs.");
  },

  wireSettings() {
    const form = document.getElementById("client-settings-form");
    if (!form) return;
    const u = CURRENT_SESSION.user;
    form.fullName.value = u.fullName; form.email.value = u.email; form.phone.value = u.phone || ""; form.country.value = u.country || "";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await API.updateProfile({ id: u.id, updates: { fullName: form.fullName.value, phone: form.phone.value, country: form.country.value } });
      if (res.ok) { toast("Profile updated", "success"); Auth.setSession(res.user, CURRENT_SESSION.token, true); populateProfileWidgets(res.user); }
    });
  },
};

/* ============================================================
   WRITER DASHBOARD
   ============================================================ */
const WriterDash = {
  async init() {
    await this.renderOverview();
    document.getElementById("nav-available-jobs")?.addEventListener("click", () => this.renderAvailableJobs());
    document.getElementById("nav-my-applications")?.addEventListener("click", () => this.renderApplications());
    document.getElementById("nav-active-jobs")?.addEventListener("click", () => this.renderActiveJobs());
    document.getElementById("nav-completed-jobs")?.addEventListener("click", () => this.renderCompletedJobs());
    document.getElementById("nav-messages")?.addEventListener("click", () => renderThreads(document.getElementById("chat-list"), document.getElementById("chat-panel")));
    document.getElementById("nav-notifications")?.addEventListener("click", () => renderNotifications(document.getElementById("notif-list")));
    document.getElementById("nav-wallet")?.addEventListener("click", () => this.renderWallet());
    document.getElementById("nav-referrals")?.addEventListener("click", () => renderReferrals());
    this.wireWithdraw();
    this.wireSettings();
    wireChatInput(document.getElementById("chat-panel"), document.getElementById("chat-list"));
  },

  async renderOverview() {
    const user = CURRENT_SESSION.user;
    const [appsRes, walletRes, jobsRes] = await Promise.all([
      API.getApplications({ writerId: user.id }), API.getWallet({ userId: user.id }), API.getJobs({}),
    ]);
    const active = appsRes.applications.filter((a) => a.status === "accepted" && a.job && a.job.status !== "completed");
    const completed = appsRes.applications.filter((a) => a.job && a.job.status === "completed");
    document.getElementById("kpi-active").textContent = active.length;
    document.getElementById("kpi-completed").textContent = completed.length;
    document.getElementById("kpi-earnings").textContent = money(walletRes.wallet.balance);
    document.getElementById("kpi-rating").textContent = (user.rating || 0).toFixed(1);
    buildDonut(document.getElementById("writer-donut"), Math.min(100, Math.round((completed.length / Math.max(1, appsRes.applications.length)) * 100)), "#4f7cff", "#c084fc");
    const recentJobs = jobsRes.jobs.filter((j) => j.status === "open").slice(0, 4);
    document.getElementById("writer-suggested-jobs").innerHTML = recentJobs.length ? recentJobs.map((j) => `
      <div class="job-card glass mb-2"><div class="flex-between"><h4>${escapeHtml(j.title)}</h4><span class="job-budget">${money(j.budget)}</span></div>
      <p class="muted" style="font-size:.85rem;">${escapeHtml(j.category)} • ${escapeHtml(j.clientName)}</p></div>`).join("") : emptyState("🔍", "No open jobs right now", "Check back soon.");
  },

  async renderAvailableJobs(filters = {}) {
    const el = document.getElementById("available-jobs-list");
    const res = await API.getJobs({ status: "open" });
    let jobs = res.jobs;
    if (filters.category) jobs = jobs.filter((j) => j.category === filters.category);
    if (filters.q) jobs = jobs.filter((j) => j.title.toLowerCase().includes(filters.q.toLowerCase()));
    if (!jobs.length) { el.innerHTML = emptyState("🔍", "No jobs match", "Try a different search or category."); return; }
    el.innerHTML = jobs.map((j) => `
      <div class="job-card glass mb-2">
        <div class="flex-between"><h4>${escapeHtml(j.title)}</h4><span class="job-budget">${money(j.budget)}</span></div>
        <p class="muted" style="font-size:.85rem;">${escapeHtml(j.category)} • ${escapeHtml(j.clientName)}</p>
        <p class="body-md mt-2">${escapeHtml(j.description)}</p>
        <div class="job-meta"><span>Deadline: ${new Date(j.deadline).toLocaleDateString()}</span></div>
        <button class="btn btn-primary btn-sm mt-3" data-apply="${j.id}" data-title="${escapeHtml(j.title)}">Apply now</button>
      </div>`).join("");
    el.querySelectorAll("[data-apply]").forEach((b) => b.addEventListener("click", () => openApplyModal(b.dataset.apply, b.dataset.title)));
  },

  async renderApplications() {
    const el = document.getElementById("my-applications-list");
    const res = await API.getApplications({ writerId: CURRENT_SESSION.user.id });
    if (!res.applications.length) { el.innerHTML = emptyState("📨", "No applications yet", "Apply to jobs from Available Jobs."); return; }
    el.innerHTML = res.applications.map((a) => `
      <div class="glass-card glass mb-2"><div class="flex-between"><h4>${escapeHtml(a.job ? a.job.title : "Job removed")}</h4>${statusBadge(a.status)}</div>
      <p class="muted" style="font-size:.85rem;">Proposed ${money(a.proposedRate)} • ${timeAgo(a.createdAt)}</p></div>`).join("");
  },

  async renderActiveJobs() {
    const el = document.getElementById("active-jobs-list");
    const res = await API.getApplications({ writerId: CURRENT_SESSION.user.id });
    const active = res.applications.filter((a) => a.status === "accepted" && a.job && a.job.status !== "completed");
    if (!active.length) { el.innerHTML = emptyState("🛠️", "No active jobs", "Accepted jobs in progress show here."); return; }
    el.innerHTML = active.map((a) => `
      <div class="glass-card glass mb-2"><div class="flex-between"><h4>${escapeHtml(a.job.title)}</h4>${statusBadge(a.job.status)}</div>
      <p class="muted" style="font-size:.85rem;">${money(a.job.budget)} • Client: ${escapeHtml(a.job.clientName)}</p>
      ${a.job.status !== "submitted" ? `<button class="btn btn-primary btn-sm mt-2" data-upload="${a.job.id}">Upload completed work</button>` : `<p class="muted mt-2" style="font-size:.8rem;">Submitted — awaiting client payment.</p>`}
      </div>`).join("");
    el.querySelectorAll("[data-upload]").forEach((b) => b.addEventListener("click", () => openUploadModal(b.dataset.upload)));
  },

  async renderCompletedJobs() {
    const el = document.getElementById("completed-jobs-list");
    const res = await API.getApplications({ writerId: CURRENT_SESSION.user.id });
    const done = res.applications.filter((a) => a.job && a.job.status === "completed");
    el.innerHTML = done.length ? done.map((a) => `
      <div class="glass-card glass mb-2"><div class="flex-between"><h4>${escapeHtml(a.job.title)}</h4>${statusBadge("completed")}</div>
      <p class="muted" style="font-size:.85rem;">Earned ${money(a.job.budget)}</p></div>`).join("") : emptyState("✅", "No completed jobs yet", "Finished jobs will show here.");
  },

  async renderWallet() {
    const res = await API.getWallet({ userId: CURRENT_SESSION.user.id });
    document.getElementById("writer-wallet-balance").textContent = money(res.wallet.balance);
    renderWalletTransactions(document.getElementById("writer-wallet-tx-list"), CURRENT_SESSION.user.id);
    const cfg = await getEffectiveSiteConfig();
    const maxLabel = document.getElementById("max-withdraw-label");
    if (maxLabel) maxLabel.textContent = money(cfg.MAX_WITHDRAWAL_USD);
  },

  wireWithdraw() {
    const form = document.getElementById("withdraw-form");
    if (!form) return;
    PaymentMethods.wire(document.getElementById("withdraw-methods"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = Number(form.amount.value);
      if (!amount || amount <= 0) return toast("Enter a valid amount", "error");
      const cfg = await getEffectiveSiteConfig();
      if (amount > cfg.MAX_WITHDRAWAL_USD) return toast(`Withdrawals are capped at ${money(cfg.MAX_WITHDRAWAL_USD)} per request.`, "error");
      const method = PaymentMethods.getSelected(document.getElementById("withdraw-methods"));
      const data = PaymentMethods.collect(form, method);
      const err = PaymentMethods.validate(method, data);
      if (err) return toast(err, "error");

      const processingEl = document.getElementById("withdraw-processing");
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      await PaymentMethods.simulateProcess(processingEl, method, "withdraw");
      const reference = PaymentMethods.reference(method);
      const res = await API.withdraw({ userId: CURRENT_SESSION.user.id, amount, method, accountRef: data.accountRef, accountName: data.accountName || "", reference });
      submitBtn.disabled = false;
      if (res.ok) {
        PaymentMethods.showResult(processingEl, true, `Withdrawal of ${money(amount)} sent via ${PaymentMethods.labels[method]}`, reference);
        toast(`Withdrawal of ${money(amount)} requested`, "success");
        form.reset();
        this.renderWallet();
      } else {
        PaymentMethods.showResult(processingEl, false, res.error);
        toast(res.error, "error");
      }
    });
  },

  wireSettings() {
    const form = document.getElementById("writer-settings-form");
    if (!form) return;
    const u = CURRENT_SESSION.user;
    form.fullName.value = u.fullName; form.bio.value = u.bio || ""; form.skills.value = (u.skills || []).join(", "); form.rate.value = u.rate || "";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await API.updateProfile({ id: u.id, updates: { fullName: form.fullName.value, bio: form.bio.value, skills: form.skills.value.split(",").map((s) => s.trim()).filter(Boolean), rate: Number(form.rate.value) } });
      if (res.ok) { toast("Profile updated", "success"); Auth.setSession(res.user, CURRENT_SESSION.token, true); populateProfileWidgets(res.user); }
    });
  },
};

function openApplyModal(jobId, title) {
  document.getElementById("apply-job-title").textContent = title;
  document.getElementById("apply-job-id").value = jobId;
  openModal("apply-modal");
}
function openUploadModal(jobId) {
  document.getElementById("upload-job-id").value = jobId;
  openModal("upload-modal");
}

document.addEventListener("DOMContentLoaded", () => {
  const applyForm = document.getElementById("apply-form");
  if (applyForm) applyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const jobId = document.getElementById("apply-job-id").value;
    const res = await API.applyJob({ jobId, writerId: CURRENT_SESSION.user.id, writerName: CURRENT_SESSION.user.fullName, coverLetter: applyForm.coverLetter.value, proposedRate: applyForm.proposedRate.value });
    if (res.ok) { toast("Application submitted", "success"); closeModal("apply-modal"); applyForm.reset(); WriterDash.renderAvailableJobs(); }
    else toast(res.error, "error");
  });

  const uploadForm = document.getElementById("upload-form");
  if (uploadForm) uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const jobId = document.getElementById("upload-job-id").value;
    const fileName = uploadForm.file.files[0] ? uploadForm.file.files[0].name : "submission.docx";
    const res = await API.uploadWork({ jobId, fileName, note: uploadForm.note.value });
    if (res.ok) { toast("Work submitted to client", "success"); closeModal("upload-modal"); uploadForm.reset(); WriterDash.renderActiveJobs(); }
  });

  const jobSearchForm = document.getElementById("job-filter-form");
  if (jobSearchForm) jobSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    WriterDash.renderAvailableJobs({ category: jobSearchForm.category.value, q: jobSearchForm.q.value });
  });
});

/* ============================================================
   ADMIN DASHBOARD
   ============================================================ */
const AdminDash = {
  async init() {
    await this.renderOverview();
    document.getElementById("nav-users")?.addEventListener("click", () => this.renderUsers());
    document.getElementById("nav-jobs")?.addEventListener("click", () => this.renderJobs());
    document.getElementById("nav-payments")?.addEventListener("click", () => this.renderPayments());
    document.getElementById("nav-support")?.addEventListener("click", () => this.renderSupport());
    document.getElementById("nav-analytics")?.addEventListener("click", () => this.renderAnalytics());
    document.getElementById("nav-job-approvals")?.addEventListener("click", () => this.renderJobApprovals());
    document.getElementById("nav-access-requests")?.addEventListener("click", () => this.renderAccessRequests());
    document.getElementById("nav-admin-messages")?.addEventListener("click", () => this.renderMessages());
    document.querySelector('[data-section-link="wallet"]')?.addEventListener("click", () => this.renderWallets());
    document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.closeModal)));
  },

  /** Every user's wallet balance in one table. */
  async renderWallets() {
    const el = document.getElementById("admin-wallets-list");
    const res = await API.adminGetAllWallets();
    if (!res.wallets.length) { el.innerHTML = emptyState("💰", "No wallets yet", ""); return; }
    el.innerHTML = `<table class="data-table"><thead><tr><th>Name</th><th>Role</th><th>Balance</th><th>Escrow</th></tr></thead><tbody>${res.wallets.map((w) => `
      <tr><td><div class="flex gap-2"><div class="avatar sm">${initials(w.name)}</div>${escapeHtml(w.name)}</div></td>
      <td style="text-transform:capitalize;">${w.role}</td><td>${money(w.balance)}</td><td>${money(w.escrow)}</td></tr>`).join("")}</tbody></table>`;
  },

  async renderOverview() {
    const res = await API.adminStats();
    const s = res.stats;
    document.getElementById("kpi-writers").textContent = s.writers;
    document.getElementById("kpi-clients").textContent = s.clients;
    document.getElementById("kpi-jobs").textContent = s.jobs;
    document.getElementById("kpi-paid").textContent = money(s.totalPaid);
    buildBarChart(document.getElementById("admin-chart"),
      [{ label: "Writers", value: s.writers }, { label: "Clients", value: s.clients }, { label: "Jobs", value: s.jobs }, { label: "Done", value: s.completedJobs }, { label: "Tickets", value: s.openTickets }],
      "label", "value");

    const jobBadge = document.getElementById("job-approval-count");
    if (s.pendingJobs > 0) { jobBadge.textContent = s.pendingJobs; jobBadge.style.display = "inline-block"; } else jobBadge.style.display = "none";
    const accBadge = document.getElementById("access-request-count");
    if (s.pendingAccessRequests > 0) { accBadge.textContent = s.pendingAccessRequests; accBadge.style.display = "inline-block"; } else accBadge.style.display = "none";
  },

  /** Client jobs waiting on admin review before writers can see them. */
  async renderJobApprovals() {
    const el = document.getElementById("job-approvals-list");
    const res = await API.getJobs({ status: "pending_review" });
    if (!res.jobs.length) { el.innerHTML = emptyState("✅", "Nothing to review", "New client job postings will appear here for approval before going live."); return; }
    el.innerHTML = res.jobs.map((j) => `
      <div class="glass-card glass mb-2">
        <div class="flex-between"><h4>${escapeHtml(j.title)}</h4><span class="job-budget">${money(j.budget)}</span></div>
        <p class="muted" style="font-size:.85rem;">${escapeHtml(j.category)} • Posted by ${escapeHtml(j.clientName)} • ${timeAgo(j.createdAt)}</p>
        <p class="body-md mt-2">${escapeHtml(j.description)}</p>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-primary btn-sm" data-approve-job="${j.id}">Approve &amp; publish</button>
          <button class="btn btn-danger btn-sm" data-reject-job="${j.id}">Reject</button>
        </div>
      </div>`).join("");
    el.querySelectorAll("[data-approve-job]").forEach((b) => b.addEventListener("click", async () => {
      const r = await API.adminApproveJob({ jobId: b.dataset.approveJob });
      if (r.ok) { toast("Job approved and published to writers", "success"); this.renderJobApprovals(); this.renderOverview(); }
    }));
    el.querySelectorAll("[data-reject-job]").forEach((b) => b.addEventListener("click", async () => {
      const reason = prompt("Reason for rejecting this job (shown to the client):", "Doesn't meet our posting guidelines.");
      if (reason === null) return;
      const r = await API.adminRejectJob({ jobId: b.dataset.rejectJob, reason });
      if (r.ok) { toast("Job rejected", "info"); this.renderJobApprovals(); this.renderOverview(); }
    }));
  },

  /** Client access-fee submissions (M-Pesa / PayPal / other) awaiting verification. */
  async renderAccessRequests() {
    const el = document.getElementById("access-requests-list");
    const res = await API.getAccessRequests({});
    if (!res.requests.length) { el.innerHTML = emptyState("💵", "No access-fee submissions yet", "Client payments for dashboard access will appear here."); return; }
    el.innerHTML = res.requests.map((r) => `
      <div class="glass-card glass mb-2">
        <div class="flex-between">
          <div class="flex gap-2"><div class="avatar sm">${initials(r.userName)}</div>
            <div><strong>${escapeHtml(r.userName)}</strong><p class="muted" style="font-size:.8rem;">${escapeHtml(r.userEmail)} • ${timeAgo(r.createdAt)}</p></div>
          </div>
          ${statusBadge(r.status)}
        </div>
        <div class="flex gap-2 mt-2">${PaymentMethods.methodBadge(r.method)}<span class="muted" style="font-size:.8rem;">Ref: ${escapeHtml(r.accountRef || "—")}${r.accountName ? " ("+escapeHtml(r.accountName)+")" : ""} • ${money(r.amount)}</span></div>
        <div class="glass" style="padding:10px 14px;margin-top:10px;font-family:var(--font-mono);font-size:.8rem;white-space:pre-wrap;">${escapeHtml(r.transactionMessage)}</div>
        ${r.status === "rejected" && r.reason ? `<p style="font-size:.8rem;color:var(--aurora-rose);margin-top:8px;">Rejected: ${escapeHtml(r.reason)}</p>` : ""}
        ${r.status === "pending" ? `<div class="flex gap-2 mt-3">
          <button class="btn btn-primary btn-sm" data-approve-access="${r.id}">Approve</button>
          <button class="btn btn-danger btn-sm" data-reject-access="${r.id}">Reject</button>
        </div>` : ""}
      </div>`).join("");
    el.querySelectorAll("[data-approve-access]").forEach((b) => b.addEventListener("click", async () => {
      const r = await API.approveAccessRequest({ id: b.dataset.approveAccess });
      if (r.ok) { toast("Client access approved", "success"); this.renderAccessRequests(); this.renderOverview(); }
    }));
    el.querySelectorAll("[data-reject-access]").forEach((b) => b.addEventListener("click", async () => {
      const reason = prompt("Reason for rejecting this payment:", "Transaction message could not be verified.");
      if (reason === null) return;
      const r = await API.rejectAccessRequest({ id: b.dataset.rejectAccess, reason });
      if (r.ok) { toast("Access request rejected", "info"); this.renderAccessRequests(); this.renderOverview(); }
    }));
  },

  /** Every message thread on the platform — click one to read the full
      conversation. Admin view is read-only by design. */
  async renderMessages() {
    const listEl = document.getElementById("admin-chat-list");
    const panelEl = document.getElementById("admin-chat-panel");
    const res = await API.adminGetAllThreads();
    if (!res.threads.length) { listEl.innerHTML = emptyState("💬", "No conversations yet", "Messages between clients and writers will appear here."); return; }
    const activeThread = panelEl.dataset.thread;
    listEl.innerHTML = res.threads.map((t) => `
      <div class="chat-thread-item ${t.threadId === activeThread ? "active" : ""}" data-thread="${t.threadId}">
        <div class="avatar sm">${initials(t.participantA.name)}</div>
        <div style="min-width:0;">
          <div class="name">${escapeHtml(t.participantA.name)} <span class="muted" style="font-weight:400;">↔</span> ${escapeHtml(t.participantB.name)}</div>
          <div class="preview">${escapeHtml(t.lastText)}</div>
        </div>
      </div>`).join("");

    const openAdminThread = async (thread) => {
      panelEl.dataset.thread = thread.threadId;
      panelEl.style.display = "flex";
      panelEl.querySelector("[data-chat-name]").textContent = `${thread.participantA.name} ↔ ${thread.participantB.name}`;
      panelEl.querySelector("[data-chat-avatar]").textContent = initials(thread.participantA.name);
      const msgsRes = await API.getMessages({ threadId: thread.threadId });
      const box = panelEl.querySelector("[data-chat-messages]");
      box.innerHTML = msgsRes.messages.map((m) => {
        const sender = m.fromId === thread.participantA.id ? thread.participantA : thread.participantB;
        return `<div class="msg-bubble ${m.fromId === thread.participantA.id ? "received" : "sent"}"><strong style="font-size:.72rem;opacity:.75;display:block;margin-bottom:2px;">${escapeHtml(sender.name)} (${sender.role})</strong>${escapeHtml(m.text)}<div class="msg-time">${new Date(m.createdAt).toLocaleString()}</div></div>`;
      }).join("");
      box.scrollTop = box.scrollHeight;
    };

    listEl.querySelectorAll("[data-thread]").forEach((item) => {
      item.addEventListener("click", () => {
        listEl.querySelectorAll(".chat-thread-item").forEach((i) => i.classList.toggle("active", i === item));
        const thread = res.threads.find((t) => t.threadId === item.dataset.thread);
        openAdminThread(thread);
      });
    });

    // Keep the inbox live while this section is open.
    clearInterval(chatThreadListPollTimer);
    chatThreadListPollTimer = setInterval(() => this.renderMessages(), 8000);
  },


  async renderUsers() {
    const el = document.getElementById("admin-users-list");
    const res = await API.adminGetUsers();
    el.innerHTML = `<table class="data-table"><thead><tr><th>Name</th><th>Role</th><th>Country</th><th>Access</th><th>Status</th><th></th></tr></thead><tbody>${res.users.map((u) => `
      <tr><td><div class="flex gap-2"><div class="avatar sm">${initials(u.fullName)}</div>${escapeHtml(u.fullName)}</div></td>
      <td style="text-transform:capitalize;">${u.role}</td><td>${escapeHtml(u.country || "—")}</td>
      <td>${u.role === "client" ? statusBadge(u.accessStatus || "unpaid") : '<span class="muted">—</span>'}</td>
      <td>${u.suspended ? '<span class="badge red">Suspended</span>' : '<span class="badge green">Active</span>'}</td>
      <td class="flex gap-2">
        <button class="btn btn-outline btn-sm" data-view-user="${u.id}">View</button>
        ${u.role !== "admin" ? `<button class="btn btn-sm ${u.suspended ? "btn-outline" : "btn-danger"}" data-toggle-user="${u.id}" data-suspended="${u.suspended ? 1 : 0}">${u.suspended ? "Reinstate" : "Suspend"}</button>` : ""}
      </td></tr>`).join("")}</tbody></table>`;
    el.querySelectorAll("[data-toggle-user]").forEach((b) => b.addEventListener("click", async () => {
      await API.adminSetUserStatus({ id: b.dataset.toggleUser, suspended: b.dataset.suspended === "0" });
      toast("User status updated", "success"); this.renderUsers();
    }));
    el.querySelectorAll("[data-view-user]").forEach((b) => b.addEventListener("click", () => this.viewUser(b.dataset.viewUser)));
  },

  /** Full detail view for a single client or writer — bio, skills, jobs,
      applications, wallet balance and access-fee history in one place. */
  async viewUser(id) {
    const res = await API.adminGetUserDetail({ id });
    if (!res.ok) return toast(res.error, "error");
    const u = res.user;
    const content = document.getElementById("user-detail-content");
    content.innerHTML = `
      <div class="flex gap-2 mb-3"><div class="avatar" style="width:56px;height:56px;font-size:1.2rem;">${initials(u.fullName)}</div>
        <div><h3>${escapeHtml(u.fullName)}</h3><p class="muted" style="font-size:.85rem;">${escapeHtml(u.email)} • ${escapeHtml(u.phone || "—")}</p>
        <span class="badge blue mt-1" style="display:inline-block;text-transform:capitalize;">${u.role}</span></div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div class="glass" style="padding:12px;"><div class="muted" style="font-size:.72rem;">Country</div><div>${escapeHtml(u.country || "—")}</div></div>
        <div class="glass" style="padding:12px;"><div class="muted" style="font-size:.72rem;">Wallet balance</div><div>${money(res.wallet.balance)}</div></div>
        ${u.role === "writer" ? `<div class="glass" style="padding:12px;"><div class="muted" style="font-size:.72rem;">Rating</div><div>★ ${(u.rating||0).toFixed(1)} (${u.completedJobs||0} jobs)</div></div>
        <div class="glass" style="padding:12px;"><div class="muted" style="font-size:.72rem;">Rate</div><div>${money(u.rate||0)}/hr</div></div>` : ""}
        ${u.role === "client" ? `<div class="glass" style="padding:12px;"><div class="muted" style="font-size:.72rem;">Access status</div><div>${statusBadge(u.accessStatus || "unpaid")}</div></div>
        <div class="glass" style="padding:12px;"><div class="muted" style="font-size:.72rem;">Jobs posted</div><div>${res.jobs.length}</div></div>` : ""}
        <div class="glass" style="padding:12px;"><div class="muted" style="font-size:.72rem;">Referral code</div><div style="font-family:var(--font-mono);font-size:.85rem;">${escapeHtml(u.referralCode || "—")}</div></div>
        <div class="glass" style="padding:12px;"><div class="muted" style="font-size:.72rem;">Referred by</div><div>${res.referredByName ? escapeHtml(res.referredByName) : "—"}</div></div>
      </div>
      ${res.referredCount ? `<p class="muted mb-3" style="font-size:.82rem;">🎁 Has referred ${res.referredCount} ${res.referredCount === 1 ? "person" : "people"} to the platform.</p>` : ""}
      ${u.bio ? `<p class="body-md mb-3">${escapeHtml(u.bio)}</p>` : ""}
      ${u.skills && u.skills.length ? `<div class="tag-row mb-3">${u.skills.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
      ${u.role === "client" && res.jobs.length ? `<h4 class="h-3 mb-2" style="font-size:1rem;">Job history</h4>${res.jobs.slice(0,5).map((j) => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--glass-border);"><span style="font-size:.85rem;">${escapeHtml(j.title)}</span>${statusBadge(j.status)}</div>`).join("")}` : ""}
      ${u.role === "writer" && res.applications.length ? `<h4 class="h-3 mb-2" style="font-size:1rem;">Recent applications</h4>${res.applications.slice(0,5).map((a) => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--glass-border);"><span style="font-size:.85rem;">${money(a.proposedRate)}</span>${statusBadge(a.status)}</div>`).join("")}` : ""}
    `;
    openModal("user-detail-modal");
  },

  async renderJobs() {
    const el = document.getElementById("admin-jobs-list");
    const res = await API.getJobs({});
    el.innerHTML = `<table class="data-table"><thead><tr><th>Title</th><th>Client</th><th>Budget</th><th>Status</th></tr></thead><tbody>${res.jobs.map((j) => `
      <tr><td>${escapeHtml(j.title)}</td><td>${escapeHtml(j.clientName)}</td><td>${money(j.budget)}</td><td>${statusBadge(j.status)}</td></tr>`).join("")}</tbody></table>`;
  },

  async renderPayments() {
    const el = document.getElementById("admin-payments-list");
    const res = await API.adminStats();
    el.innerHTML = `<div class="kpi-card glass"><div class="kpi-label">Total paid out to writers</div><div class="kpi-val">${money(res.stats.totalPaid)}</div></div>`;
  },

  async renderSupport() {
    const el = document.getElementById("admin-tickets-list");
    const res = await API.getTickets({});
    if (!res.tickets.length) { el.innerHTML = emptyState("🎫", "No support tickets", "Tickets submitted via the Support page appear here."); return; }
    el.innerHTML = res.tickets.map((t) => `
      <div class="glass-card glass mb-2"><div class="flex-between"><strong>${escapeHtml(t.subject)}</strong>${statusBadge(t.status === "open" ? "pending" : "completed")}</div>
      <p class="muted" style="font-size:.85rem;">${escapeHtml(t.name)} (${escapeHtml(t.email)}) • ${timeAgo(t.createdAt)}</p>
      <p class="body-md mt-2">${escapeHtml(t.message)}</p>
      ${t.status === "open" ? `<button class="btn btn-outline btn-sm mt-2" data-resolve="${t.id}">Mark resolved</button>` : ""}</div>`).join("");
    el.querySelectorAll("[data-resolve]").forEach((b) => b.addEventListener("click", async () => { await API.updateTicket({ id: b.dataset.resolve, updates: { status: "resolved" } }); toast("Ticket resolved", "success"); this.renderSupport(); }));
  },

  async renderAnalytics() {
    const res = await API.adminStats();
    buildDonut(document.getElementById("admin-donut"), Math.round((res.stats.completedJobs / Math.max(1, res.stats.jobs)) * 100), "#34d399", "#4f7cff");
  },
};
