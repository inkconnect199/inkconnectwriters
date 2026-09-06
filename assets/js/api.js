/* ============================================================
   INKCONNECT — API LAYER
   Talks to a Google Apps Script Web App using the exact same
   action contract implemented in /backend/Code.gs.
   When GAS_URL is empty, falls back to a local demo database
   (localStorage) that mimics every backend action 1:1, so the
   whole site works instantly without any deployment.
   ============================================================ */

const API_CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here, e.g.
  // "https://script.google.com/macros/s/AKfycb.../exec"
  GAS_URL: "https://script.google.com/macros/s/AKfycbwq4lkWvs0UasYUfq4iy4KMCC32uOEQSN7KJwWeNHkmO1kHUGMO3B_3uUMGoxc6RVk2nw/exec",
};

const DB_KEY = "inkconnect_db_v1";
const SESSION_KEY = "inkconnect_session_v1";

/* ============================================================
   ⚙️  EASY-EDIT SETTINGS
   Change anything in this block to update site-wide behavior —
   nothing else in the codebase needs to change.
   ============================================================ */
const SITE_CONFIG = {
  // One-time access fee a CLIENT must pay before their dashboard unlocks.
  ACCESS_FEE_KES: 500,
  ACCESS_FEE_USD: 5,
  // Where clients send that fee. Shown on the payment gate screen.
  COMPANY_MPESA_NUMBER: "0106012195",
  COMPANY_PAYPAL_EMAIL: "inkconnect.payments@gmail.com",
  COMPANY_NAME: "InkConnect",
  // Set to false to let clients skip the fee gate entirely (e.g. for local testing).
  REQUIRE_CLIENT_ACCESS_FEE: true,
  // Writers pay the same one-time access fee before their dashboard unlocks too.
  REQUIRE_WRITER_ACCESS_FEE: true,
  // Set to false to let clients post jobs directly without admin approval.
  REQUIRE_ADMIN_JOB_APPROVAL: true,
  // Referral program: existing users earn this bonus when someone they
  // referred is approved (registers + passes the access-fee review).
  REFERRAL_BONUS_KES: 100,
  REFERRAL_BONUS_USD: 1,
  // Writers can't withdraw more than this in a single request.
  MAX_WITHDRAWAL_USD: 2000,
};
// Back-compat alias used elsewhere in this file.
const COMPANY_PAYMENT_INFO = {
  mpesaNumber: SITE_CONFIG.COMPANY_MPESA_NUMBER,
  paypalEmail: SITE_CONFIG.COMPANY_PAYPAL_EMAIL,
  amountKES: SITE_CONFIG.ACCESS_FEE_KES,
  amountUSD: SITE_CONFIG.ACCESS_FEE_USD,
};

/** Whether this role must pay the one-time access fee before their
    dashboard unlocks. Admins never do; clients/writers follow their
    own toggle in SITE_CONFIG. Used by register.js, dashboard.js and
    registration-pending.js so the rule lives in exactly one place. */
function roleNeedsAccessFee(role) {
  if (role === "client") return SITE_CONFIG.REQUIRE_CLIENT_ACCESS_FEE;
  if (role === "writer") return SITE_CONFIG.REQUIRE_WRITER_ACCESS_FEE;
  return false;
}

/* ---------------- Local demo database ---------------- */
const LocalDB = {
  read() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
    const seed = LocalDB.seed();
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
    return seed;
  },
  write(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); },
  uid(prefix) { return prefix + "_" + Math.random().toString(36).slice(2, 10); },

  seed() {
    const now = Date.now();
    const writers = [
      { name: "Amara Ndlovu", country: "Kenya", skills: ["SEO", "Blog Writing", "Copywriting"], rate: 18, rating: 4.9, jobs: 132, bio: "Long-form content specialist for SaaS and fintech brands." },
      { name: "Daniel Osei", country: "Ghana", skills: ["Technical Writing", "Whitepapers"], rate: 25, rating: 4.8, jobs: 87, bio: "Ex-engineer turned technical writer for developer tools." },
      { name: "Priya Nair", country: "India", skills: ["Copywriting", "Email Marketing"], rate: 15, rating: 4.7, jobs: 210, bio: "High-converting sales copy and lifecycle email sequences." },
      { name: "Lucas Mensah", country: "Nigeria", skills: ["Academic Writing", "Research"], rate: 12, rating: 4.6, jobs: 64, bio: "Research-driven writer covering health, science and policy." },
      { name: "Sofia Alvarez", country: "Mexico", skills: ["Creative Writing", "Scriptwriting"], rate: 20, rating: 5.0, jobs: 45, bio: "Narrative copy, brand voice and video scripts." },
      { name: "James Okoro", country: "Nigeria", skills: ["Blog Writing", "SEO"], rate: 14, rating: 4.5, jobs: 156, bio: "Ranks page-one content for competitive SaaS keywords." },
    ];
    const users = writers.map((w, i) => ({
      id: LocalDB.uid("usr"),
      fullName: w.name, username: w.name.toLowerCase().replace(/\s+/g, ""),
      email: `${w.name.split(" ")[0].toLowerCase()}@writer.inkconnect.com`,
      phone: "+000000000", country: w.country, role: "writer",
      passwordHash: "", profilePic: "", bio: w.bio, skills: w.skills, rate: w.rate,
      rating: w.rating, completedJobs: w.jobs, experience: "3-5 years", languages: ["English"],
      education: "", certificates: [], availability: "Available", portfolio: [],
      createdAt: now, verified: true, accessStatus: "active",
      referralCode: w.name.toLowerCase().replace(/[^a-z0-9]/g, "") + Math.floor(1000 + Math.random() * 9000), referredBy: null,
    }));
    const clientNames = ["Northwind Media", "Bloom Digital", "Vertex Labs"];
    const clientUsers = clientNames.map((n) => ({
      id: LocalDB.uid("usr"), fullName: n, username: n.toLowerCase().replace(/\s+/g, ""),
      email: `${n.toLowerCase().replace(/\s+/g, "")}@client.inkconnect.com`,
      phone: "+000000000", country: "United States", role: "client",
      passwordHash: "", profilePic: "", bio: "", createdAt: now, verified: true, accessStatus: "active",
      referralCode: n.toLowerCase().replace(/[^a-z0-9]/g, "") + Math.floor(1000 + Math.random() * 9000), referredBy: null,
    }));
    const categories = ["Blog Writing", "SEO Content", "Copywriting", "Technical Writing", "Academic Writing", "Creative Writing", "Email Marketing", "Scriptwriting"];
    const jobTitles = [
      ["SaaS onboarding email series", "Email Marketing", 220],
      ["1500-word SEO blog on renewable energy", "SEO Content", 90],
      ["API documentation rewrite", "Technical Writing", 340],
      ["Brand voice guide + landing page copy", "Copywriting", 400],
      ["Research summary on remote work trends", "Academic Writing", 150],
      ["Short film script, 10 pages", "Scriptwriting", 500],
      ["Weekly newsletter, 6-month contract", "Blog Writing", 600],
      ["Product page copy for e-commerce launch", "Copywriting", 180],
    ];
    const jobs = jobTitles.map(([title, cat, budget], i) => ({
      id: LocalDB.uid("job"),
      clientId: clientUsers[i % clientUsers.length].id,
      clientName: clientUsers[i % clientUsers.length].fullName,
      title, category: cat, budget,
      description: `We're looking for an experienced writer to deliver "${title}". Please include relevant samples with your application.`,
      status: "open", createdAt: now - i * 86400000, deadline: now + (7 + i) * 86400000,
    }));
    return {
      users, jobs, categories,
      applications: [], messages: [], payments: [], notifications: [],
      reviews: [], tickets: [], accessRequests: [], settings: {},
      wallets: [...users, ...clientUsers].reduce((acc, u) => { acc[u.id] = { balance: u.role === "client" ? 500 : 0, escrow: 0 }; return acc; }, {}),
      allUsers: [...users, ...clientUsers],
    };
  },
};
// flatten seed helper so users includes clients too
(function fixSeed() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return;
})();

/* ---------------- Core request dispatcher ---------------- */
async function apiRequest(action, payload = {}) {
  if (API_CONFIG.GAS_URL) {
    try {
      const res = await fetch(API_CONFIG.GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, payload }),
      });
      return await res.json();
    } catch (err) {
      return { ok: false, error: "Network error contacting backend: " + err.message };
    }
  }
  return LocalAPI.handle(action, payload);
}

/* ---------------- Local API implementation ---------------- */
const LocalAPI = {
  async handle(action, payload) {
    await new Promise((r) => setTimeout(r, 220)); // simulate latency
    const db = LocalDB.read();
    if (!db.allUsers) db.allUsers = db.users.concat(db.users.filter(() => false));
    if (!db.accessRequests) db.accessRequests = [];
    if (!db.settings) db.settings = {};
    try {
      if (typeof LocalAPI[action] === "function") {
        const result = LocalAPI[action](db, payload);
        LocalDB.write(db);
        return result;
      }
      return { ok: false, error: "Unknown action: " + action };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  register(db, p) {
    const emailTaken = db.allUsers.find((u) => u.email.toLowerCase() === p.email.toLowerCase());
    if (emailTaken) return { ok: false, error: "An account with this email already exists." };

    // Resolve the referral code (if any) to the referrer's account before
    // creating the new user, so we can store referredBy.
    let referrer = null;
    if (p.referralCode) referrer = db.allUsers.find((u) => u.referralCode && u.referralCode.toLowerCase() === String(p.referralCode).trim().toLowerCase());

    const user = {
      id: LocalDB.uid("usr"), fullName: p.fullName, username: p.username, email: p.email,
      phone: p.phone, country: p.country, role: p.role, passwordHash: p.passwordHash,
      profilePic: p.profilePic || "", bio: "", skills: [], rate: 0, rating: 0, completedJobs: 0,
      experience: "", languages: [], education: "", certificates: [], availability: "Available",
      portfolio: [], createdAt: Date.now(), verified: true,
      accessStatus: roleNeedsAccessFee(p.role) ? "unpaid" : "active",
      referralCode: generateReferralCode(db, p.username || p.fullName),
      referredBy: referrer ? referrer.id : null,
    };
    db.allUsers.push(user);
    db.wallets[user.id] = { balance: p.role === "client" ? 100 : 0, escrow: 0 };

    // No approval gate for this role (or the feature is off) — the account
    // is active immediately, so award the referral bonus right now.
    if (user.accessStatus === "active" && user.referredBy) awardReferralBonus(db, user);

    return { ok: true, user: sanitize(user) };
  },

  login(db, p) {
    const user = db.allUsers.find((u) => u.email.toLowerCase() === p.email.toLowerCase());
    if (!user) return { ok: false, error: "No account found with that email." };
    if (user.passwordHash !== p.passwordHash) return { ok: false, error: "Incorrect password." };
    const token = LocalDB.uid("tok");
    return { ok: true, user: sanitize(user), token };
  },

  getWriters(db) {
    return { ok: true, writers: db.allUsers.filter((u) => u.role === "writer").map(sanitize) };
  },

  getJobs(db, p) {
    let jobs = db.jobs.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (p && p.clientId) jobs = jobs.filter((j) => j.clientId === p.clientId);
    if (p && p.status) jobs = jobs.filter((j) => j.status === p.status);
    return { ok: true, jobs };
  },

  postJob(db, p) {
    const needsApproval = SITE_CONFIG.REQUIRE_ADMIN_JOB_APPROVAL;
    const job = {
      id: LocalDB.uid("job"), clientId: p.clientId, clientName: p.clientName,
      title: p.title, category: p.category, budget: Number(p.budget),
      description: p.description, status: needsApproval ? "pending_review" : "open", createdAt: Date.now(),
      deadline: Date.now() + (Number(p.days) || 7) * 86400000, rejectionReason: "",
    };
    db.jobs.unshift(job);
    if (needsApproval) {
      db.allUsers.filter((u) => u.role === "admin").forEach((a) => pushNotification(db, a.id, "job", `New job "${job.title}" is awaiting approval.`));
    }
    return { ok: true, job };
  },

  /** Admin: approve a client's pending job so it becomes visible to writers. */
  adminApproveJob(db, p) {
    const job = db.jobs.find((j) => j.id === p.jobId);
    if (!job) return { ok: false, error: "Job not found." };
    job.status = "open";
    job.rejectionReason = "";
    pushNotification(db, job.clientId, "job", `Your job "${job.title}" was approved and is now live.`);
    return { ok: true, job };
  },

  /** Admin: reject a client's pending job with a reason shown back to the client. */
  adminRejectJob(db, p) {
    const job = db.jobs.find((j) => j.id === p.jobId);
    if (!job) return { ok: false, error: "Job not found." };
    job.status = "rejected";
    job.rejectionReason = p.reason || "Did not meet posting guidelines.";
    pushNotification(db, job.clientId, "job", `Your job "${job.title}" was rejected: ${job.rejectionReason}`);
    return { ok: true, job };
  },

  editJob(db, p) {
    const job = db.jobs.find((j) => j.id === p.id);
    if (!job) return { ok: false, error: "Job not found." };
    Object.assign(job, p.updates);
    return { ok: true, job };
  },

  deleteJob(db, p) {
    db.jobs = db.jobs.filter((j) => j.id !== p.id);
    return { ok: true };
  },

  applyJob(db, p) {
    const exists = db.applications.find((a) => a.jobId === p.jobId && a.writerId === p.writerId);
    if (exists) return { ok: false, error: "You already applied to this job." };
    const app = {
      id: LocalDB.uid("app"), jobId: p.jobId, writerId: p.writerId, writerName: p.writerName,
      coverLetter: p.coverLetter, proposedRate: p.proposedRate, status: "pending", createdAt: Date.now(),
    };
    db.applications.push(app);
    const job = db.jobs.find((j) => j.id === p.jobId);
    pushNotification(db, job ? job.clientId : null, "application", `New application from ${p.writerName}`);
    return { ok: true, application: app };
  },

  getApplications(db, p) {
    let apps = db.applications.slice();
    if (p.jobId) apps = apps.filter((a) => a.jobId === p.jobId);
    if (p.writerId) apps = apps.filter((a) => a.writerId === p.writerId);
    if (p.clientId) {
      const clientJobIds = db.jobs.filter((j) => j.clientId === p.clientId).map((j) => j.id);
      apps = apps.filter((a) => clientJobIds.includes(a.jobId));
    }
    apps = apps.map((a) => ({ ...a, job: db.jobs.find((j) => j.id === a.jobId) }));
    return { ok: true, applications: apps };
  },

  acceptWriter(db, p) {
    const app = db.applications.find((a) => a.id === p.applicationId);
    if (!app) return { ok: false, error: "Application not found." };
    app.status = "accepted";
    const job = db.jobs.find((j) => j.id === app.jobId);
    if (job) job.status = "in_progress";
    db.applications.filter((a) => a.jobId === app.jobId && a.id !== app.id).forEach((a) => (a.status = "rejected"));
    pushNotification(db, app.writerId, "application", `You were accepted for "${job ? job.title : "a job"}"`);
    return { ok: true };
  },

  rejectWriter(db, p) {
    const app = db.applications.find((a) => a.id === p.applicationId);
    if (!app) return { ok: false, error: "Application not found." };
    app.status = "rejected";
    pushNotification(db, app.writerId, "application", "An application was declined.");
    return { ok: true };
  },

  uploadWork(db, p) {
    const job = db.jobs.find((j) => j.id === p.jobId);
    if (!job) return { ok: false, error: "Job not found." };
    job.status = "submitted";
    job.submission = { fileName: p.fileName, note: p.note, submittedAt: Date.now() };
    pushNotification(db, job.clientId, "job", `Work submitted for "${job.title}"`);
    return { ok: true, job };
  },

  payWriter(db, p) {
    const job = db.jobs.find((j) => j.id === p.jobId);
    if (!job) return { ok: false, error: "Job not found." };
    const clientWallet = db.wallets[job.clientId] || { balance: 0, escrow: 0 };
    if (clientWallet.balance < job.budget) return { ok: false, error: "Insufficient wallet balance to release payment." };
    clientWallet.balance -= job.budget;
    const app = db.applications.find((a) => a.jobId === job.id && a.status === "accepted");
    const writerId = app ? app.writerId : null;
    if (writerId) {
      const wWallet = db.wallets[writerId] || { balance: 0, escrow: 0 };
      wWallet.balance += job.budget;
      db.wallets[writerId] = wWallet;
      const writer = db.allUsers.find((u) => u.id === writerId);
      if (writer) writer.completedJobs = (writer.completedJobs || 0) + 1;
      pushNotification(db, writerId, "payment", `Payment received: $${job.budget} for "${job.title}"`);
    }
    db.wallets[job.clientId] = clientWallet;
    job.status = "completed";
    db.payments.push({ id: LocalDB.uid("pay"), jobId: job.id, clientId: job.clientId, writerId, amount: job.budget, createdAt: Date.now() });
    return { ok: true };
  },

  review(db, p) {
    db.reviews.push({ id: LocalDB.uid("rev"), jobId: p.jobId, fromId: p.fromId, toId: p.toId, rating: Number(p.rating), comment: p.comment, createdAt: Date.now() });
    const user = db.allUsers.find((u) => u.id === p.toId);
    if (user) {
      const userReviews = db.reviews.filter((r) => r.toId === p.toId);
      user.rating = +(userReviews.reduce((s, r) => s + r.rating, 0) / userReviews.length).toFixed(1);
    }
    pushNotification(db, p.toId, "review", "You received a new review.");
    return { ok: true };
  },

  getReviews(db, p) { return { ok: true, reviews: db.reviews.filter((r) => r.toId === p.userId) }; },

  sendMessage(db, p) {
    const msg = { id: LocalDB.uid("msg"), threadId: p.threadId, fromId: p.fromId, toId: p.toId, text: p.text, createdAt: Date.now(), read: false };
    db.messages.push(msg);
    pushNotification(db, p.toId, "message", "New message received.");
    return { ok: true, message: msg };
  },

  getMessages(db, p) {
    const msgs = db.messages.filter((m) => m.threadId === p.threadId).sort((a, b) => a.createdAt - b.createdAt);
    return { ok: true, messages: msgs };
  },

  getThreads(db, p) {
    const mine = db.messages.filter((m) => m.fromId === p.userId || m.toId === p.userId);
    const threadIds = [...new Set(mine.map((m) => m.threadId))];
    const threads = threadIds.map((tid) => {
      const msgs = mine.filter((m) => m.threadId === tid).sort((a, b) => b.createdAt - a.createdAt);
      const last = msgs[0];
      const otherId = last.fromId === p.userId ? last.toId : last.fromId;
      const other = db.allUsers.find((u) => u.id === otherId);
      const unread = msgs.filter((m) => m.toId === p.userId && !m.read).length;
      return { threadId: tid, otherId, otherName: other ? other.fullName : "User", lastText: last.text, lastAt: last.createdAt, unread };
    });
    return { ok: true, threads: threads.sort((a, b) => b.lastAt - a.lastAt) };
  },

  markRead(db, p) {
    db.messages.filter((m) => m.threadId === p.threadId && m.toId === p.userId).forEach((m) => (m.read = true));
    return { ok: true };
  },

  /** Admin: every conversation on the platform, across all clients and
      writers — for moderation and dispute resolution. */
  adminGetAllThreads(db) {
    const threadIds = [...new Set(db.messages.map((m) => m.threadId))];
    const threads = threadIds.map((tid) => {
      const msgs = db.messages.filter((m) => m.threadId === tid).sort((a, b) => b.createdAt - a.createdAt);
      const last = msgs[0];
      const fromUser = db.allUsers.find((u) => u.id === last.fromId);
      const toUser = db.allUsers.find((u) => u.id === last.toId);
      return {
        threadId: tid, messageCount: msgs.length, lastText: last.text, lastAt: last.createdAt,
        participantA: fromUser ? { id: fromUser.id, name: fromUser.fullName, role: fromUser.role } : { id: last.fromId, name: "Unknown", role: "" },
        participantB: toUser ? { id: toUser.id, name: toUser.fullName, role: toUser.role } : { id: last.toId, name: "Unknown", role: "" },
      };
    });
    return { ok: true, threads: threads.sort((a, b) => b.lastAt - a.lastAt) };
  },

  deposit(db, p) {
    const w = db.wallets[p.userId] || { balance: 0, escrow: 0 };
    w.balance += Number(p.amount);
    db.wallets[p.userId] = w;
    db.payments.push({
      id: LocalDB.uid("pay"), userId: p.userId, type: "deposit", amount: Number(p.amount),
      method: p.method || "bank", accountRef: p.accountRef || "", accountName: p.accountName || "",
      reference: p.reference || LocalDB.uid("ref").toUpperCase(), createdAt: Date.now(),
    });
    pushNotification(db, p.userId, "payment", `Deposit of $${p.amount} via ${p.method || "bank"} confirmed.`);
    return { ok: true, wallet: w };
  },

  withdraw(db, p) {
    const amount = Number(p.amount);
    if (amount > SITE_CONFIG.MAX_WITHDRAWAL_USD) return { ok: false, error: `Withdrawals are capped at ${money(SITE_CONFIG.MAX_WITHDRAWAL_USD)} per request.` };
    const w = db.wallets[p.userId] || { balance: 0, escrow: 0 };
    if (w.balance < amount) return { ok: false, error: "Insufficient balance." };
    w.balance -= amount;
    db.wallets[p.userId] = w;
    db.payments.push({
      id: LocalDB.uid("pay"), userId: p.userId, type: "withdraw", amount,
      method: p.method || "bank", accountRef: p.accountRef || "", accountName: p.accountName || "",
      reference: p.reference || LocalDB.uid("ref").toUpperCase(), createdAt: Date.now(),
    });
    pushNotification(db, p.userId, "payment", `Withdrawal of $${amount} via ${p.method || "bank"} requested.`);
    return { ok: true, wallet: w };
  },

  getWallet(db, p) { return { ok: true, wallet: db.wallets[p.userId] || { balance: 0, escrow: 0 } }; },

  getTransactions(db, p) { return { ok: true, transactions: db.payments.filter((t) => t.userId === p.userId || t.clientId === p.userId || t.writerId === p.userId).sort((a,b)=>b.createdAt-a.createdAt) }; },

  notification(db, p) { pushNotification(db, p.userId, p.type, p.text); return { ok: true }; },

  /** Admin: broadcast an announcement to every non-admin user as a real
      notification (shows up in their Notifications page). This is what
      Admin Dashboard → Announcements actually sends. */
  broadcastAnnouncement(db, p) {
    const text = (p.text || "").trim();
    if (!text) return { ok: false, error: "Write an announcement first." };
    const recipients = db.allUsers.filter((u) => u.role !== "admin");
    recipients.forEach((u) => pushNotification(db, u.id, "announcement", text));
    return { ok: true, recipientCount: recipients.length };
  },

  getNotifications(db, p) {
    return { ok: true, notifications: db.notifications.filter((n) => n.userId === p.userId).sort((a, b) => b.createdAt - a.createdAt) };
  },

  markNotificationsRead(db, p) {
    db.notifications.filter((n) => n.userId === p.userId).forEach((n) => (n.read = true));
    return { ok: true };
  },

  updateProfile(db, p) {
    const user = db.allUsers.find((u) => u.id === p.id);
    if (!user) return { ok: false, error: "User not found." };
    Object.assign(user, p.updates);
    return { ok: true, user: sanitize(user) };
  },

  getUser(db, p) {
    const user = db.allUsers.find((u) => u.id === p.id);
    if (!user) return { ok: false, error: "User not found." };
    return { ok: true, user: sanitize(user) };
  },

  /** Verifies the email exists — the first step of the forgot-password
      flow, before the person is allowed to set a new password. */
  checkEmailExists(db, p) {
    const user = db.allUsers.find((u) => u.email.toLowerCase() === (p.email || "").toLowerCase());
    return { ok: true, exists: !!user };
  },

  /** Forgot password: resets by email once it's been verified to exist.
      No email transport in this demo, so this stands in for "click the
      link in your email and choose a new password". */
  resetPassword(db, p) {
    const user = db.allUsers.find((u) => u.email.toLowerCase() === (p.email || "").toLowerCase());
    if (!user) return { ok: false, error: "No account found with that email." };
    user.passwordHash = p.newPasswordHash;
    pushNotification(db, user.id, "payment", "Your password was reset.");
    return { ok: true };
  },

  /** Change password while logged in — requires the current password. */
  changePassword(db, p) {
    const user = db.allUsers.find((u) => u.id === p.userId);
    if (!user) return { ok: false, error: "User not found." };
    if (user.passwordHash !== p.currentPasswordHash) return { ok: false, error: "Current password is incorrect." };
    user.passwordHash = p.newPasswordHash;
    return { ok: true };
  },

  createTicket(db, p) {
    const t = { id: LocalDB.uid("tik"), userId: p.userId, name: p.name, email: p.email, subject: p.subject, message: p.message, status: "open", createdAt: Date.now() };
    db.tickets.push(t);
    return { ok: true, ticket: t };
  },

  getTickets(db, p) {
    let tickets = db.tickets.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (p && p.userId) tickets = tickets.filter((t) => t.userId === p.userId);
    return { ok: true, tickets };
  },

  updateTicket(db, p) {
    const t = db.tickets.find((x) => x.id === p.id);
    if (!t) return { ok: false, error: "Ticket not found." };
    Object.assign(t, p.updates);
    return { ok: true, ticket: t };
  },

  adminGetUsers(db) { return { ok: true, users: db.allUsers.map(sanitize) }; },

  /** Admin: full detail on one user plus a quick activity summary — used by
      the "View" button in Manage Users so admins can see everything about
      a client or writer in one place. */
  adminGetUserDetail(db, p) {
    const user = db.allUsers.find((u) => u.id === p.id);
    if (!user) return { ok: false, error: "User not found." };
    const wallet = db.wallets[user.id] || { balance: 0, escrow: 0 };
    const jobs = user.role === "client" ? db.jobs.filter((j) => j.clientId === user.id) : [];
    const applications = user.role === "writer" ? db.applications.filter((a) => a.writerId === user.id) : [];
    const accessHistory = db.accessRequests.filter((r) => r.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    const referredBy = user.referredBy ? db.allUsers.find((u) => u.id === user.referredBy) : null;
    const referredCount = db.allUsers.filter((u) => u.referredBy === user.id).length;
    return {
      ok: true, user: sanitize(user), wallet, jobs, applications, accessHistory,
      referredByName: referredBy ? referredBy.fullName : null, referredCount,
    };
  },

  adminSetUserStatus(db, p) {
    const u = db.allUsers.find((x) => x.id === p.id);
    if (!u) return { ok: false, error: "User not found." };
    u.suspended = !!p.suspended;
    return { ok: true };
  },

  /** Client: submit proof of the one-time access-fee payment (M-Pesa, PayPal
      or other). Marks the account "pending" until an admin reviews it. */
  submitAccessPayment(db, p) {
    const user = db.allUsers.find((u) => u.id === p.userId);
    if (!user) return { ok: false, error: "User not found." };
    const request = {
      id: LocalDB.uid("acc"), userId: p.userId, userName: user.fullName, userEmail: user.email,
      method: p.method, accountRef: p.accountRef || "", transactionMessage: p.transactionMessage || "",
      amount: p.amount || SITE_CONFIG.ACCESS_FEE_USD, status: "pending", reason: "",
      createdAt: Date.now(), reviewedAt: null,
    };
    db.accessRequests.unshift(request);
    user.accessStatus = "pending";
    db.allUsers.filter((u) => u.role === "admin").forEach((a) => pushNotification(db, a.id, "payment", `${user.fullName} submitted an access-fee payment for review.`));
    return { ok: true, user: sanitize(user), request };
  },

  /** Admin: list all access-fee submissions, optionally filtered by status. */
  getAccessRequests(db, p) {
    let list = db.accessRequests.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (p && p.status) list = list.filter((r) => r.status === p.status);
    return { ok: true, requests: list };
  },

  /** Admin: approve an access-fee submission — unlocks that client's dashboard. */
  approveAccessRequest(db, p) {
    const req = db.accessRequests.find((r) => r.id === p.id);
    if (!req) return { ok: false, error: "Request not found." };
    req.status = "approved"; req.reviewedAt = Date.now();
    const user = db.allUsers.find((u) => u.id === req.userId);
    if (user) {
      user.accessStatus = "active"; user.accessRejectionReason = "";
      pushNotification(db, user.id, "payment", "Your access payment was approved — your dashboard is unlocked.");
      awardReferralBonus(db, user);
    }
    return { ok: true };
  },

  /** Admin: reject an access-fee submission, with a reason shown to the client. */
  rejectAccessRequest(db, p) {
    const req = db.accessRequests.find((r) => r.id === p.id);
    if (!req) return { ok: false, error: "Request not found." };
    req.status = "rejected"; req.reviewedAt = Date.now(); req.reason = p.reason || "Transaction could not be verified.";
    const user = db.allUsers.find((u) => u.id === req.userId);
    if (user) {
      user.accessStatus = "rejected";
      user.accessRejectionReason = req.reason;
      pushNotification(db, user.id, "payment", `Your access payment was rejected: ${req.reason}`);
    }
    return { ok: true };
  },

  /** Effective site settings = admin-edited overrides layered on top of
      the code defaults in SITE_CONFIG. Anyone can read these (the
      register/review pages need the current fee & payment details);
      only the admin UI writes to them. */
  getSiteSettings(db) {
    return { ok: true, settings: Object.assign({}, SITE_CONFIG, db.settings) };
  },

  /** Admin: override the access fee amount and/or company M-Pesa number /
      PayPal email shown to clients — no code edits required. */
  updateSiteSettings(db, p) {
    db.settings = Object.assign({}, db.settings, p.updates);
    return { ok: true, settings: Object.assign({}, SITE_CONFIG, db.settings) };
  },

  /** Admin: every user's wallet balance in one table. */
  adminGetAllWallets(db) {
    const rows = db.allUsers.map((u) => ({
      userId: u.id, name: u.fullName, role: u.role,
      balance: (db.wallets[u.id] || { balance: 0 }).balance,
      escrow: (db.wallets[u.id] || { escrow: 0 }).escrow || 0,
    }));
    return { ok: true, wallets: rows.sort((a, b) => b.balance - a.balance) };
  },

  /** A user's own referral code, shareable link, everyone who joined
      through it, and total bonus earned so far. */
  getReferrals(db, p) {
    const user = db.allUsers.find((u) => u.id === p.userId);
    if (!user) return { ok: false, error: "User not found." };
    const referred = db.allUsers.filter((u) => u.referredBy === user.id).map((u) => {
      const paid = db.payments.find((pay) => pay.type === "referral" && pay.relatedUserId === u.id);
      return { id: u.id, name: u.fullName, role: u.role, accessStatus: u.accessStatus, joinedAt: u.createdAt, bonusEarned: !!paid };
    });
    const totalEarned = db.payments.filter((pay) => pay.type === "referral" && pay.userId === user.id).reduce((s, pay) => s + pay.amount, 0);
    return { ok: true, code: user.referralCode, referred: referred.sort((a, b) => b.joinedAt - a.joinedAt), totalEarned };
  },

  adminStats(db) {
    return {
      ok: true,
      stats: {
        writers: db.allUsers.filter((u) => u.role === "writer").length,
        clients: db.allUsers.filter((u) => u.role === "client").length,
        jobs: db.jobs.length,
        completedJobs: db.jobs.filter((j) => j.status === "completed").length,
        totalPaid: db.payments.filter((p) => p.amount && p.jobId).reduce((s, p) => s + p.amount, 0),
        openTickets: db.tickets.filter((t) => t.status === "open").length,
        pendingJobs: db.jobs.filter((j) => j.status === "pending_review").length,
        pendingAccessRequests: db.accessRequests.filter((r) => r.status === "pending").length,
      },
    };
  },
};

function pushNotification(db, userId, type, text) {
  if (!userId) return;
  db.notifications.push({ id: LocalDB.uid("ntf"), userId, type, text, read: false, createdAt: Date.now() });
}
function sanitize(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

/** Short, shareable referral code — base name + 4 random digits, retried
    until unique. e.g. "amara8213". */
function generateReferralCode(db, base) {
  const clean = (base || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "user";
  let code;
  do { code = clean + Math.floor(1000 + Math.random() * 9000); } while (db.allUsers.some((u) => u.referralCode === code));
  return code;
}

/** Credits the referrer's wallet once their referred user becomes a real,
    approved account. Idempotent — checks for an existing referral payment
    for this referredUser before crediting again, so this is safe to call
    from both register() (no-approval-needed roles) and
    approveAccessRequest() (the normal, gated path) without double-paying. */
function awardReferralBonus(db, referredUser) {
  if (!referredUser.referredBy) return;
  const already = db.payments.find((p) => p.type === "referral" && p.relatedUserId === referredUser.id);
  if (already) return;
  const referrer = db.allUsers.find((u) => u.id === referredUser.referredBy);
  if (!referrer) return;
  const amount = SITE_CONFIG.REFERRAL_BONUS_USD;
  const wallet = db.wallets[referrer.id] || { balance: 0, escrow: 0 };
  wallet.balance += amount;
  db.wallets[referrer.id] = wallet;
  db.payments.push({
    id: LocalDB.uid("pay"), type: "referral", userId: referrer.id, relatedUserId: referredUser.id,
    amount, createdAt: Date.now(),
  });
  pushNotification(db, referrer.id, "payment", `You earned ${money(amount)} — ${referredUser.fullName} joined through your referral link!`);
}

/* ---------------- Public API object used across pages ---------------- */
const API = {
  register: (payload) => apiRequest("register", payload),
  login: (payload) => apiRequest("login", payload),
  getWriters: () => apiRequest("getWriters"),
  getJobs: (payload) => apiRequest("getJobs", payload),
  postJob: (payload) => apiRequest("postJob", payload),
  editJob: (payload) => apiRequest("editJob", payload),
  deleteJob: (payload) => apiRequest("deleteJob", payload),
  applyJob: (payload) => apiRequest("applyJob", payload),
  getApplications: (payload) => apiRequest("getApplications", payload),
  acceptWriter: (payload) => apiRequest("acceptWriter", payload),
  rejectWriter: (payload) => apiRequest("rejectWriter", payload),
  uploadWork: (payload) => apiRequest("uploadWork", payload),
  payWriter: (payload) => apiRequest("payWriter", payload),
  review: (payload) => apiRequest("review", payload),
  getReviews: (payload) => apiRequest("getReviews", payload),
  sendMessage: (payload) => apiRequest("sendMessage", payload),
  getMessages: (payload) => apiRequest("getMessages", payload),
  getThreads: (payload) => apiRequest("getThreads", payload),
  markRead: (payload) => apiRequest("markRead", payload),
  adminGetAllThreads: () => apiRequest("adminGetAllThreads"),
  deposit: (payload) => apiRequest("deposit", payload),
  withdraw: (payload) => apiRequest("withdraw", payload),
  getWallet: (payload) => apiRequest("getWallet", payload),
  getTransactions: (payload) => apiRequest("getTransactions", payload),
  getNotifications: (payload) => apiRequest("getNotifications", payload),
  markNotificationsRead: (payload) => apiRequest("markNotificationsRead", payload),
  broadcastAnnouncement: (payload) => apiRequest("broadcastAnnouncement", payload),
  updateProfile: (payload) => apiRequest("updateProfile", payload),
  getUser: (payload) => apiRequest("getUser", payload),
  checkEmailExists: (payload) => apiRequest("checkEmailExists", payload),
  resetPassword: (payload) => apiRequest("resetPassword", payload),
  changePassword: (payload) => apiRequest("changePassword", payload),
  createTicket: (payload) => apiRequest("createTicket", payload),
  getTickets: (payload) => apiRequest("getTickets", payload),
  updateTicket: (payload) => apiRequest("updateTicket", payload),
  adminGetUsers: () => apiRequest("adminGetUsers"),
  adminGetUserDetail: (payload) => apiRequest("adminGetUserDetail", payload),
  adminSetUserStatus: (payload) => apiRequest("adminSetUserStatus", payload),
  adminStats: () => apiRequest("adminStats"),
  adminApproveJob: (payload) => apiRequest("adminApproveJob", payload),
  adminRejectJob: (payload) => apiRequest("adminRejectJob", payload),
  submitAccessPayment: (payload) => apiRequest("submitAccessPayment", payload),
  getAccessRequests: (payload) => apiRequest("getAccessRequests", payload),
  approveAccessRequest: (payload) => apiRequest("approveAccessRequest", payload),
  rejectAccessRequest: (payload) => apiRequest("rejectAccessRequest", payload),
  getSiteSettings: () => apiRequest("getSiteSettings"),
  updateSiteSettings: (payload) => apiRequest("updateSiteSettings", payload),
  adminGetAllWallets: () => apiRequest("adminGetAllWallets"),
  getReferrals: (payload) => apiRequest("getReferrals", payload),
};

/* Effective site settings, cached per page load — layers any admin edits
   (stored server-side) on top of the SITE_CONFIG code defaults. Any page
   that shows the fee amount or company payment details should call this
   instead of reading SITE_CONFIG directly, so admin edits take effect
   everywhere without a code change. */
let _siteSettingsCache = null;
async function getEffectiveSiteConfig(forceRefresh = false) {
  if (_siteSettingsCache && !forceRefresh) return _siteSettingsCache;
  const res = await API.getSiteSettings();
  _siteSettingsCache = res.ok ? res.settings : SITE_CONFIG;
  return _siteSettingsCache;
}
