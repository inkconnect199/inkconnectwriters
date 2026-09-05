document.addEventListener("DOMContentLoaded", () => {
  const session = Auth.getSession();
  if (session && session.user.role === "admin") { window.location.href = "admin-dashboard.html"; return; }

  const form = document.getElementById("admin-login-form");
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
    const res = await Auth.login(form.email.value.trim(), form.password.value, true);
    submitBtn.disabled = false; submitBtn.textContent = "Sign In as Admin";

    if (!res.ok) { toast(res.error, "error"); return; }
    if (res.user.role !== "admin") {
      localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
      toast("This account is not an administrator.", "error");
      return;
    }
    toast("Welcome back, " + res.user.fullName.split(" ")[0] + "!", "success");
    setTimeout(() => (window.location.href = "admin-dashboard.html"), 400);
  });
});
