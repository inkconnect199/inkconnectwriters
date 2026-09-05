/* ============================================================
   INKCONNECT — AUTH
   Handles registration, login, logout, session persistence and
   role-based route guarding. Passwords are SHA-256 hashed client
   side before ever touching the API layer; the backend (Code.gs)
   never sees or stores plain text passwords.
   ============================================================ */

const Auth = {
  async hash(password) {
    const enc = new TextEncoder().encode(password);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  getSession() {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  setSession(user, token, remember) {
    const session = { user, token, ts: Date.now() };
    const store = remember ? localStorage : sessionStorage;
    store.setItem(SESSION_KEY, JSON.stringify(session));
    (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = "index.html";
  },

  async register(form, remember = true) {
    const passwordHash = await Auth.hash(form.password);
    const res = await API.register({
      fullName: form.fullName, username: form.username, email: form.email,
      phone: form.phone, country: form.country, role: form.role,
      passwordHash, profilePic: form.profilePic || "", referralCode: form.referralCode || "",
    });
    if (res.ok) Auth.setSession(res.user, "local-" + res.user.id, remember);
    return res;
  },

  async login(email, password, remember = true) {
    const passwordHash = await Auth.hash(password);
    const res = await API.login({ email, passwordHash });
    if (res.ok) Auth.setSession(res.user, res.token, remember);
    return res;
  },

  /** Redirects unauthenticated or wrong-role users. Call at top of protected pages. */
  requireRole(role) {
    const session = Auth.getSession();
    if (!session) {
      window.location.href = "login.html";
      return null;
    }
    if (role && session.user.role !== role) {
      const map = { client: "client-dashboard.html", writer: "writer-dashboard.html", admin: "admin-dashboard.html" };
      window.location.href = map[session.user.role] || "index.html";
      return null;
    }
    return session;
  },
};

/* One-time bootstrap: seed a manual admin demo account (admin@inkconnect.com / Admin@123)
   so the Admin Dashboard can be explored without a public registration path,
   matching the "Admin Registration (manual only)" requirement. */
(async function seedAdminAccount() {
  const db = LocalDB.read();
  if (db.allUsers.find((u) => u.role === "admin")) return;
  const passwordHash = await Auth.hash("Admin@123");
  const admin = {
    id: LocalDB.uid("usr"), fullName: "Site Administrator", username: "admin", email: "admin@inkconnect.com",
    phone: "+10000000000", country: "United States", role: "admin", passwordHash, profilePic: "",
    bio: "", createdAt: Date.now(), verified: true, accessStatus: "active",
    referralCode: generateReferralCode(db, "admin"), referredBy: null,
  };
  db.allUsers.push(admin);
  db.wallets[admin.id] = { balance: 0, escrow: 0 };
  LocalDB.write(db);
})();

/* Forgot / change password.
   No email transport in this client-only demo, so "forgot password"
   verifies the email exists, then lets the person set a new password
   directly — standing in for "click the emailed link, choose a new
   password". The Apps Script backend can be extended with
   MailApp.sendEmail() + a real token flow for production use. */
Auth.checkEmailExists = async function (email) {
  return API.checkEmailExists({ email });
};
Auth.resetPassword = async function (email, newPassword) {
  const newPasswordHash = await Auth.hash(newPassword);
  return API.resetPassword({ email, newPasswordHash });
};
Auth.changePassword = async function (userId, currentPassword, newPassword) {
  const currentPasswordHash = await Auth.hash(currentPassword);
  const newPasswordHash = await Auth.hash(newPassword);
  return API.changePassword({ userId, currentPasswordHash, newPasswordHash });
};
