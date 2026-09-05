/* ============================================================
   INKCONNECT — APP SHELL
   Loading screen, theme switching, mobile navigation, toasts,
   scroll-reveal animations and shared header/footer auth state.
   Runs on every page.
   ============================================================ */

/* ---------------- Loading screen ---------------- */
window.addEventListener("load", () => {
  const loader = document.getElementById("loading-screen");
  if (loader) setTimeout(() => loader.classList.add("hidden"), 550);
});

/* ---------------- Theme ---------------- */
const Theme = {
  key: "inkconnect_theme",
  init() {
    const saved = localStorage.getItem(Theme.key) || "dark";
    document.documentElement.setAttribute("data-theme", saved);
  },
  toggle() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(Theme.key, next);
  },
};
Theme.init();

/* ---------------- Toasts ---------------- */
function toast(message, type = "info") {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast glass ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(30px)";
    el.style.transition = "all .3s ease";
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---------------- Mobile nav + header auth state ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const mobileToggle = document.querySelector(".mobile-toggle");
  const mobileMenu = document.querySelector(".mobile-menu");
  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener("click", () => mobileMenu.classList.toggle("open"));
    mobileMenu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => mobileMenu.classList.remove("open")));
  }

  document.querySelectorAll(".theme-toggle").forEach((btn) => btn.addEventListener("click", Theme.toggle));

  // Highlight active nav link
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a, .mobile-menu a").forEach((a) => {
    if (a.getAttribute("href") === path) a.classList.add("active");
  });

  renderHeaderAuthState();
  initScrollReveal();
  initLogoutButtons();
  initChangePasswordForm();
});

/** Shared "Change password" form wiring — the same #change-password-form
    markup appears in client-dashboard.html, writer-dashboard.html and
    admin-dashboard.html Settings sections. */
function initChangePasswordForm() {
  const form = document.getElementById("change-password-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = Auth.getSession();
    if (!session) return;

    const current = document.getElementById("cp-current").value;
    const next = document.getElementById("cp-new").value;
    const confirm = document.getElementById("cp-confirm").value;
    const currentField = document.getElementById("cp-current").closest(".field");
    const nextField = document.getElementById("cp-new").closest(".field");
    const confirmField = document.getElementById("cp-confirm").closest(".field");

    let valid = true;
    if (!Validate.required(current)) { Validate.showError(currentField, "Enter your current password."); valid = false; } else Validate.clearError(currentField);
    if (!Validate.minLen(next, 8)) { Validate.showError(nextField, "New password must be at least 8 characters."); valid = false; } else Validate.clearError(nextField);
    if (next !== confirm || !confirm) { Validate.showError(confirmField, "Passwords do not match."); valid = false; } else Validate.clearError(confirmField);
    if (!valid) return;

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Updating...";
    const res = await Auth.changePassword(session.user.id, current, next);
    submitBtn.disabled = false; submitBtn.textContent = "Update password";

    if (res.ok) { toast("Password updated", "success"); form.reset(); }
    else toast(res.error, "error");
  });
}

function renderHeaderAuthState() {
  const guestSlots = document.querySelectorAll("[data-auth='guest']");
  const userSlots = document.querySelectorAll("[data-auth='user']");
  const session = typeof Auth !== "undefined" ? Auth.getSession() : null;
  if (session) {
    guestSlots.forEach((el) => (el.style.display = "none"));
    userSlots.forEach((el) => {
      el.style.display = "";
      const nameEl = el.querySelector("[data-user-name]");
      if (nameEl) nameEl.textContent = session.user.fullName.split(" ")[0];
      const avatarEl = el.querySelector("[data-user-avatar]");
      if (avatarEl) avatarEl.textContent = initials(session.user.fullName);
      const link = el.querySelector("[data-dashboard-link]");
      if (link) {
        const map = { client: "client-dashboard.html", writer: "writer-dashboard.html", admin: "admin-dashboard.html" };
        link.href = map[session.user.role] || "index.html";
      }
    });
  } else {
    guestSlots.forEach((el) => (el.style.display = ""));
    userSlots.forEach((el) => (el.style.display = "none"));
  }
}

function initLogoutButtons() {
  document.querySelectorAll("[data-logout]").forEach((btn) => btn.addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); }));
}

function initials(name) {
  return String(name || "").split(" ").filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join("") || "?";
}

/* ---------------- Scroll reveal ---------------- */
function initScrollReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("in-view"); io.unobserve(entry.target); } });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
}

/* ---------------- Form validation helpers ---------------- */
const Validate = {
  required(value) { return value && value.toString().trim().length > 0; },
  email(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); },
  minLen(value, n) { return value && value.length >= n; },
  match(a, b) { return a === b; },
  phone(value) { return /^[+\d][\d\s-]{6,}$/.test(value); },

  showError(fieldEl, message) {
    fieldEl.classList.add("has-error");
    const err = fieldEl.querySelector(".field-error");
    if (err) err.textContent = message;
  },
  clearError(fieldEl) {
    fieldEl.classList.remove("has-error");
    const err = fieldEl.querySelector(".field-error");
    if (err) err.textContent = "";
  },
};

/* ---------------- Modal helpers ---------------- */
function openModal(id) { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }
document.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("modal-overlay")) e.target.classList.remove("open");
});
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)));
});

/* ---------------- Small utils ---------------- */
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
function escapeHtml(str) {
  // Coerce first — Google Sheets sometimes returns a purely-numeric field
  // (an M-Pesa code, account number, etc.) as an actual Number rather
  // than a String, which would otherwise crash here.
  return String(str === null || str === undefined ? "" : str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function money(n) { return "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
