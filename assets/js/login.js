document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.getSession();
  if (session) {
    if (session.user.role === "admin") {
      window.location.href = "admin-dashboard.html";
    } else if (Auth.needsOnboarding(session.user)) {
      window.location.href = "onboarding.html";
    } else {
      const needsPaymentReview = roleNeedsAccessFee(session.user.role) && session.user.accessStatus !== "active";
      window.location.href = needsPaymentReview ? "registration-pending.html" : "community.html";
    }
    return;
  }

  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailField = document.getElementById("email").closest(".field");
    const passField = document.getElementById("password").closest(".field");
    let valid = true;
    if (!Validate.email(form.email.value)) { Validate.showError(emailField, "Enter a valid email address."); valid = false; } else Validate.clearError(emailField);
    if (!Validate.required(form.password.value)) { Validate.showError(passField, "Password is required."); valid = false; } else Validate.clearError(passField);
    if (!valid) return;

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Signing in...";
    const res = await Auth.login(form.email.value.trim(), form.password.value, document.getElementById("remember").checked);
    submitBtn.disabled = false; submitBtn.textContent = "Sign In";

    if (res.ok) {
      // Admins have their own dedicated sign-in page — keep the public
      // login form for clients/writers only.
      if (res.user.role === "admin") {
        if (API_CONFIG.GAS_URL) await API.logout();
        localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
        toast("Admin accounts sign in from the admin login page.", "error");
        return;
      }
      toast(`Welcome back, ${res.user.fullName.split(" ")[0]}!`, "success");
      const needsPaymentReview = roleNeedsAccessFee(res.user.role) && res.user.accessStatus !== "active";
      const destination = Auth.needsOnboarding(res.user) ? "onboarding.html" : needsPaymentReview ? "registration-pending.html" : "community.html";
      setTimeout(() => (window.location.href = destination), 500);
    } else {
      toast(res.error, "error");
    }
  });

  document.getElementById("forgot-link").addEventListener("click", (e) => {
    e.preventDefault();
    resetForgotModal();
    openModal("forgot-modal");
  });
  document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.closeModal)));

  function resetForgotModal() {
    document.getElementById("forgot-step-email").style.display = "";
    document.getElementById("forgot-step-password").style.display = "none";
    document.getElementById("forgot-step-success").style.display = "none";
    document.getElementById("forgot-reset-token-field").style.display = "none";
    document.getElementById("forgot-email-form").reset();
    document.getElementById("forgot-password-form").reset();
  }

  let forgotEmail = "";

  // Remote resets require a one-time email code; the local demo stays self-contained.
  document.getElementById("forgot-email-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailField = document.getElementById("forgot-email").closest(".field");
    const email = document.getElementById("forgot-email").value.trim();
    if (!Validate.email(email)) { Validate.showError(emailField, "Enter a valid email address."); return; }
    Validate.clearError(emailField);

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = API_CONFIG.GAS_URL ? "Sending code..." : "Checking...";
    const res = API_CONFIG.GAS_URL
      ? await Auth.requestPasswordReset(email)
      : await Auth.checkEmailExists(email);
    submitBtn.disabled = false; submitBtn.textContent = "Continue";

    if (API_CONFIG.GAS_URL && !res.ok) {
      toast(res.error || "Could not send the reset code. Try again later.", "error");
      return;
    }
    if (!API_CONFIG.GAS_URL && !res.exists) { Validate.showError(emailField, "No account found with that email."); return; }
    forgotEmail = email;
    document.getElementById("forgot-email-display").textContent = email;
    document.getElementById("forgot-reset-token-field").style.display = API_CONFIG.GAS_URL ? "" : "none";
    document.getElementById("forgot-step-email").style.display = "none";
    document.getElementById("forgot-step-password").style.display = "";
  });

  // STEP 2: set the new password.
  document.getElementById("forgot-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = document.getElementById("forgot-new-password").value;
    const confirm = document.getElementById("forgot-confirm-password").value;
    const passField = document.getElementById("forgot-new-password").closest(".field");
    const confirmField = document.getElementById("forgot-confirm-password").closest(".field");
    let valid = true;
    if (!Validate.minLen(pass, 8)) { Validate.showError(passField, "Password must be at least 8 characters."); valid = false; } else Validate.clearError(passField);
    if (pass !== confirm || !confirm) { Validate.showError(confirmField, "Passwords do not match."); valid = false; } else Validate.clearError(confirmField);
    if (!valid) return;

    const resetToken = document.getElementById("forgot-reset-token").value.trim();
    if (API_CONFIG.GAS_URL && !resetToken) {
      const field = document.getElementById("forgot-reset-token").closest(".field");
      Validate.showError(field, "Enter the one-time code sent to your email.");
      return;
    }
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Resetting...";
    const res = await Auth.resetPassword(forgotEmail, pass, resetToken);
    submitBtn.disabled = false; submitBtn.textContent = "Reset password";

    if (res.ok) {
      document.getElementById("forgot-step-password").style.display = "none";
      document.getElementById("forgot-step-success").style.display = "";
    } else {
      toast(res.error, "error");
    }
  });

  document.getElementById("forgot-done-btn").addEventListener("click", () => closeModal("forgot-modal"));

  // Clears the local demo database (users, jobs, wallets, sessions — everything)
  // and reloads, so a stale/corrupted browser state can't block testing.
  document.getElementById("reset-demo-link").addEventListener("click", (e) => {
    e.preventDefault();
    if (!confirm("This clears all local demo data (accounts, jobs, messages, wallets) and reloads the page. Continue?")) return;
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  });
});
