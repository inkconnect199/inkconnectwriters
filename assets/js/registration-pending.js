/* ============================================================
   INKCONNECT — REGISTRATION UNDER REVIEW (standalone page)
   Both clients and writers land here right after registering (each
   role's own REQUIRE_*_ACCESS_FEE toggle in SITE_CONFIG controls
   whether this applies). Blocks entry to their dashboard until an
   admin approves the access-fee payment, then redirects there
   automatically — via periodic polling, no manual click required.
   Pulls the fee amount / M-Pesa number / PayPal email from
   getEffectiveSiteConfig() so admin edits (Site Settings) apply
   here immediately with no code change.
   ============================================================ */

const DASHBOARD_BY_ROLE = { client: "client-dashboard.html", writer: "writer-dashboard.html" };
let reviewPollTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  const session = Auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }
  if (!DASHBOARD_BY_ROLE[session.user.role]) { window.location.href = "admin-dashboard.html"; return; }

  const content = document.getElementById("review-content");
  content.innerHTML = `<div class="glass form-card text-center"><div class="spinner" style="margin:0 auto;"></div></div>`;

  const fresh = await API.getUser({ id: session.user.id });
  const user = fresh.ok ? fresh.user : session.user;
  if (fresh.ok) { Auth.setSession(fresh.user, session.token, true); }

  await render(user);
});

async function render(user) {
  clearInterval(reviewPollTimer);
  const content = document.getElementById("review-content");
  const status = user.accessStatus || "unpaid";
  const destination = DASHBOARD_BY_ROLE[user.role] || "index.html";

  if (status === "active" || !roleNeedsAccessFee(user.role)) {
    window.location.href = destination;
    return;
  }
  if (status === "pending") return renderPending(content, user);
  if (status === "rejected") return renderRejected(content, user);
  return renderPaymentForm(content, user);
}

function wireLogout(container) {
  container.querySelectorAll("[data-logout]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); }));
}

async function renderPaymentForm(content, user) {
  const c = await getEffectiveSiteConfig();
  content.innerHTML = `
    <div class="glass form-card form-wide" style="max-width:560px;">
      <div class="text-center mb-4">
        <span class="eyebrow">One-time access fee</span>
        <h2 class="h-2 mt-1">Unlock your ${escapeHtml(c.COMPANY_NAME)} dashboard</h2>
        <p class="body-md mt-2">Pay <strong>KES ${c.ACCESS_FEE_KES}</strong> (about <strong>$${c.ACCESS_FEE_USD}</strong>) using either option, then paste the confirmation message so our team can verify it.</p>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px; margin-bottom: var(--space-5);">
        <div class="glass" style="padding:14px;">
          <div class="muted" style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;">Pay via M-Pesa</div>
          <div style="font-family:var(--font-mono);font-weight:700;font-size:1.05rem;margin-top:4px;">${escapeHtml(c.COMPANY_MPESA_NUMBER)}</div>
          <div class="muted" style="font-size:.78rem;margin-top:2px;">Send Money / Buy Goods to this number</div>
        </div>
        <div class="glass" style="padding:14px;">
          <div class="muted" style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;">Pay via PayPal</div>
          <div style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;margin-top:4px;word-break:break-all;">${escapeHtml(c.COMPANY_PAYPAL_EMAIL)}</div>
          <div class="muted" style="font-size:.78rem;margin-top:2px;">Send as Friends &amp; Family</div>
        </div>
      </div>

      <form id="review-payment-form" novalidate>
        <div class="method-grid" id="review-methods">
          <div class="method-option selected" data-method="mpesa"><div class="method-icon">📱</div><div class="method-name">M-Pesa</div></div>
          <div class="method-option" data-method="paypal"><div class="method-icon">🅿️</div><div class="method-name">PayPal</div></div>
          <div class="method-option" data-method="card"><div class="method-icon">💳</div><div class="method-name">Visa/Mastercard</div></div>
          <div class="method-option" data-method="bank"><div class="method-icon">🏦</div><div class="method-name">Other</div></div>
        </div>
        <div class="method-fields active" data-method-fields="mpesa">
          <div class="field"><label for="review-mpesa-phone">The M-Pesa number you paid from</label><input type="tel" data-field="mpesa-phone" id="review-mpesa-phone" placeholder="07XX XXX XXX"></div>
        </div>
        <div class="method-fields" data-method-fields="paypal">
          <div class="field"><label for="review-paypal-email">Your PayPal email</label><input type="email" data-field="paypal-email" id="review-paypal-email" placeholder="you@example.com"></div>
        </div>
        <div class="method-fields" data-method-fields="card">
          <div class="field"><label for="review-card-number">Card number</label><input type="text" inputmode="numeric" data-field="card-number" id="review-card-number" placeholder="4242 4242 4242 4242" maxlength="19"></div>
          <div class="field-row">
            <div class="field"><label for="review-card-expiry">Expiry (MM/YY)</label><input type="text" data-field="card-expiry" id="review-card-expiry" placeholder="MM/YY" maxlength="5"></div>
            <div class="field"><label for="review-card-cvv">CVV</label><input type="text" inputmode="numeric" data-field="card-cvv" id="review-card-cvv" placeholder="123" maxlength="4"></div>
          </div>
          <div class="field"><label for="review-card-name">Name on card</label><input type="text" data-field="card-name" id="review-card-name"></div>
        </div>
        <div class="method-fields" data-method-fields="bank">
          <div class="field"><label for="review-bank-name">Your name on the transfer</label><input type="text" data-field="bank-name" id="review-bank-name"></div>
          <div class="field"><label for="review-bank-number">Reference / account number used</label><input type="text" data-field="bank-number" id="review-bank-number"></div>
        </div>
        <div class="field" data-tx-message-field>
          <label for="review-tx-message">Paste the transaction confirmation message</label>
          <textarea id="review-tx-message" placeholder="e.g. QWE1RTY2UI Confirmed. Ksh500.00 sent to InkConnect on 8/8/26 at 3:45 PM..."></textarea>
          <div class="field-error"></div>
        </div>
        <div id="review-processing"></div>
        <button type="submit" class="btn btn-primary btn-block">Submit for review</button>
      </form>
      <p class="text-center mt-3"><a href="#" data-logout style="font-size:.82rem;color:var(--text-2);">Log out</a></p>
    </div>`;

  PaymentMethods.wire(document.getElementById("review-methods"));
  wireLogout(content);

  document.getElementById("review-payment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const method = PaymentMethods.getSelected(document.getElementById("review-methods"));
    const data = PaymentMethods.collect(document.getElementById("review-payment-form"), method);
    const methodErr = PaymentMethods.validate(method, data);
    if (methodErr) return toast(methodErr, "error");

    let message = "";
    if (method === "card") {
      message = PaymentMethods.cardSummary(data);
    } else {
      const msgField = document.getElementById("review-tx-message").closest(".field");
      message = document.getElementById("review-tx-message").value.trim();
      if (message.length < 8) { Validate.showError(msgField, "Paste the full confirmation message you received."); return; }
      Validate.clearError(msgField);
    }

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    const res = await API.submitAccessPayment({
      userId: user.id, method, accountRef: data.accountRef, accountName: data.accountName || "",
      transactionMessage: message, amount: c.ACCESS_FEE_USD,
    });
    submitBtn.disabled = false;
    if (res.ok) {
      Auth.setSession(res.user, Auth.getSession().token, true);
      toast("Submitted — awaiting admin review.", "success");
      renderPending(content, res.user);
    } else {
      toast(res.error, "error");
    }
  });
}

function renderPending(content, user) {
  content.innerHTML = `
    <div class="glass form-card text-center">
      <div class="tx-check" style="background:rgba(251,191,36,.15);color:var(--aurora-amber);margin:0 auto 16px;">⏳</div>
      <h2 class="h-2">Registration under review</h2>
      <p class="body-md mt-2">Thanks — we've received your payment confirmation. An admin will verify it shortly and your dashboard will unlock automatically. You'll get a notification the moment it's approved.</p>
      <p class="muted mt-3" style="font-size:.78rem;" id="review-poll-status">Checking for approval every few seconds…</p>
      <button class="btn btn-outline btn-block mt-3" id="review-refresh-btn">Check approval status now</button>
      <p class="text-center mt-3"><a href="#" data-logout style="font-size:.82rem;color:var(--text-2);">Log out</a></p>
    </div>`;
  wireLogout(content);

  async function checkStatus(manual) {
    const res = await API.getUser({ id: user.id });
    if (!res.ok) return;
    Auth.setSession(res.user, Auth.getSession().token, true);
    if (res.user.accessStatus === "active") {
      clearInterval(reviewPollTimer);
      toast("Approved — redirecting to your dashboard!", "success");
      setTimeout(() => (window.location.href = DASHBOARD_BY_ROLE[res.user.role] || "index.html"), 600);
    } else if (res.user.accessStatus === "rejected") {
      clearInterval(reviewPollTimer);
      render(res.user);
    } else if (manual) {
      toast("Still pending review — check back soon.", "info");
    }
  }

  document.getElementById("review-refresh-btn").addEventListener("click", () => checkStatus(true));
  // Poll automatically so approval takes effect without the person needing
  // to do anything — the "Check approval status now" button above still
  // works for an immediate manual check.
  reviewPollTimer = setInterval(() => checkStatus(false), 6000);
}

function renderRejected(content, user) {
  const reason = user.accessRejectionReason || "We couldn't verify this payment.";
  content.innerHTML = `
    <div class="glass form-card text-center">
      <div class="tx-check" style="background:rgba(251,113,133,.15);color:var(--aurora-rose);margin:0 auto 16px;">✕</div>
      <h2 class="h-2">Payment not verified</h2>
      <p class="body-md mt-2">${escapeHtml(reason)}</p>
      <button class="btn btn-primary btn-block mt-4" id="review-retry-btn">Resubmit payment proof</button>
      <p class="text-center mt-3"><a href="#" data-logout style="font-size:.82rem;color:var(--text-2);">Log out</a></p>
    </div>`;
  wireLogout(content);
  document.getElementById("review-retry-btn").addEventListener("click", () => renderPaymentForm(content, user));
}
