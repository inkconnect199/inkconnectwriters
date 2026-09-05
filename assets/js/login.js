document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.getSession();
  if (session) {
    const map = { client: "client-dashboard.html", writer: "writer-dashboard.html", admin: "admin-dashboard.html" };
    window.location.href = map[session.user.role] || "index.html";
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
        localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
        toast("Admin accounts sign in from the admin login page.", "error");
        return;
      }
      toast(`Welcome back, ${res.user.fullName.split(" ")[0]}!`, "success");
      const map = { client: "client-dashboard.html", writer: "writer-dashboard.html" };
      setTimeout(() => (window.location.href = map[res.user.role] || "index.html"), 500);
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
    document.getElementById("forgot-email-form").reset();
    document.getElementById("forgot-password-form").reset();
  }

  let forgotEmail = "";

  // STEP 1: verify the email exists before letting anyone set a new password.
  document.getElementById("forgot-email-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailField = document.getElementById("forgot-email").closest(".field");
    const email = document.getElementById("forgot-email").value.trim();
    if (!Validate.email(email)) { Validate.showError(emailField, "Enter a valid email address."); return; }
    Validate.clearError(emailField);

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Checking...";
    const res = await Auth.checkEmailExists(email);
    submitBtn.disabled = false; submitBtn.textContent = "Continue";

    if (!res.exists) { Validate.showError(emailField, "No account found with that email."); return; }
    forgotEmail = email;
    document.getElementById("forgot-email-display").textContent = email;
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

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Resetting...";
    const res = await Auth.resetPassword(forgotEmail, pass);
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
