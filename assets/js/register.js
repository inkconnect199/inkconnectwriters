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
  const identitySection = document.getElementById("identity-verification-section");
  const profileFields = document.getElementById("registration-profile-fields");
  const paystackOption = document.querySelector('#reg-payment-methods [data-method="paystack"]');
  if (!API.isUsingLiveBackend() && paystackOption) paystackOption.style.display = "none";
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
    const selectedRole = document.querySelector(".role-option.selected");
    if (selectedRole) selectRole(selectedRole);
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
    renderRegistrationProfileFields(opt.dataset.role);
    identitySection.style.display = roleNeedsIdentityVerification(opt.dataset.role) ? "block" : "none";
    // Both clients and writers pay the same one-time access fee (each
    // toggle independently controllable in SITE_CONFIG).
    const showPayment = roleNeedsAccessFee(opt.dataset.role);
    paymentSection.style.display = showPayment ? "block" : "none";
  }

  function renderRegistrationProfileFields(role) {
    const categories = ["Blog Writing", "SEO Content", "Copywriting", "Technical Writing", "Academic Writing", "Creative Writing", "Email Marketing", "Scriptwriting"];
    const categoryChoices = categories.map((category) =>
      `<label class="checkbox-row"><input type="checkbox" name="registration-skill" value="${escapeHtml(category)}"> ${escapeHtml(category)}</label>`
    ).join("");
    if (role === "writer") {
      profileFields.innerHTML = `
        <h3 class="h-3">Writer profile</h3>
        <div class="field mt-3"><label for="registration-bio">Professional introduction <span class="muted">(optional)</span></label><textarea id="registration-bio" maxlength="1200" placeholder="Tell clients about your writing experience and the work you do."></textarea></div>
        <div class="field registration-quiz-field" data-quiz-field="skills"><label id="registration-skills-label">Writing skills <span class="muted">(choose at least one)</span></label><div class="grid registration-skill-grid" role="group" aria-labelledby="registration-skills-label">${categoryChoices}</div><div class="field-error" aria-live="polite"></div></div>
        <div class="field-row">
          <div class="field registration-quiz-field" data-quiz-field="experience"><label for="registration-experience">Writing experience <span class="muted">(required)</span></label><select id="registration-experience" required><option value="">Choose an experience range</option><option>Just starting</option><option>1-2 years</option><option>3-5 years</option><option>6-10 years</option><option>10+ years</option></select><div class="field-error" aria-live="polite"></div></div>
          <div class="field"><label for="registration-rate">Starting hourly rate (USD)</label><input id="registration-rate" type="number" min="1" max="10000" placeholder="Optional"></div>
        </div>
        <div class="field"><label for="registration-education">Education or relevant training <span class="muted">(optional)</span></label><input id="registration-education" type="text" maxlength="160" placeholder="Optional"></div>
        <div class="field"><label for="registration-languages">Languages <span class="muted">(optional)</span></label><input id="registration-languages" type="text" maxlength="160" placeholder="e.g. English, Swahili"></div>
        <div class="field"><label for="registration-availability">Availability <span class="muted">(optional)</span></label><select id="registration-availability"><option value="">Choose availability (optional)</option><option>Available</option><option>Limited</option><option>Unavailable</option></select></div>
        <div class="field"><label for="registration-portfolio">Portfolio links (one HTTPS link per line)</label><textarea id="registration-portfolio" placeholder="Optional"></textarea></div>
        `;
    } else {
      profileFields.innerHTML = `
        <h3 class="h-3">Client profile</h3>
        <div class="field mt-3"><label for="registration-organization">Company or organization <span class="muted">(optional)</span></label><input id="registration-organization" type="text" maxlength="120" placeholder="Optional"></div>
        <div class="field"><label for="registration-bio">Company or project overview <span class="muted">(optional)</span></label><textarea id="registration-bio" maxlength="1200" placeholder="What are you working on or hoping to create? (optional)"></textarea></div>
        <div class="field registration-quiz-field" data-quiz-field="skills"><label id="registration-skills-label">Writing services you may need <span class="muted">(choose at least one)</span></label><div class="grid registration-skill-grid" role="group" aria-labelledby="registration-skills-label">${categoryChoices}</div><div class="field-error" aria-live="polite"></div></div>
        <div class="field registration-quiz-field" data-quiz-field="budget"><label for="registration-budget">Typical project budget <span class="muted">(required)</span></label><select id="registration-budget" required><option value="">Choose a budget range</option><option>Under $100</option><option>$100-$500</option><option>$501-$2,000</option><option>Over $2,000</option><option>Not sure yet</option></select><div class="field-error" aria-live="polite"></div></div>`;
    }
    profileFields.querySelectorAll('input[name="registration-skill"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (profileFields.querySelector('input[name="registration-skill"]:checked')) {
          Validate.clearError(profileFields.querySelector('[data-quiz-field="skills"]'));
        }
      });
    });
    profileFields.querySelectorAll("select[required]").forEach((select) => {
      select.addEventListener("change", () => {
        if (select.value) Validate.clearError(select.closest(".registration-quiz-field"));
      });
    });
  }

  function validateRegistrationQuiz() {
    let valid = true;
    const skillField = profileFields.querySelector('[data-quiz-field="skills"]');
    const hasSkills = profileFields.querySelector('input[name="registration-skill"]:checked');
    if (!hasSkills) {
      Validate.showError(skillField, roleInput.value === "writer"
        ? "Choose at least one writing skill to continue."
        : "Choose at least one writing service you may need.");
      valid = false;
    } else {
      Validate.clearError(skillField);
    }

    const requiredSelect = profileFields.querySelector("select[required]");
    if (!requiredSelect || !requiredSelect.value) {
      const field = requiredSelect?.closest(".registration-quiz-field");
      if (field) {
        Validate.showError(field, roleInput.value === "writer"
          ? "Choose your writing experience to continue."
          : "Choose a budget range, or select Not sure yet.");
      }
      valid = false;
    } else {
      Validate.clearError(requiredSelect.closest(".registration-quiz-field"));
    }
    if (!valid) profileFields.querySelector(".has-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return valid;
  }

  function collectRegistrationProfile() {
    const updates = {
      bio: document.getElementById("registration-bio")?.value.trim() || "",
      skills: [...profileFields.querySelectorAll('input[name="registration-skill"]:checked')].map((input) => input.value),
      onboardingStep: 4,
    };
    if (roleInput.value === "writer") {
      const rateText = document.getElementById("registration-rate").value.trim();
      const portfolio = document.getElementById("registration-portfolio").value.split(/\r?\n/).map((link) => link.trim()).filter(Boolean);
      if (rateText && (!Number.isFinite(Number(rateText)) || Number(rateText) < 1 || Number(rateText) > 10000)) {
        toast("Enter an hourly rate between $1 and $10,000, or leave it blank.", "error");
        return null;
      }
      if (portfolio.some((link) => !Validate.httpsUrl(link))) {
        toast("Portfolio links must be valid HTTPS URLs, one per line.", "error");
        return null;
      }
      updates.experience = document.getElementById("registration-experience").value;
      updates.rate = rateText ? Number(rateText) : 0;
      updates.education = document.getElementById("registration-education").value.trim();
      updates.languages = document.getElementById("registration-languages").value.split(",").map((language) => language.trim()).filter(Boolean);
      updates.availability = document.getElementById("registration-availability").value || "Available";
      updates.portfolio = portfolio;
    } else {
      updates.organization = document.getElementById("registration-organization").value.trim();
      updates.preferredBudget = document.getElementById("registration-budget").value;
    }
    return updates;
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
    effectiveConfig = await getEffectiveSiteConfig();

    if (!roleInput.value) { toast("Please choose whether you're a client or a writer.", "error"); return; }
    if (!validateRegistrationQuiz()) {
      toast("Please answer the required signup questions before creating your account.", "error");
      return;
    }
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
    const profileUpdates = collectRegistrationProfile();
    if (!profileUpdates) valid = false;

    // Validate manual payment details only when Paystack checkout isn't selected.
    const needsPayment = roleNeedsAccessFee(roleInput.value);
    const needsIdentityVerification = roleNeedsIdentityVerification(roleInput.value);
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
    let identityVerification = null;
    if (needsIdentityVerification) {
      const health = await API.healthCheck();
      if (!health.ok || !health.features || health.features.identityVerification !== true) {
        toast(health.error || "Identity verification is not ready. Ask the administrator to deploy the updated backend and run setupSheets().", "error");
        return;
      }
      try {
        identityVerification = await IdentityVerification.collect(form, true);
      } catch (error) {
        toast(error.message, "error");
        valid = false;
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
      identityVerification,
    });

    let profileSaveFailed = false;
    let profileSaveError = "";
    if (res.ok) {
      const profileRes = await API.updateProfile({ id: res.user.id, updates: profileUpdates });
      if (profileRes.ok) {
        res.user = profileRes.user;
        const currentSession = Auth.getSession();
        Auth.setSession(res.user, currentSession.token, true);
      } else {
        profileSaveFailed = true;
        profileSaveError = profileRes.error || "Profile details could not be saved.";
        console.error("Registration profile details could not be saved:", profileSaveError);
      }
    }

    if (res.ok && needsPayment && paymentMethod === "paystack") {
      submitBtn.textContent = "Opening secure checkout...";
      const payment = await PaystackAccess.start(res.user);
      if (payment.ok) {
        res.user = payment.user;
        Auth.setSession(res.user, Auth.getSession().token, true);
        submitBtn.disabled = false;
        toast(profileSaveFailed ? "Account created, but profile details did not save. You can add them during onboarding." : "Payment verified — your account is active.", profileSaveFailed ? "error" : "success");
        setTimeout(() => { window.location.href = needsIdentityVerification ? "registration-pending.html" : "onboarding.html"; }, 700);
        return;
      }
      Auth.setSession(res.user, Auth.getSession().token, true);
      toast(profileSaveFailed ? `Account created, but profile details could not be saved. Finish them during onboarding. ${payment.error}` : payment.error, "error");
      submitBtn.disabled = false;
      setTimeout(() => { window.location.href = needsIdentityVerification ? "registration-pending.html" : "onboarding.html"; }, 900);
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
      const currentSession = Auth.getSession();
      Auth.setSession(res.user, currentSession ? currentSession.token : "local-" + res.user.id, true);
      toast(profileSaveFailed ? `Account created, but profile details could not be saved (${profileSaveError}). Finish them during onboarding.` : needsPayment ? "Account created — payment submitted for admin review." : needsIdentityVerification ? "Account created — your identity documents are pending admin review." : "Account created! Redirecting to your dashboard...", profileSaveFailed ? "error" : "success");
      setTimeout(() => (window.location.href = needsIdentityVerification || needsPayment ? "registration-pending.html" : "onboarding.html"), 700);
    } else {
      toast(res.error, "error");
    }

  });
});
