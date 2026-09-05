/* ============================================================
   INKCONNECT — PAYMENT METHODS (M-Pesa / PayPal / Bank / Other)
   Shared UI logic for the deposit and withdraw forms. Handles
   method switching, per-method field validation, a realistic
   processing animation, and reference code display.

   When assets/js/api.js has a live GAS_URL configured AND the
   Apps Script backend has real M-Pesa Daraja / PayPal credentials
   set (see backend/SETUP.md), these same calls trigger a real
   STK push / PayPal payout. Without live credentials, the backend
   (and local demo mode) simulate an instant successful transfer
   so the flow is always fully testable.
   ============================================================ */

const PaymentMethods = {
  labels: { mpesa: "M-Pesa", paypal: "PayPal", card: "Visa/Mastercard", bank: "Bank / Other account" },

  wire(root) {
    const options = root.querySelectorAll(".method-option");
    // .method-fields panels are siblings of the method-grid (root), not
    // descendants of it — so they must be found via the shared parent.
    const scope = root.parentElement || root;
    options.forEach((opt) => {
      opt.addEventListener("click", () => {
        options.forEach((o) => o.classList.remove("selected"));
        opt.classList.add("selected");
        scope.querySelectorAll(".method-fields").forEach((f) => f.classList.toggle("active", f.dataset.methodFields === opt.dataset.method));
        // Card payments are entered directly (no external confirmation to
        // paste), so hide the "paste transaction message" field when present.
        const msgField = scope.querySelector("[data-tx-message-field]") || document.querySelector("[data-tx-message-field]");
        if (msgField) msgField.style.display = opt.dataset.method === "card" ? "none" : "";
      });
    });
  },

  getSelected(root) {
    const sel = root.querySelector(".method-option.selected");
    return sel ? sel.dataset.method : "mpesa";
  },

  collect(root, method) {
    if (method === "mpesa") return { accountRef: (root.querySelector('[data-field="mpesa-phone"]').value || "").trim() };
    if (method === "paypal") return { accountRef: (root.querySelector('[data-field="paypal-email"]').value || "").trim() };
    if (method === "card") {
      const number = (root.querySelector('[data-field="card-number"]').value || "").replace(/\s+/g, "");
      return {
        accountRef: number ? "•••• " + number.slice(-4) : "",
        accountName: (root.querySelector('[data-field="card-name"]').value || "").trim(),
        cardNumber: number,
        cardExpiry: (root.querySelector('[data-field="card-expiry"]').value || "").trim(),
        cardCvv: (root.querySelector('[data-field="card-cvv"]').value || "").trim(),
      };
    }
    if (method === "bank") return {
      accountRef: (root.querySelector('[data-field="bank-number"]').value || "").trim(),
      accountName: (root.querySelector('[data-field="bank-name"]').value || "").trim(),
    };
    return {};
  },

  validate(method, data) {
    if (method === "mpesa") {
      if (!/^(?:\+254|254|0)7\d{8}$/.test(data.accountRef.replace(/\s+/g, ""))) return "Enter a valid Safaricom M-Pesa number, e.g. 0712345678.";
    } else if (method === "paypal") {
      if (!Validate.email(data.accountRef)) return "Enter a valid PayPal email address.";
    } else if (method === "card") {
      const digits = data.cardNumber || "";
      if (digits.length < 13 || digits.length > 19 || !/^\d+$/.test(digits)) return "Enter a valid card number.";
      if (!/^\d{2}\/\d{2}$/.test(data.cardExpiry || "")) return "Enter the expiry as MM/YY.";
      const [mm, yy] = (data.cardExpiry || "").split("/").map(Number);
      if (mm < 1 || mm > 12) return "Enter a valid expiry month.";
      const expiryDate = new Date(2000 + yy, mm);
      if (expiryDate < new Date()) return "This card has expired.";
      if (!/^\d{3,4}$/.test(data.cardCvv || "")) return "Enter a valid CVV.";
      if (!data.accountName) return "Enter the name on the card.";
    } else if (method === "bank") {
      if (!data.accountName) return "Enter the account holder name.";
      if (!data.accountRef) return "Enter the account or reference number.";
    }
    return null;
  },

  /** For card payments there's nothing external to paste a confirmation
      for, so build a safe summary string (masked card, no CVV/full
      number) to stand in for the transaction message shown to admin. */
  cardSummary(data) {
    return `Visa/Mastercard ending in ${(data.cardNumber || "").slice(-4)}, expires ${data.cardExpiry || ""}, name: ${data.accountName || ""}`;
  },

  async simulateProcess(container, method, direction) {
    const steps = {
      mpesa: direction === "deposit"
        ? ["Sending STK push to your phone…", "Waiting for M-Pesa PIN confirmation…"]
        : ["Initiating M-Pesa payout…", "Confirming payout with Safaricom…"],
      paypal: direction === "deposit"
        ? ["Contacting PayPal…", "Waiting for payment approval…"]
        : ["Creating PayPal payout…", "Confirming payout…"],
      card: ["Contacting card network…", "Authorizing payment…"],
      bank: direction === "deposit"
        ? ["Recording transfer reference…", "Awaiting bank confirmation…"]
        : ["Queuing bank payout…", "Processing transfer…"],
    }[method];
    container.innerHTML = `<div class="processing-overlay glass"><div class="spinner"></div><div class="processing-title">${steps[0]}</div><div class="processing-sub" data-step2></div></div>`;
    await new Promise((r) => setTimeout(r, 900));
    const step2 = container.querySelector("[data-step2]");
    if (step2) step2.textContent = steps[1];
    await new Promise((r) => setTimeout(r, 1100));
  },

  reference(method) {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return { mpesa: "MPESA", paypal: "PAYPAL", card: "CARD", bank: "BANK" }[method] + "-" + rand;
  },

  showResult(container, ok, message, reference) {
    container.innerHTML = ok
      ? `<div class="tx-success glass"><div class="tx-check">✓</div><h4>${escapeHtml(message)}</h4><div class="tx-ref">Ref: ${reference}</div></div>`
      : `<div class="tx-success glass"><div class="tx-check" style="background:rgba(251,113,133,.15);color:var(--aurora-rose);">✕</div><h4>${escapeHtml(message)}</h4></div>`;
    setTimeout(() => { if (container) container.innerHTML = ""; }, 3400);
  },

  methodBadge(method) {
    const icons = { mpesa: "📱", paypal: "🅿️", card: "💳", bank: "🏦" };
    return `<span class="method-badge">${icons[method] || "💳"} ${PaymentMethods.labels[method] || method || "Wallet"}</span>`;
  },
};
