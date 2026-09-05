document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.getSession();
  if (session) { window.location.href = "index.html"; return; }

  // Preselect role from ?role= query param, and prefill a referral code
  // from ?ref= (e.g. shared as inkconnect.com/register.html?ref=amara8213)
  const params = new URLSearchParams(window.location.search);
  const presetRole = params.get("role");
  const roleInput = document.getElementById("role-input");
  const paymentSection = document.getElementById("client-payment-section");

  const refCode = params.get("ref");
  if (refCode) {
    document.getElementById("referralCode").value = refCode;
    document.getElementById("referral-note").style.display = "block";
  }
  document.getElementById("referralCode").addEventListener("input", (e) => {
    document.getElementById("referral-note").style.display = e.target.value.trim() ? "block" : "none";
  });

  // Fill in the fee amount / M-Pesa number / PayPal email — from
  // getEffectiveSiteConfig() so admin edits (Site Settings) apply here
  // immediately with no code change.
  let effectiveConfig = SITE_CONFIG;
  (async () => {
    effectiveConfig = await getEffectiveSiteConfig();
    document.getElementById("fee-amount-label").textContent = `KES ${effectiveConfig.ACCESS_FEE_KES} (~$${effectiveConfig.ACCESS_FEE_USD})`;
    document.getElementById("fee-mpesa-number").textContent = effectiveConfig.COMPANY_MPESA_NUMBER;
    document.getElementById("fee-paypal-email").textContent = effectiveConfig.COMPANY_PAYPAL_EMAIL;
  })();
  PaymentMethods.wire(document.getElementById("reg-payment-methods"));

  document.querySelectorAll(".role-option").forEach((opt) => {
    if (opt.dataset.role === presetRole) selectRole(opt);
    opt.addEventListener("click", () => selectRole(opt));
  });
  function selectRole(opt) {
    document.querySelectorAll(".role-option").forEach((o) => o.classList.remove("selected"));
    opt.classList.add("selected");
    roleInput.value = opt.dataset.role;
    // Both clients and writers pay the same one-time access fee (each
    // toggle independently controllable in SITE_CONFIG).
    const showPayment = roleNeedsAccessFee(opt.dataset.role);
    paymentSection.style.display = showPayment ? "block" : "none";
  }

  // Avatar preview
  let profilePicData = "";
  document.getElementById("profile-picture").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      profilePicData = reader.result;
      document.getElementById("avatar-preview").innerHTML = `<img src="${reader.result}" alt="Profile preview">`;
    };
    reader.readAsDataURL(file);
  });

  const form = document.getElementById("register-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!roleInput.value) { toast("Please choose whether you're a client or a writer.", "error"); return; }

    const checks = [
      [form.fullName, Validate.required(form.fullName.value), "Full name is required."],
      [form.username, Validate.required(form.username.value) && form.username.value.length >= 3, "Username must be at least 3 characters."],
      [form.email, Validate.email(form.email.value), "Enter a valid email address."],
      [form.phone, Validate.phone(form.phone.value), "Enter a valid phone number."],
      [form.country, Validate.required(form.country.value), "Please select a country."],
      [form.password, Validate.minLen(form.password.value, 8), "Password must be at least 8 characters."],
      [form.confirmPassword, Validate.match(form.password.value, form.confirmPassword.value) && form.confirmPassword.value.length > 0, "Passwords do not match."],
    ];
    let valid = true;
    checks.forEach(([el, ok, msg]) => {
      const field = el.closest(".field");
      if (!ok) { Validate.showError(field, msg); valid = false; } else Validate.clearError(field);
    });
    if (!document.getElementById("terms").checked) { toast("Please accept the Terms of Service to continue.", "error"); valid = false; }

    // Client + fee required: validate the payment method fields and transaction message too.
    const needsPayment = roleNeedsAccessFee(roleInput.value);
    let paymentMethod = null, paymentData = null, txMessage = "";
    if (needsPayment) {
      paymentMethod = PaymentMethods.getSelected(document.getElementById("reg-payment-methods"));
      paymentData = PaymentMethods.collect(form, paymentMethod);
      const methodErr = PaymentMethods.validate(paymentMethod, paymentData);
      if (methodErr) { toast(methodErr, "error"); valid = false; }

      if (paymentMethod === "card") {
        // Card payments are entered directly — no external message to paste.
        txMessage = PaymentMethods.cardSummary(paymentData);
      } else {
        const msgField = document.getElementById("reg-tx-message").closest(".field");
        txMessage = document.getElementById("reg-tx-message").value.trim();
        if (txMessage.length < 8) { Validate.showError(msgField, "Paste the full confirmation message you received."); valid = false; }
        else Validate.clearError(msgField);
      }
    }
    if (!valid) return;

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Creating account...";
    const res = await Auth.register({
      fullName: form.fullName.value.trim(), username: form.username.value.trim(), email: form.email.value.trim(),
      phone: form.phone.value.trim(), country: form.country.value, role: roleInput.value,
      password: form.password.value, profilePic: profilePicData,
      referralCode: document.getElementById("referralCode").value.trim(),
    });

    if (res.ok && needsPayment) {
      submitBtn.textContent = "Submitting payment for review...";
      await API.submitAccessPayment({
        userId: res.user.id, method: paymentMethod, accountRef: paymentData.accountRef,
        accountName: paymentData.accountName || "", transactionMessage: txMessage, amount: effectiveConfig.ACCESS_FEE_USD,
      });
      // Refresh the session with the now-"pending" accessStatus before redirecting.
      const refreshed = await API.getUser({ id: res.user.id });
      if (refreshed.ok) res.user = refreshed.user;
    }

    submitBtn.disabled = false; submitBtn.textContent = "Create Account";

    if (res.ok) {
      Auth.setSession(res.user, "local-" + res.user.id, true);
      toast(needsPayment ? "Account created — payment submitted for admin review." : "Account created! Redirecting to your dashboard...", "success");
      const map = { client: needsPayment ? "registration-pending.html" : "client-dashboard.html", writer: needsPayment ? "registration-pending.html" : "writer-dashboard.html", admin: "admin-dashboard.html" };
      setTimeout(() => (window.location.href = map[res.user.role] || "index.html"), 700);
    } else {
      toast(res.error, "error");
    }
  });
});
