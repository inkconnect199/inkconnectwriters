document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.getSession();
  if (session) { window.location.href = "index.html"; return; }

  const countries = [
    ["US", "United States", "1"], ["GB", "United Kingdom", "44"], ["KE", "Kenya", "254"], ["NG", "Nigeria", "234"],
    ["GH", "Ghana", "233"], ["IN", "India", "91"], ["MX", "Mexico", "52"], ["CA", "Canada", "1"],
    ["ZA", "South Africa", "27"], ["AU", "Australia", "61"], ["NZ", "New Zealand", "64"], ["IE", "Ireland", "353"],
    ["FR", "France", "33"], ["DE", "Germany", "49"], ["IT", "Italy", "39"], ["ES", "Spain", "34"],
    ["NL", "Netherlands", "31"], ["BE", "Belgium", "32"], ["CH", "Switzerland", "41"], ["SE", "Sweden", "46"],
    ["NO", "Norway", "47"], ["DK", "Denmark", "45"], ["FI", "Finland", "358"], ["PL", "Poland", "48"],
    ["PT", "Portugal", "351"], ["GR", "Greece", "30"], ["TR", "Türkiye", "90"], ["AE", "United Arab Emirates", "971"],
    ["SA", "Saudi Arabia", "966"], ["EG", "Egypt", "20"], ["MA", "Morocco", "212"], ["ET", "Ethiopia", "251"],
    ["UG", "Uganda", "256"], ["TZ", "Tanzania", "255"], ["RW", "Rwanda", "250"], ["ZM", "Zambia", "260"],
    ["ZW", "Zimbabwe", "263"], ["SN", "Senegal", "221"], ["CI", "Côte d’Ivoire", "225"], ["CM", "Cameroon", "237"],
    ["BR", "Brazil", "55"], ["AR", "Argentina", "54"], ["CL", "Chile", "56"], ["CO", "Colombia", "57"],
    ["PE", "Peru", "51"], ["JM", "Jamaica", "1876"], ["TT", "Trinidad and Tobago", "1868"],
    ["CN", "China", "86"], ["JP", "Japan", "81"], ["KR", "South Korea", "82"], ["SG", "Singapore", "65"],
    ["MY", "Malaysia", "60"], ["PH", "Philippines", "63"], ["ID", "Indonesia", "62"], ["TH", "Thailand", "66"],
    ["VN", "Vietnam", "84"], ["PK", "Pakistan", "92"], ["BD", "Bangladesh", "880"], ["LK", "Sri Lanka", "94"],
    ["NP", "Nepal", "977"], ["IL", "Israel", "972"], ["UA", "Ukraine", "380"], ["RU", "Russia", "7"],
  ];
  const flagForCountry = (code) => Array.from(code, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
  const countrySelect = document.getElementById("country");
  countries.forEach(([code, name, dialCode]) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${flagForCountry(code)} ${name} (+${dialCode})`;
    option.dataset.iso = code;
    option.dataset.dialCode = dialCode;
    countrySelect.appendChild(option);
  });
  const phonePrefix = document.getElementById("phone-country-prefix");
  const updatePhoneCountry = () => {
    const selected = countrySelect.selectedOptions[0];
    if (!selected || !selected.dataset.dialCode) {
      phonePrefix.textContent = "Choose a country";
      document.getElementById("phone").placeholder = "Select country first";
      return;
    }
    phonePrefix.textContent = `${flagForCountry(selected.dataset.iso)} +${selected.dataset.dialCode}`;
    document.getElementById("phone").placeholder = `Number in ${selected.value}`;
  };
  countrySelect.addEventListener("change", updatePhoneCountry);
  const normalizePhone = (value, dialCode) => {
    let digits = String(value || "").trim().replace(/[^\d+]/g, "");
    if (digits.startsWith("00")) digits = "+" + digits.slice(2);
    if (digits.startsWith("+")) return "+" + digits.slice(1).replace(/\D/g, "");
    digits = digits.replace(/\D/g, "");
    const prefix = String(dialCode || "").replace(/\D/g, "");
    if (digits.startsWith(prefix)) return "+" + digits;
    return "+" + prefix + digits.replace(/^0+/, "");
  };

  // Preselect role from ?role= query param, and prefill a referral code
  // from ?ref= (e.g. shared as inkconnect.com/register.html?ref=amara8213)
  const params = new URLSearchParams(window.location.search);
  const presetRole = params.get("role");
  const roleInput = document.getElementById("role-input");
  const paymentSection = document.getElementById("client-payment-section");
  const paystackOption = document.querySelector('#reg-payment-methods [data-method="paystack"]');
  if (!API_CONFIG.GAS_URL && paystackOption) paystackOption.style.display = "none";
  document.querySelector('#reg-payment-methods [data-method="paystack"]')?.addEventListener("click", () => {
    document.querySelector("[data-paystack-note]").style.display = "block";
  });
  document.querySelectorAll('#reg-payment-methods .method-option:not([data-method="paystack"])').forEach((option) => {
    option.addEventListener("click", () => { document.querySelector("[data-paystack-note]").style.display = "none"; });
  });

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
    const bankDetails = [
      effectiveConfig.COMPANY_BANK_NAME,
      effectiveConfig.COMPANY_BANK_ACCOUNT_NAME ? `Account name: ${effectiveConfig.COMPANY_BANK_ACCOUNT_NAME}` : "",
      effectiveConfig.COMPANY_BANK_ACCOUNT_NUMBER ? `Account number: ${effectiveConfig.COMPANY_BANK_ACCOUNT_NUMBER}` : "",
      effectiveConfig.COMPANY_BANK_BRANCH ? `Branch / SWIFT: ${effectiveConfig.COMPANY_BANK_BRANCH}` : "",
    ].filter(Boolean);
    document.getElementById("fee-bank-details").textContent = bankDetails.join(" · ") || "Bank details will be provided by the administrator.";
    if (effectiveConfig.COMPANY_SOCIAL_LINK) {
      document.getElementById("follow-us-link").href = effectiveConfig.COMPANY_SOCIAL_LINK;
      document.getElementById("follow-us-note").style.display = "block";
    }
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
    profilePicData = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Choose a valid image file for your profile picture.", "error");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const source = new Image();
      source.onload = () => {
        const maxDimension = 320;
        const scale = Math.min(1, maxDimension / Math.max(source.naturalWidth, source.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          toast("Could not process this profile picture. Please choose another image.", "error");
          e.target.value = "";
          return;
        }
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        for (const quality of [0.82, 0.68, 0.54, 0.4]) {
          const compressed = canvas.toDataURL("image/jpeg", quality);
          if (compressed.length <= 45000) {
            profilePicData = compressed;
            document.getElementById("avatar-preview").innerHTML = `<img src="${compressed}" alt="Profile preview">`;
            return;
          }
        }
        toast("This image could not be compressed enough. Choose a smaller picture.", "error");
        e.target.value = "";
      };
      source.onerror = () => {
        toast("Could not read the selected profile picture. Please choose another image.", "error");
        e.target.value = "";
      };
      source.src = reader.result;
    };
    reader.onerror = () => toast("Could not read the selected profile picture. Please choose another image.", "error");
    reader.readAsDataURL(file);
  });

  const form = document.getElementById("register-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!roleInput.value) { toast("Please choose whether you're a client or a writer.", "error"); return; }
    if (!profilePicData) {
      toast("Please upload a profile picture before creating your account.", "error");
      document.getElementById("profile-picture").click();
      return;
    }

    const checks = [
      [form.fullName, Validate.required(form.fullName.value), "Full name is required."],
      [form.username, Validate.required(form.username.value) && form.username.value.length >= 3, "Username must be at least 3 characters."],
      [form.email, Validate.email(form.email.value), "Enter a valid email address."],
      [form.phone, /^\+[1-9]\d{6,14}$/.test(normalizePhone(form.phone.value, countrySelect.selectedOptions[0]?.dataset.dialCode)), "Enter a valid phone number for the selected country."],
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

    // Validate manual payment details only when Paystack checkout isn't selected.
    const needsPayment = roleNeedsAccessFee(roleInput.value);
    let paymentMethod = null, paymentData = null, txMessage = "";
    if (needsPayment) {
      paymentMethod = PaymentMethods.getSelected(document.getElementById("reg-payment-methods"));
      if (paymentMethod !== "paystack") {
        paymentData = PaymentMethods.collect(form, paymentMethod);
        if (paymentMethod === "mpesa" && paymentData.accountRef) paymentData.accountRef = normalizePhone(paymentData.accountRef, "254");
        const methodErr = PaymentMethods.validate(paymentMethod, paymentData);
        if (methodErr) { toast(methodErr, "error"); valid = false; }

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
      phone: normalizePhone(form.phone.value, countrySelect.selectedOptions[0]?.dataset.dialCode), country: form.country.value, role: roleInput.value,
      password: form.password.value, profilePic: profilePicData,
      referralCode: document.getElementById("referralCode").value.trim(),
    });

    if (res.ok && needsPayment && paymentMethod === "paystack") {
      submitBtn.textContent = "Opening secure checkout...";
      const payment = await PaystackAccess.start(res.user);
      if (payment.ok) {
        res.user = payment.user;
        Auth.setSession(res.user, Auth.getSession().token, true);
        submitBtn.disabled = false;
        toast("Payment verified — your account is active.", "success");
        setTimeout(() => { window.location.href = res.user.role === "writer" ? "writer-dashboard.html" : "client-dashboard.html"; }, 700);
        return;
      }
      Auth.setSession(res.user, Auth.getSession().token, true);
      toast(payment.error, "error");
      submitBtn.disabled = false;
      setTimeout(() => { window.location.href = "registration-pending.html"; }, 900);
      return;
    }

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
