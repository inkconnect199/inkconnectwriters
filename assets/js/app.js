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
  initSignupPromo();
  initNotificationPermissionControls();
  initNotificationPolling();
});

const NotificationSound = {
  key: "inkconnect_notification_sound",
  context: null,
  enabled() {
    return localStorage.getItem(NotificationSound.key) !== "off";
  },
  toggle() {
    const enabled = !NotificationSound.enabled();
    localStorage.setItem(NotificationSound.key, enabled ? "on" : "off");
    return enabled;
  },
  async unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      if (!NotificationSound.context) NotificationSound.context = new AudioContext();
      if (NotificationSound.context.state === "suspended") {
        await NotificationSound.context.resume();
      }
      return NotificationSound.context.state === "running";
    } catch (error) {
      console.warn("Notification sound could not be enabled:", error);
      return false;
    }
  },
  play() {
    if (!NotificationSound.enabled() || !NotificationSound.context || NotificationSound.context.state !== "running") return;
    try {
      const context = NotificationSound.context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.setValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
      gain.gain.setValueAtTime(0.12, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.23);
    } catch (error) {
      console.warn("Notification sound could not be played:", error);
    }
  },
};

window.addEventListener("pointerdown", NotificationSound.unlock, { once: true });
window.addEventListener("keydown", NotificationSound.unlock, { once: true });

function toast(message, type = "info", options = {}) {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast glass ${type}`;
  const text = document.createElement("span");
  text.className = "toast-message";
  text.textContent = message;
  el.appendChild(text);

  if (options.sound) {
    const soundButton = document.createElement("button");
    soundButton.type = "button";
    soundButton.className = "toast-sound-toggle";
    const updateSoundButton = () => {
      const enabled = NotificationSound.enabled();
      soundButton.textContent = enabled ? "Sound on" : "Sound off";
      soundButton.setAttribute("aria-label", enabled ? "Mute notification sounds" : "Enable notification sounds");
      soundButton.setAttribute("aria-pressed", String(enabled));
    };
    updateSoundButton();
    soundButton.addEventListener("click", () => {
      NotificationSound.toggle();
      NotificationSound.unlock();
      updateSoundButton();
    });
    el.appendChild(soundButton);
    NotificationSound.play();
  }

  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(30px)";
    el.style.transition = "all .3s ease";
    setTimeout(() => el.remove(), 300);
  }, 5000);
}

function applyNotificationAccent(config) {
  const accent = /^#[0-9a-f]{6}$/i.test(config.SIGNUP_POPUP_ACCENT || "") ? config.SIGNUP_POPUP_ACCENT : "#7657f6";
  document.documentElement.style.setProperty("--notification-accent", accent);
}

function initNotificationPermissionControls() {
  const enableButton = document.querySelector("[data-enable-browser-notifications]");
  const soundButton = document.querySelector("[data-toggle-notification-sound]");
  const status = document.querySelector("[data-notification-permission-status]");
  if (!enableButton || !soundButton || !status) return;

  const updateControls = () => {
    const supported = "Notification" in window;
    const permission = supported ? window.Notification.permission : "unsupported";
    enableButton.disabled = !supported || permission === "denied";
    enableButton.textContent = permission === "granted" ? "Browser alerts enabled" : "Enable browser alerts";
    soundButton.textContent = NotificationSound.enabled() ? "Mute notification sound" : "Enable notification sound";
    if (!supported) status.textContent = "This browser does not support desktop notifications.";
    else if (permission === "granted") status.textContent = "Browser pop-ups are enabled. Keep InkConnect open to receive live alerts.";
    else if (permission === "denied") status.textContent = "Notifications are blocked by your browser. Allow them in this site's browser settings.";
    else status.textContent = "Allow browser alerts to see new jobs, messages, payments, and other updates while InkConnect is open.";
  };

  enableButton.addEventListener("click", async () => {
    await NotificationSound.unlock();
    if (!("Notification" in window)) {
      toast("This browser does not support desktop notifications.", "error");
      updateControls();
      return;
    }
    if (window.Notification.permission === "denied") {
      updateControls();
      return;
    }
    try {
      const permissionRequest = window.Notification.requestPermission();
      await NotificationSound.unlock();
      const permission = await permissionRequest;
      updateControls();
      if (permission === "granted") toast("Browser alerts are enabled.", "success");
      else if (permission === "denied") toast("Browser alerts were blocked. You can allow them in browser settings.", "info");
    } catch (error) {
      console.warn("Unable to request browser notification permission:", error);
      toast("Could not enable browser alerts. Check your browser settings.", "error");
    }
  });

  soundButton.addEventListener("click", async () => {
    const enabled = NotificationSound.toggle();
    if (enabled) {
      await NotificationSound.unlock();
      NotificationSound.play();
    }
    updateControls();
  });

  updateControls();
}

async function initSignupPromo() {
  const interval = 10 * 60 * 1000;
  const nextPopupKey = "inkconnect_signup_popup_next_at";
  const excludedPages = ["login.html", "register.html", "registration-pending.html", "onboarding.html", "admin-login.html"];
  const page = window.location.pathname.split("/").pop() || "index.html";
  const modal = document.getElementById("signup-promo-modal") || createSignupPromoModal();
  const closeButton = modal.querySelector("[data-close-modal]");
  let activeTrigger = null;
  let nextPopupTimer = null;
  let nextPopupAt = Number(localStorage.getItem(nextPopupKey));
  const shouldAutoPopup = !excludedPages.includes(page) && !Auth.getSession();
  const schedule = () => {
    nextPopupAt = Number(localStorage.getItem(nextPopupKey)) || Date.now() + interval;
    clearTimeout(nextPopupTimer);
    nextPopupTimer = setTimeout(() => {
      const latestNextPopupAt = Number(localStorage.getItem(nextPopupKey)) || 0;
      if (latestNextPopupAt > Date.now()) {
        nextPopupAt = latestNextPopupAt;
        schedule();
        return;
      }
      if (Auth.getSession()) return;
      if (document.querySelector(".modal-overlay.open")) {
        nextPopupTimer = setTimeout(schedule, 30000);
        return;
      }
      open(null);
    }, Math.max(0, nextPopupAt - Date.now()));
  };

  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (activeTrigger && document.contains(activeTrigger)) activeTrigger.focus();
  };
  const open = (trigger) => {
    if (Auth.getSession()) return;
    activeTrigger = trigger || null;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    nextPopupAt = Date.now() + interval;
    localStorage.setItem(nextPopupKey, String(nextPopupAt));
    closeButton.focus();
    if (shouldAutoPopup && nextPopupTimer) schedule();
  };

  closeButton.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) close();
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("a[data-signup-popup], a[href^='register.html']");
    if (!trigger || modal.contains(trigger) || Auth.getSession()) return;
    event.preventDefault();
    open(trigger);
  });

  if (shouldAutoPopup) {
    if (!nextPopupAt) {
      nextPopupAt = Date.now() + interval;
      localStorage.setItem(nextPopupKey, String(nextPopupAt));
    }
    schedule();
  }

  const config = await getEffectiveSiteConfig();
  const reward = Number(config.REFERRAL_BONUS_USD);
  const rewardLabel = modal.querySelector("#signup-promo-reward");
  if (rewardLabel) rewardLabel.textContent = `$${Number.isFinite(reward) ? reward.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 1}`;
  modal.style.setProperty("--signup-popup-background", /^#[0-9a-f]{6}$/i.test(config.SIGNUP_POPUP_BACKGROUND || "") ? config.SIGNUP_POPUP_BACKGROUND : "#10152b");
  modal.style.setProperty("--signup-popup-accent", /^#[0-9a-f]{6}$/i.test(config.SIGNUP_POPUP_ACCENT || "") ? config.SIGNUP_POPUP_ACCENT : "#7657f6");
  applyNotificationAccent(config);

  const community = modal.querySelector("#signup-promo-community");
  const links = [
    { url: config.SIGNUP_POPUP_COMMUNITY_LINK, ...communityLinkDetails(config.SIGNUP_POPUP_COMMUNITY_LINK) },
    { url: config.COMMUNITY_WHATSAPP_LINK, label: "WhatsApp", color: "#25D366" },
    { url: config.COMMUNITY_FACEBOOK_LINK, label: "Facebook", color: "#1877F2" },
    { url: config.COMMUNITY_TIKTOK_LINK, label: "TikTok", color: "#111111" },
  ].filter((link, index, list) => link.url && Validate.httpsUrl(link.url) && list.findIndex((item) => item.url === link.url) === index);
  links.forEach(({ url, label, color }) => {
    const link = document.createElement("a");
    link.className = "btn btn-outline";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    if (color) {
      link.style.backgroundColor = color;
      link.style.borderColor = color;
      link.style.color = "#ffffff";
    }
    community.appendChild(link);
  });
}

function communityLinkDetails(value) {
  if (!value) return { label: "Open community link" };
  let host;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch (error) {
    return { label: "Open community link" };
  }
  if (host === "wa.me" || host === "whatsapp.com" || host.endsWith(".whatsapp.com")) return { label: "WhatsApp", color: "#25D366" };
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host.endsWith(".fb.com")) return { label: "Facebook", color: "#1877F2" };
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return { label: "TikTok", color: "#111111" };
  return { label: "Open community link" };
}

function createSignupPromoModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay signup-promo-overlay";
  overlay.id = "signup-promo-modal";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <section class="glass modal-box signup-promo-modal" role="dialog" aria-modal="true" aria-labelledby="signup-promo-title" aria-describedby="signup-promo-description">
      <button class="icon-btn modal-close" type="button" data-close-modal="signup-promo-modal" aria-label="Close signup information">✕</button>
      <div class="signup-promo-content">
        <span class="signup-promo-badge"><span aria-hidden="true">✦</span> A community that moves you forward</span>
        <h2 class="h-2 mt-3" id="signup-promo-title">Join our community.<br><span class="gradient-text">Refer &amp; earn.</span></h2>
        <p class="body-md mt-2" id="signup-promo-description">Connect with writers and clients, share InkConnect with friends, and earn <strong id="signup-promo-reward">$1</strong> for every referral who joins and is approved.</p>
        <div class="signup-promo-trust">
          <span class="signup-promo-trust-icon" aria-hidden="true">✓</span>
          <span><strong>Find your next writing opportunity</strong><small>Grow your network with InkConnect</small></span>
        </div>
        <div class="signup-promo-community" id="signup-promo-community"></div>
        <div class="signup-promo-actions">
          <a href="register.html" class="btn btn-primary" id="signup-promo-continue">Continue to sign up <span aria-hidden="true">→</span></a>
          <button class="btn btn-ghost" type="button" data-close-modal="signup-promo-modal">Maybe later</button>
        </div>
        <p class="signup-promo-note">Referral rewards are credited after the referred account is approved.</p>
      </div>
    </section>`;
  document.body.appendChild(overlay);
  return overlay;
}

function initNotificationPolling() {
  if (document.body.dataset.page === "onboarding") return;
  let seenIds = null;
  let inFlight = false;
  let reportedError = false;

  const poll = async () => {
    const session = Auth.getSession();
    if (!session || document.visibilityState === "hidden" || inFlight) return;
    inFlight = true;
    try {
      const res = await API.getNotifications({ userId: session.user.id });
      if (!res.ok) {
        if (!reportedError) console.warn("Unable to check notifications:", res.error);
        reportedError = true;
        return;
      }
      reportedError = false;
      const notifications = Array.isArray(res.notifications) ? res.notifications : [];
      if (seenIds === null) {
        seenIds = new Set(notifications.map((notification) => String(notification.id)));
        return;
      }
      const fresh = notifications.filter((notification) => !seenIds.has(String(notification.id)));
      fresh.forEach((notification) => seenIds.add(String(notification.id)));
      fresh.reverse().forEach((notification) => {
        const label = { job: "Job update", application: "Application", payment: "Payment", message: "Message", review: "Review", announcement: "Announcement" }[notification.type] || "Update";
        const title = `${label}: ${notification.text}`;
        toast(title, "info", { sound: true });
        if ("Notification" in window && window.Notification.permission === "granted") {
          const popup = new window.Notification(label, {
            body: String(notification.text || ""),
            tag: String(notification.id),
          });
          popup.addEventListener("click", () => {
            window.focus();
            document.querySelector('[data-section-link="notifications"]')?.click();
            popup.close();
          });
        }
      });
    } catch (error) {
      if (!reportedError) console.warn("Unable to check notifications:", error);
      reportedError = true;
    } finally {
      inFlight = false;
    }
  };

  poll();
  setInterval(poll, 20000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") poll();
  });
}

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
  httpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
    } catch (error) {
      return false;
    }
  },
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
