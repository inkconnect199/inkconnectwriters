/**
 * ============================================================
 * INKCONNECT — GOOGLE APPS SCRIPT BACKEND
 * ============================================================
 * Deploy this as a Web App (Deploy > New deployment > Web app,
 * execute as "Me", access "Anyone"). Paste the resulting /exec
 * URL into API_CONFIG.GAS_URL in assets/js/api.js to switch the
 * frontend from its local demo database to this live backend.
 *
 * Sheet tabs required (create them once, headers in row 1):
 *   Users, Jobs, Applications, Messages, Payments, Wallet,
 *   Notifications, Reviews, SupportTickets, Settings
 * See SETUP.md for exact column headers for each tab.
 *
 * SECURITY NOTE: passwords arrive already SHA-256 hashed by the
 * client (see assets/js/auth.js Auth.hash). This script never
 * receives or stores plain text passwords.
 * ============================================================ */

const SHEET_NAMES = {
  USERS: "Users", JOBS: "Jobs", APPLICATIONS: "Applications", MESSAGES: "Messages",
  PAYMENTS: "Payments", WALLET: "Wallet", NOTIFICATIONS: "Notifications",
  REVIEWS: "Reviews", TICKETS: "SupportTickets", SETTINGS: "Settings",
  ACCESS_REQUESTS: "AccessRequests",
};

/* ============================================================
   ⚙️  EASY-EDIT SETTINGS
   Change anything here to update site-wide behavior — nothing
   else in this file needs to change. Keep this in sync with
   SITE_CONFIG in assets/js/api.js if you edit either one.
   ============================================================ */
const SITE_CONFIG = {
  ACCESS_FEE_KES: 500,
  ACCESS_FEE_USD: 5,
  COMPANY_MPESA_NUMBER: "0106012195",
  COMPANY_PAYPAL_EMAIL: "inkconnect.payments@gmail.com",
  COMPANY_NAME: "InkConnect",
  REQUIRE_CLIENT_ACCESS_FEE: true,
  REQUIRE_WRITER_ACCESS_FEE: true,
  REQUIRE_ADMIN_JOB_APPROVAL: true,
  REFERRAL_BONUS_KES: 100,
  REFERRAL_BONUS_USD: 1,
  MAX_WITHDRAWAL_USD: 2000,
};

/** Whether this role must pay the one-time access fee. Mirrors
    roleNeedsAccessFee() in assets/js/api.js — keep both in sync. */
function roleNeedsAccessFee(role) {
  if (role === "client") return SITE_CONFIG.REQUIRE_CLIENT_ACCESS_FEE;
  if (role === "writer") return SITE_CONFIG.REQUIRE_WRITER_ACCESS_FEE;
  return false;
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) {
    return jsonResponse({ ok: false, error: "Invalid request body." });
  }

  // M-Pesa calls back to this same Web App URL directly (not through our
  // {action, payload} envelope). Detect and handle that shape here.
  if (body.Body && body.Body.stkCallback) return handleMpesaCallback(body);
  if (body.Result && body.Result.ResultType !== undefined) return handleMpesaB2CCallback(body);

  const { action, payload } = body;
  try {
    if (typeof Actions[action] !== "function") {
      return jsonResponse({ ok: false, error: "Unknown action: " + action });
    }
    const result = Actions[action](payload || {});
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

/** Handles the STK Push result Safaricom POSTs asynchronously after the
    customer enters (or cancels) their M-Pesa PIN. Because this reference
    implementation credits the wallet optimistically when the push is sent
    (see Actions.deposit), a failed/cancelled push here reverses that
    credit. Matches the payment row by its CheckoutRequestID reference. */
function handleMpesaCallback(body) {
  try {
    const cb = body.Body.stkCallback;
    const reference = cb.CheckoutRequestID;
    const payments = readRows(SHEET_NAMES.PAYMENTS);
    const payment = payments.find((p) => p.reference === reference);
    if (payment && cb.ResultCode !== 0) {
      // Push failed or was cancelled — reverse the optimistic wallet credit.
      const wallet = readRows(SHEET_NAMES.WALLET).find((w) => w.userId === payment.userId);
      if (wallet) updateRowById(SHEET_NAMES.WALLET, "userId", payment.userId, { balance: Number(wallet.balance) - Number(payment.amount) });
      notify(payment.userId, "payment", "Your M-Pesa deposit of $" + payment.amount + " failed or was cancelled.");
    }
  } catch (err) {
    // Swallow errors here — Safaricom only cares about a 200 response.
  }
  return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
}

/** Handles the B2C (withdrawal payout) result callback. Extension point:
    wire this up to mark the corresponding Payments row as confirmed/failed
    and notify the writer once you've enabled real M-Pesa payouts. */
function handleMpesaB2CCallback(body) {
  return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
}

function doGet(e) {
  return jsonResponse({ ok: true, message: "InkConnect API is running. Use POST requests." });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Sheet helpers ---------------- */
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Missing sheet tab: " + name + ". See SETUP.md.");
  return sheet;
}

function readRows(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter((row) => row.some((c) => c !== "")).map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
}

function appendRow(sheetName, obj) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map((h) => (obj[h] !== undefined ? obj[h] : ""));
  sheet.appendRow(row);
}

function updateRowById(sheetName, idField, idValue, updates) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf(idField);
  for (let r = 1; r < values.length; r++) {
    if (values[r][idCol] === idValue) {
      Object.keys(updates).forEach((key) => {
        const col = headers.indexOf(key);
        if (col !== -1) sheet.getRange(r + 1, col + 1).setValue(updates[key]);
      });
      return true;
    }
  }
  return false;
}

function findRowIndexById(sheetName, idField, idValue) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf(idField);
  for (let r = 1; r < values.length; r++) if (values[r][idCol] === idValue) return r + 1;
  return -1;
}

function uid(prefix) {
  return prefix + "_" + Utilities.getUuid().split("-")[0];
}

function nowMs() { return new Date().getTime(); }

/* ---------------- Payment gateway config ----------------
   Set these in Apps Script: Project Settings > Script Properties.
   Leave any of them blank to fall back to simulated instant
   success for that method, so the app is always fully testable
   even before you have live credentials. See SETUP.md. */
function getPaymentConfig() {
  const p = PropertiesService.getScriptProperties();
  return {
    MPESA_CONSUMER_KEY: p.getProperty("MPESA_CONSUMER_KEY"),
    MPESA_CONSUMER_SECRET: p.getProperty("MPESA_CONSUMER_SECRET"),
    MPESA_SHORTCODE: p.getProperty("MPESA_SHORTCODE"),
    MPESA_PASSKEY: p.getProperty("MPESA_PASSKEY"),
    MPESA_ENV: p.getProperty("MPESA_ENV") || "sandbox", // "sandbox" or "production"
    MPESA_INITIATOR_NAME: p.getProperty("MPESA_INITIATOR_NAME"),
    MPESA_SECURITY_CREDENTIAL: p.getProperty("MPESA_SECURITY_CREDENTIAL"),
    PAYPAL_CLIENT_ID: p.getProperty("PAYPAL_CLIENT_ID"),
    PAYPAL_CLIENT_SECRET: p.getProperty("PAYPAL_CLIENT_SECRET"),
    PAYPAL_ENV: p.getProperty("PAYPAL_ENV") || "sandbox",
  };
}

function mpesaBaseUrl(cfg) {
  return cfg.MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

function mpesaAccessToken(cfg) {
  const url = mpesaBaseUrl(cfg) + "/oauth/v1/generate?grant_type=client_credentials";
  const auth = Utilities.base64Encode(cfg.MPESA_CONSUMER_KEY + ":" + cfg.MPESA_CONSUMER_SECRET);
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: "Basic " + auth }, muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error("M-Pesa auth failed: " + res.getContentText());
  return data.access_token;
}

/** Deposit: STK Push — prompts the payer's phone for their M-Pesa PIN. */
function mpesaSTKPush(cfg, phone, amount, accountRef, callbackUrl) {
  const token = mpesaAccessToken(cfg);
  const timestamp = Utilities.formatDate(new Date(), "GMT+3", "yyyyMMddHHmmss");
  const password = Utilities.base64Encode(cfg.MPESA_SHORTCODE + cfg.MPESA_PASSKEY + timestamp);
  const normalizedPhone = phone.replace(/^\+/, "").replace(/^0/, "254");
  const payload = {
    BusinessShortCode: cfg.MPESA_SHORTCODE, Password: password, Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline", Amount: Math.max(1, Math.round(amount)),
    PartyA: normalizedPhone, PartyB: cfg.MPESA_SHORTCODE, PhoneNumber: normalizedPhone,
    CallBackURL: callbackUrl, AccountReference: accountRef || "InkConnect", TransactionDesc: "InkConnect wallet deposit",
  };
  const res = UrlFetchApp.fetch(mpesaBaseUrl(cfg) + "/mpesa/stkpush/v1/processrequest", {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (data.ResponseCode === "0") return { success: true, checkoutRequestId: data.CheckoutRequestID, pending: true };
  return { success: false, error: data.errorMessage || "STK push failed." };
}

/** Withdraw: B2C payout — sends money from the business shortcode to a customer's phone.
    Requires an Initiator Name and an encrypted Security Credential from Safaricom;
    see SETUP.md for how to generate MPESA_SECURITY_CREDENTIAL. */
function mpesaB2CPayout(cfg, phone, amount, remarks, callbackUrl) {
  if (!cfg.MPESA_INITIATOR_NAME || !cfg.MPESA_SECURITY_CREDENTIAL) {
    return { success: false, error: "M-Pesa payouts need MPESA_INITIATOR_NAME and MPESA_SECURITY_CREDENTIAL configured." };
  }
  const token = mpesaAccessToken(cfg);
  const normalizedPhone = phone.replace(/^\+/, "").replace(/^0/, "254");
  const payload = {
    InitiatorName: cfg.MPESA_INITIATOR_NAME, SecurityCredential: cfg.MPESA_SECURITY_CREDENTIAL,
    CommandID: "BusinessPayment", Amount: Math.max(1, Math.round(amount)), PartyA: cfg.MPESA_SHORTCODE,
    PartyB: normalizedPhone, Remarks: remarks || "InkConnect withdrawal", QueueTimeOutURL: callbackUrl,
    ResultURL: callbackUrl, Occasion: "Withdrawal",
  };
  const res = UrlFetchApp.fetch(mpesaBaseUrl(cfg) + "/mpesa/b2c/v1/paymentrequest", {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (data.ResponseCode === "0") return { success: true, conversationId: data.ConversationID, pending: true };
  return { success: false, error: data.errorMessage || "M-Pesa payout failed." };
}

function paypalBaseUrl(cfg) {
  return cfg.PAYPAL_ENV === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function paypalAccessToken(cfg) {
  const auth = Utilities.base64Encode(cfg.PAYPAL_CLIENT_ID + ":" + cfg.PAYPAL_CLIENT_SECRET);
  const res = UrlFetchApp.fetch(paypalBaseUrl(cfg) + "/v1/oauth2/token", {
    method: "post", headers: { Authorization: "Basic " + auth }, contentType: "application/x-www-form-urlencoded",
    payload: "grant_type=client_credentials", muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error("PayPal auth failed: " + res.getContentText());
  return data.access_token;
}

/** Withdraw: PayPal Payouts API — sends money to a payee's PayPal email. */
function paypalPayout(cfg, email, amount, note) {
  const token = paypalAccessToken(cfg);
  const payload = {
    sender_batch_header: { sender_batch_id: uid("batch"), email_subject: "You've received a payout from InkConnect" },
    items: [{
      recipient_type: "EMAIL", amount: { value: Number(amount).toFixed(2), currency: "USD" },
      note: note || "InkConnect withdrawal", receiver: email,
    }],
  };
  const res = UrlFetchApp.fetch(paypalBaseUrl(cfg) + "/v1/payments/payouts", {
    method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (data.batch_header && data.batch_header.payout_batch_id) return { success: true, batchId: data.batch_header.payout_batch_id, pending: true };
  return { success: false, error: (data.message || "PayPal payout failed.") };
}

/** Note: PayPal *deposits* (client adds funds) normally use the PayPal JS SDK
    Orders API with a browser-side approval redirect, which needs a hosted
    checkout page rather than a single server call. That flow is documented
    in SETUP.md as an extension point; deposits fall back to simulated
    success here so the rest of the app is always testable end-to-end. */


function sanitizeUser(u) {
  const copy = Object.assign({}, u);
  delete copy.passwordHash;
  // Same Sheets-numeric-coercion guard as asText() below, applied to every
  // field the frontend always treats as text (phone numbers typed without
  // a leading 0/+ are the most common case that gets silently turned into
  // a Number by Sheets).
  ["fullName", "username", "email", "phone", "country", "bio", "referralCode", "referredBy"].forEach((k) => {
    if (copy[k] !== undefined) copy[k] = asText(copy[k]);
  });
  return copy;
}

/** Forces a value to a string. Google Sheets returns purely-numeric
    cells (an all-digit confirmation code, a phone number, etc.) as an
    actual Number rather than a String — this normalizes that back for
    any field the frontend expects to always be text. */
function asText(v) {
  return v === null || v === undefined ? "" : String(v);
}

/** Short, shareable referral code — base name + 4 random digits, retried
    until unique against the given user rows. */
function generateReferralCode(users, base) {
  const clean = String(base || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "user";
  let code;
  do { code = clean + Math.floor(1000 + Math.random() * 9000); } while (users.some((u) => u.referralCode === code));
  return code;
}

/** Credits the referrer's wallet once their referred user becomes a real,
    approved account. Idempotent — checks for an existing referral payment
    for this referredUser before crediting again. */
function awardReferralBonus(referredUser) {
  if (!referredUser.referredBy) return;
  const already = readRows(SHEET_NAMES.PAYMENTS).find((p) => p.type === "referral" && p.relatedUserId === referredUser.id);
  if (already) return;
  const referrer = readRows(SHEET_NAMES.USERS).find((u) => u.id === referredUser.referredBy);
  if (!referrer) return;
  const amount = SITE_CONFIG.REFERRAL_BONUS_USD;
  const wallet = readRows(SHEET_NAMES.WALLET).find((w) => w.userId === referrer.id);
  const newBal = (wallet ? Number(wallet.balance) : 0) + amount;
  if (wallet) updateRowById(SHEET_NAMES.WALLET, "userId", referrer.id, { balance: newBal });
  else appendRow(SHEET_NAMES.WALLET, { userId: referrer.id, balance: newBal, escrow: 0 });
  appendRow(SHEET_NAMES.PAYMENTS, { id: uid("pay"), type: "referral", userId: referrer.id, relatedUserId: referredUser.id, amount, createdAt: nowMs() });
  notify(referrer.id, "payment", "You earned $" + amount + " — " + referredUser.fullName + " joined through your referral link!");
}

/* ---------------- Actions ---------------- */
const Actions = {

  register(p) {
    const users = readRows(SHEET_NAMES.USERS);
    if (users.find((u) => String(u.email).toLowerCase() === String(p.email).toLowerCase())) {
      return { ok: false, error: "An account with this email already exists." };
    }
    let referrer = null;
    if (p.referralCode) referrer = users.find((u) => u.referralCode && String(u.referralCode).toLowerCase() === String(p.referralCode).trim().toLowerCase());

    const user = {
      id: uid("usr"), fullName: p.fullName, username: p.username, email: p.email, phone: p.phone,
      country: p.country, role: p.role, passwordHash: p.passwordHash, profilePic: p.profilePic || "",
      bio: "", skills: "", rate: 0, rating: 0, completedJobs: 0, createdAt: nowMs(), verified: true, suspended: false,
      accessStatus: roleNeedsAccessFee(p.role) ? "unpaid" : "active", accessRejectionReason: "",
      referralCode: generateReferralCode(users, p.username || p.fullName), referredBy: referrer ? referrer.id : "",
    };
    appendRow(SHEET_NAMES.USERS, user);
    appendRow(SHEET_NAMES.WALLET, { userId: user.id, balance: p.role === "client" ? 100 : 0, escrow: 0 });

    // No approval gate for this role — active immediately, so award now.
    if (user.accessStatus === "active" && user.referredBy) awardReferralBonus(user);

    return { ok: true, user: sanitizeUser(user) };
  },

  login(p) {
    const users = readRows(SHEET_NAMES.USERS);
    const user = users.find((u) => String(u.email).toLowerCase() === String(p.email).toLowerCase());
    if (!user) return { ok: false, error: "No account found with that email." };
    if (user.passwordHash !== p.passwordHash) return { ok: false, error: "Incorrect password." };
    if (user.suspended) return { ok: false, error: "This account has been suspended. Contact support." };
    return { ok: true, user: sanitizeUser(user), token: uid("tok") };
  },

  getWriters() {
    const users = readRows(SHEET_NAMES.USERS).filter((u) => u.role === "writer");
    return { ok: true, writers: users.map(sanitizeUser).map(deserializeSkills) };
  },

  getUser(p) {
    const user = readRows(SHEET_NAMES.USERS).find((u) => u.id === p.id);
    if (!user) return { ok: false, error: "User not found." };
    return { ok: true, user: sanitizeUser(user) };
  },

  /** Verifies the email exists — the first step of the forgot-password
      flow, before the person is allowed to set a new password. */
  checkEmailExists(p) {
    const user = readRows(SHEET_NAMES.USERS).find((u) => String(u.email).toLowerCase() === String(p.email || "").toLowerCase());
    return { ok: true, exists: !!user };
  },

  /** Forgot password: resets by email once it's been verified to exist.
      For production, extend this with MailApp.sendEmail() and a real
      time-limited token instead of resetting immediately. */
  resetPassword(p) {
    const user = readRows(SHEET_NAMES.USERS).find((u) => String(u.email).toLowerCase() === String(p.email || "").toLowerCase());
    if (!user) return { ok: false, error: "No account found with that email." };
    updateRowById(SHEET_NAMES.USERS, "id", user.id, { passwordHash: p.newPasswordHash });
    notify(user.id, "payment", "Your password was reset.");
    return { ok: true };
  },

  /** Change password while logged in — requires the current password. */
  changePassword(p) {
    const user = readRows(SHEET_NAMES.USERS).find((u) => u.id === p.userId);
    if (!user) return { ok: false, error: "User not found." };
    if (user.passwordHash !== p.currentPasswordHash) return { ok: false, error: "Current password is incorrect." };
    updateRowById(SHEET_NAMES.USERS, "id", user.id, { passwordHash: p.newPasswordHash });
    return { ok: true };
  },

  updateProfile(p) {
    const updates = Object.assign({}, p.updates);
    if (Array.isArray(updates.skills)) updates.skills = updates.skills.join(",");
    updateRowById(SHEET_NAMES.USERS, "id", p.id, updates);
    const user = readRows(SHEET_NAMES.USERS).find((u) => u.id === p.id);
    return { ok: true, user: sanitizeUser(user) };
  },

  getJobs(p) {
    let jobs = readRows(SHEET_NAMES.JOBS);
    if (p && p.clientId) jobs = jobs.filter((j) => j.clientId === p.clientId);
    if (p && p.status) jobs = jobs.filter((j) => j.status === p.status);
    jobs.sort((a, b) => b.createdAt - a.createdAt);
    return { ok: true, jobs };
  },

  postJob(p) {
    const needsApproval = SITE_CONFIG.REQUIRE_ADMIN_JOB_APPROVAL;
    const job = {
      id: uid("job"), clientId: p.clientId, clientName: p.clientName, title: p.title, category: p.category,
      budget: Number(p.budget), description: p.description, status: needsApproval ? "pending_review" : "open",
      createdAt: nowMs(), deadline: nowMs() + (Number(p.days) || 7) * 86400000, rejectionReason: "",
    };
    appendRow(SHEET_NAMES.JOBS, job);
    if (needsApproval) {
      readRows(SHEET_NAMES.USERS).filter((u) => u.role === "admin").forEach((a) => notify(a.id, "job", 'New job "' + job.title + '" is awaiting approval.'));
    }
    return { ok: true, job };
  },

  /** Admin: approve a client's pending job so it becomes visible to writers. */
  adminApproveJob(p) {
    const job = readRows(SHEET_NAMES.JOBS).find((j) => j.id === p.jobId);
    if (!job) return { ok: false, error: "Job not found." };
    updateRowById(SHEET_NAMES.JOBS, "id", job.id, { status: "open", rejectionReason: "" });
    notify(job.clientId, "job", 'Your job "' + job.title + '" was approved and is now live.');
    return { ok: true };
  },

  /** Admin: reject a client's pending job with a reason shown back to the client. */
  adminRejectJob(p) {
    const job = readRows(SHEET_NAMES.JOBS).find((j) => j.id === p.jobId);
    if (!job) return { ok: false, error: "Job not found." };
    const reason = p.reason || "Did not meet posting guidelines.";
    updateRowById(SHEET_NAMES.JOBS, "id", job.id, { status: "rejected", rejectionReason: reason });
    notify(job.clientId, "job", 'Your job "' + job.title + '" was rejected: ' + reason);
    return { ok: true };
  },

  editJob(p) { updateRowById(SHEET_NAMES.JOBS, "id", p.id, p.updates); return { ok: true }; },

  deleteJob(p) {
    const row = findRowIndexById(SHEET_NAMES.JOBS, "id", p.id);
    if (row === -1) return { ok: false, error: "Job not found." };
    getSheet(SHEET_NAMES.JOBS).deleteRow(row);
    return { ok: true };
  },

  applyJob(p) {
    const existing = readRows(SHEET_NAMES.APPLICATIONS).find((a) => a.jobId === p.jobId && a.writerId === p.writerId);
    if (existing) return { ok: false, error: "You already applied to this job." };
    const app = {
      id: uid("app"), jobId: p.jobId, writerId: p.writerId, writerName: p.writerName,
      coverLetter: p.coverLetter, proposedRate: p.proposedRate, status: "pending", createdAt: nowMs(),
    };
    appendRow(SHEET_NAMES.APPLICATIONS, app);
    const job = readRows(SHEET_NAMES.JOBS).find((j) => j.id === p.jobId);
    if (job) notify(job.clientId, "application", "New application from " + p.writerName);
    return { ok: true, application: app };
  },

  getApplications(p) {
    let apps = readRows(SHEET_NAMES.APPLICATIONS);
    const jobs = readRows(SHEET_NAMES.JOBS);
    if (p.jobId) apps = apps.filter((a) => a.jobId === p.jobId);
    if (p.writerId) apps = apps.filter((a) => a.writerId === p.writerId);
    if (p.clientId) {
      const clientJobIds = jobs.filter((j) => j.clientId === p.clientId).map((j) => j.id);
      apps = apps.filter((a) => clientJobIds.includes(a.jobId));
    }
    apps = apps.map((a) => Object.assign({}, a, { job: jobs.find((j) => j.id === a.jobId) }));
    return { ok: true, applications: apps };
  },

  acceptWriter(p) {
    const app = readRows(SHEET_NAMES.APPLICATIONS).find((a) => a.id === p.applicationId);
    if (!app) return { ok: false, error: "Application not found." };
    updateRowById(SHEET_NAMES.APPLICATIONS, "id", app.id, { status: "accepted" });
    updateRowById(SHEET_NAMES.JOBS, "id", app.jobId, { status: "in_progress" });
    readRows(SHEET_NAMES.APPLICATIONS).filter((a) => a.jobId === app.jobId && a.id !== app.id)
      .forEach((a) => updateRowById(SHEET_NAMES.APPLICATIONS, "id", a.id, { status: "rejected" }));
    notify(app.writerId, "application", "You were accepted for a job.");
    return { ok: true };
  },

  rejectWriter(p) {
    const app = readRows(SHEET_NAMES.APPLICATIONS).find((a) => a.id === p.applicationId);
    if (!app) return { ok: false, error: "Application not found." };
    updateRowById(SHEET_NAMES.APPLICATIONS, "id", app.id, { status: "rejected" });
    notify(app.writerId, "application", "An application was declined.");
    return { ok: true };
  },

  uploadWork(p) {
    updateRowById(SHEET_NAMES.JOBS, "id", p.jobId, { status: "submitted", submissionFile: p.fileName, submissionNote: p.note });
    const job = readRows(SHEET_NAMES.JOBS).find((j) => j.id === p.jobId);
    if (job) notify(job.clientId, "job", 'Work submitted for "' + job.title + '"');
    return { ok: true };
  },

  payWriter(p) {
    const job = readRows(SHEET_NAMES.JOBS).find((j) => j.id === p.jobId);
    if (!job) return { ok: false, error: "Job not found." };
    const wallets = readRows(SHEET_NAMES.WALLET);
    const clientWallet = wallets.find((w) => w.userId === job.clientId);
    if (!clientWallet || Number(clientWallet.balance) < Number(job.budget)) {
      return { ok: false, error: "Insufficient wallet balance to release payment." };
    }
    updateRowById(SHEET_NAMES.WALLET, "userId", job.clientId, { balance: Number(clientWallet.balance) - Number(job.budget) });
    const app = readRows(SHEET_NAMES.APPLICATIONS).find((a) => a.jobId === job.id && a.status === "accepted");
    if (app) {
      const writerWallet = wallets.find((w) => w.userId === app.writerId);
      const newBal = (writerWallet ? Number(writerWallet.balance) : 0) + Number(job.budget);
      if (writerWallet) updateRowById(SHEET_NAMES.WALLET, "userId", app.writerId, { balance: newBal });
      else appendRow(SHEET_NAMES.WALLET, { userId: app.writerId, balance: newBal, escrow: 0 });
      notify(app.writerId, "payment", "Payment received: $" + job.budget);
    }
    updateRowById(SHEET_NAMES.JOBS, "id", job.id, { status: "completed" });
    appendRow(SHEET_NAMES.PAYMENTS, { id: uid("pay"), jobId: job.id, clientId: job.clientId, writerId: app ? app.writerId : "", amount: job.budget, createdAt: nowMs() });
    return { ok: true };
  },

  review(p) {
    appendRow(SHEET_NAMES.REVIEWS, { id: uid("rev"), jobId: p.jobId, fromId: p.fromId, toId: p.toId, rating: Number(p.rating), comment: p.comment, createdAt: nowMs() });
    const reviews = readRows(SHEET_NAMES.REVIEWS).filter((r) => r.toId === p.toId);
    const avg = reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length;
    updateRowById(SHEET_NAMES.USERS, "id", p.toId, { rating: Math.round(avg * 10) / 10 });
    notify(p.toId, "review", "You received a new review.");
    return { ok: true };
  },

  getReviews(p) { return { ok: true, reviews: readRows(SHEET_NAMES.REVIEWS).filter((r) => r.toId === p.userId) }; },

  sendMessage(p) {
    const msg = { id: uid("msg"), threadId: p.threadId, fromId: p.fromId, toId: p.toId, text: p.text, createdAt: nowMs(), read: false };
    appendRow(SHEET_NAMES.MESSAGES, msg);
    notify(p.toId, "message", "New message received.");
    return { ok: true, message: msg };
  },

  getMessages(p) {
    const msgs = readRows(SHEET_NAMES.MESSAGES).filter((m) => m.threadId === p.threadId).sort((a, b) => a.createdAt - b.createdAt);
    return { ok: true, messages: msgs };
  },

  getThreads(p) {
    const all = readRows(SHEET_NAMES.MESSAGES).filter((m) => m.fromId === p.userId || m.toId === p.userId);
    const users = readRows(SHEET_NAMES.USERS);
    const ids = [...new Set(all.map((m) => m.threadId))];
    const threads = ids.map((tid) => {
      const msgs = all.filter((m) => m.threadId === tid).sort((a, b) => b.createdAt - a.createdAt);
      const last = msgs[0];
      const otherId = last.fromId === p.userId ? last.toId : last.fromId;
      const other = users.find((u) => u.id === otherId);
      const unread = msgs.filter((m) => m.toId === p.userId && !m.read).length;
      return { threadId: tid, otherId, otherName: other ? other.fullName : "User", lastText: last.text, lastAt: last.createdAt, unread };
    });
    return { ok: true, threads: threads.sort((a, b) => b.lastAt - a.lastAt) };
  },

  markRead(p) {
    readRows(SHEET_NAMES.MESSAGES).filter((m) => m.threadId === p.threadId && m.toId === p.userId)
      .forEach((m) => updateRowById(SHEET_NAMES.MESSAGES, "id", m.id, { read: true }));
    return { ok: true };
  },

  /** Admin: every conversation on the platform, across all clients and
      writers — for moderation and dispute resolution. */
  adminGetAllThreads() {
    const messages = readRows(SHEET_NAMES.MESSAGES);
    const users = readRows(SHEET_NAMES.USERS);
    const threadIds = [...new Set(messages.map((m) => m.threadId))];
    const threads = threadIds.map((tid) => {
      const msgs = messages.filter((m) => m.threadId === tid).sort((a, b) => b.createdAt - a.createdAt);
      const last = msgs[0];
      const fromUser = users.find((u) => u.id === last.fromId);
      const toUser = users.find((u) => u.id === last.toId);
      return {
        threadId: tid, messageCount: msgs.length, lastText: last.text, lastAt: last.createdAt,
        participantA: fromUser ? { id: fromUser.id, name: fromUser.fullName, role: fromUser.role } : { id: last.fromId, name: "Unknown", role: "" },
        participantB: toUser ? { id: toUser.id, name: toUser.fullName, role: toUser.role } : { id: last.toId, name: "Unknown", role: "" },
      };
    });
    return { ok: true, threads: threads.sort((a, b) => b.lastAt - a.lastAt) };
  },

  deposit(p) {
    const method = p.method || "bank";
    const cfg = getPaymentConfig();
    let gateway = { success: true, reference: p.reference || uid("ref").toUpperCase(), simulated: true };

    try {
      if (method === "mpesa" && cfg.MPESA_CONSUMER_KEY) {
        const callbackUrl = ScriptApp.getService().getUrl();
        const r = mpesaSTKPush(cfg, p.accountRef, p.amount, p.accountRef, callbackUrl);
        if (!r.success) return { ok: false, error: r.error };
        // STK push is asynchronous in production (the customer must enter their PIN,
        // then Safaricom calls back to doPost). For this reference implementation we
        // credit the wallet immediately so the demo flow completes without requiring
        // you to wire up the callback handler — see SETUP.md to make this fully async.
        gateway = { success: true, reference: r.checkoutRequestId, simulated: false };
      } else if (method === "paypal" && cfg.PAYPAL_CLIENT_ID) {
        // See the note above mpesaBaseUrl/paypalPayout: PayPal deposits need a
        // browser-side checkout approval flow. Falls back to simulated success.
        gateway = { success: true, reference: p.reference || uid("ref").toUpperCase(), simulated: true };
      }
    } catch (err) {
      return { ok: false, error: "Payment gateway error: " + err.message };
    }

    const wallets = readRows(SHEET_NAMES.WALLET);
    const w = wallets.find((x) => x.userId === p.userId);
    const newBal = (w ? Number(w.balance) : 0) + Number(p.amount);
    if (w) updateRowById(SHEET_NAMES.WALLET, "userId", p.userId, { balance: newBal });
    else appendRow(SHEET_NAMES.WALLET, { userId: p.userId, balance: newBal, escrow: 0 });
    appendRow(SHEET_NAMES.PAYMENTS, {
      id: uid("pay"), userId: p.userId, type: "deposit", amount: Number(p.amount), method,
      accountRef: p.accountRef || "", accountName: p.accountName || "", reference: gateway.reference, createdAt: nowMs(),
    });
    notify(p.userId, "payment", "Deposit of $" + p.amount + " via " + method + " confirmed.");
    return { ok: true, wallet: { userId: p.userId, balance: newBal }, reference: gateway.reference };
  },

  withdraw(p) {
    const method = p.method || "bank";
    const amount = Number(p.amount);
    if (amount > SITE_CONFIG.MAX_WITHDRAWAL_USD) return { ok: false, error: "Withdrawals are capped at $" + SITE_CONFIG.MAX_WITHDRAWAL_USD + " per request." };
    const cfg = getPaymentConfig();
    const w = readRows(SHEET_NAMES.WALLET).find((x) => x.userId === p.userId);
    if (!w || Number(w.balance) < amount) return { ok: false, error: "Insufficient balance." };

    let gateway = { success: true, reference: p.reference || uid("ref").toUpperCase(), simulated: true };
    try {
      if (method === "mpesa" && cfg.MPESA_CONSUMER_KEY) {
        const callbackUrl = ScriptApp.getService().getUrl();
        const r = mpesaB2CPayout(cfg, p.accountRef, amount, "InkConnect withdrawal", callbackUrl);
        if (!r.success) return { ok: false, error: r.error };
        gateway = { success: true, reference: r.conversationId, simulated: false };
      } else if (method === "paypal" && cfg.PAYPAL_CLIENT_ID) {
        const r = paypalPayout(cfg, p.accountRef, amount, "InkConnect withdrawal");
        if (!r.success) return { ok: false, error: r.error };
        gateway = { success: true, reference: r.batchId, simulated: false };
      }
    } catch (err) {
      return { ok: false, error: "Payment gateway error: " + err.message };
    }

    const newBal = Number(w.balance) - amount;
    updateRowById(SHEET_NAMES.WALLET, "userId", p.userId, { balance: newBal });
    appendRow(SHEET_NAMES.PAYMENTS, {
      id: uid("pay"), userId: p.userId, type: "withdraw", amount, method,
      accountRef: p.accountRef || "", accountName: p.accountName || "", reference: gateway.reference, createdAt: nowMs(),
    });
    notify(p.userId, "payment", "Withdrawal of $" + amount + " via " + method + " requested.");
    return { ok: true, wallet: { userId: p.userId, balance: newBal }, reference: gateway.reference };
  },

  getWallet(p) {
    const w = readRows(SHEET_NAMES.WALLET).find((x) => x.userId === p.userId);
    return { ok: true, wallet: w || { userId: p.userId, balance: 0, escrow: 0 } };
  },

  getTransactions(p) {
    const tx = readRows(SHEET_NAMES.PAYMENTS).filter((t) => t.userId === p.userId || t.clientId === p.userId || t.writerId === p.userId);
    return { ok: true, transactions: tx.sort((a, b) => b.createdAt - a.createdAt) };
  },

  notification(p) { notify(p.userId, p.type, p.text); return { ok: true }; },

  /** Admin: broadcast an announcement to every non-admin user as a real
      notification row per recipient. */
  broadcastAnnouncement(p) {
    const text = (p.text || "").trim();
    if (!text) return { ok: false, error: "Write an announcement first." };
    const recipients = readRows(SHEET_NAMES.USERS).filter((u) => u.role !== "admin");
    recipients.forEach((u) => notify(u.id, "announcement", text));
    return { ok: true, recipientCount: recipients.length };
  },

  getNotifications(p) {
    const list = readRows(SHEET_NAMES.NOTIFICATIONS).filter((n) => n.userId === p.userId).sort((a, b) => b.createdAt - a.createdAt);
    return { ok: true, notifications: list };
  },

  markNotificationsRead(p) {
    readRows(SHEET_NAMES.NOTIFICATIONS).filter((n) => n.userId === p.userId)
      .forEach((n) => updateRowById(SHEET_NAMES.NOTIFICATIONS, "id", n.id, { read: true }));
    return { ok: true };
  },

  createTicket(p) {
    const t = { id: uid("tik"), userId: p.userId || "", name: p.name, email: p.email, subject: p.subject, message: p.message, status: "open", createdAt: nowMs() };
    appendRow(SHEET_NAMES.TICKETS, t);
    return { ok: true, ticket: t };
  },

  getTickets(p) {
    let tickets = readRows(SHEET_NAMES.TICKETS);
    if (p && p.userId) tickets = tickets.filter((t) => t.userId === p.userId);
    return { ok: true, tickets: tickets.sort((a, b) => b.createdAt - a.createdAt) };
  },

  updateTicket(p) { updateRowById(SHEET_NAMES.TICKETS, "id", p.id, p.updates); return { ok: true }; },

  adminGetUsers() { return { ok: true, users: readRows(SHEET_NAMES.USERS).map(sanitizeUser) }; },

  /** Admin: full detail on one user plus a quick activity summary. */
  adminGetUserDetail(p) {
    const allUsers = readRows(SHEET_NAMES.USERS);
    const user = allUsers.find((u) => u.id === p.id);
    if (!user) return { ok: false, error: "User not found." };
    const wallet = readRows(SHEET_NAMES.WALLET).find((w) => w.userId === user.id) || { userId: user.id, balance: 0, escrow: 0 };
    const jobs = user.role === "client" ? readRows(SHEET_NAMES.JOBS).filter((j) => j.clientId === user.id) : [];
    const applications = user.role === "writer" ? readRows(SHEET_NAMES.APPLICATIONS).filter((a) => a.writerId === user.id) : [];
    const accessHistory = readRows(SHEET_NAMES.ACCESS_REQUESTS).filter((r) => r.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    const referredBy = user.referredBy ? allUsers.find((u) => u.id === user.referredBy) : null;
    const referredCount = allUsers.filter((u) => u.referredBy === user.id).length;
    return {
      ok: true, user: sanitizeUser(deserializeSkills(user)), wallet, jobs, applications, accessHistory,
      referredByName: referredBy ? referredBy.fullName : null, referredCount,
    };
  },

  adminSetUserStatus(p) { updateRowById(SHEET_NAMES.USERS, "id", p.id, { suspended: !!p.suspended }); return { ok: true }; },

  /** Client: submit proof of the one-time access-fee payment (M-Pesa, PayPal
      or other). Marks the account "pending" until an admin reviews it. */
  submitAccessPayment(p) {
    const user = readRows(SHEET_NAMES.USERS).find((u) => u.id === p.userId);
    if (!user) return { ok: false, error: "User not found." };
    const request = {
      id: uid("acc"), userId: p.userId, userName: user.fullName, userEmail: user.email,
      method: p.method, accountRef: p.accountRef || "", accountName: p.accountName || "",
      transactionMessage: p.transactionMessage || "", amount: p.amount || SITE_CONFIG.ACCESS_FEE_USD,
      status: "pending", reason: "", createdAt: nowMs(), reviewedAt: "",
    };
    appendRow(SHEET_NAMES.ACCESS_REQUESTS, request);
    updateRowById(SHEET_NAMES.USERS, "id", p.userId, { accessStatus: "pending" });
    readRows(SHEET_NAMES.USERS).filter((u) => u.role === "admin").forEach((a) => notify(a.id, "payment", user.fullName + " submitted an access-fee payment for review."));
    return { ok: true, user: sanitizeUser(Object.assign({}, user, { accessStatus: "pending" })), request };
  },

  /** Admin: list all access-fee submissions, optionally filtered by status. */
  getAccessRequests(p) {
    let list = readRows(SHEET_NAMES.ACCESS_REQUESTS).sort((a, b) => b.createdAt - a.createdAt);
    if (p && p.status) list = list.filter((r) => r.status === p.status);
    // Google Sheets returns purely-numeric cells (an all-digit M-Pesa code,
    // a phone number typed without a leading +, etc.) as an actual Number
    // rather than a String — coerce the text fields back so the frontend
    // never has to guard against this.
    list = list.map((r) => Object.assign({}, r, {
      userName: asText(r.userName), userEmail: asText(r.userEmail), method: asText(r.method),
      accountRef: asText(r.accountRef), accountName: asText(r.accountName),
      transactionMessage: asText(r.transactionMessage), reason: asText(r.reason),
    }));
    return { ok: true, requests: list };
  },

  /** Admin: approve an access-fee submission — unlocks that client's dashboard. */
  approveAccessRequest(p) {
    const req = readRows(SHEET_NAMES.ACCESS_REQUESTS).find((r) => r.id === p.id);
    if (!req) return { ok: false, error: "Request not found." };
    updateRowById(SHEET_NAMES.ACCESS_REQUESTS, "id", req.id, { status: "approved", reviewedAt: nowMs() });
    updateRowById(SHEET_NAMES.USERS, "id", req.userId, { accessStatus: "active", accessRejectionReason: "" });
    notify(req.userId, "payment", "Your access payment was approved — your dashboard is unlocked.");
    const user = readRows(SHEET_NAMES.USERS).find((u) => u.id === req.userId);
    if (user) awardReferralBonus(user);
    return { ok: true };
  },

  /** Admin: reject an access-fee submission, with a reason shown to the client. */
  rejectAccessRequest(p) {
    const req = readRows(SHEET_NAMES.ACCESS_REQUESTS).find((r) => r.id === p.id);
    if (!req) return { ok: false, error: "Request not found." };
    const reason = p.reason || "Transaction could not be verified.";
    updateRowById(SHEET_NAMES.ACCESS_REQUESTS, "id", req.id, { status: "rejected", reviewedAt: nowMs(), reason: reason });
    updateRowById(SHEET_NAMES.USERS, "id", req.userId, { accessStatus: "rejected", accessRejectionReason: reason });
    notify(req.userId, "payment", "Your access payment was rejected: " + reason);
    return { ok: true };
  },

  /** Effective site settings = admin-edited overrides (stored in the
      Settings sheet as key/value rows) layered on top of the SITE_CONFIG
      code defaults. Anyone can read these; only admin actions write. */
  getSiteSettings() {
    const rows = readRows(SHEET_NAMES.SETTINGS);
    const overrides = {};
    rows.forEach((r) => { overrides[r.key] = r.value; });
    // Numeric fields come back as strings from the sheet — coerce them.
    ["ACCESS_FEE_KES", "ACCESS_FEE_USD", "REFERRAL_BONUS_KES", "REFERRAL_BONUS_USD", "MAX_WITHDRAWAL_USD"].forEach((k) => { if (overrides[k] !== undefined) overrides[k] = Number(overrides[k]); });
    return { ok: true, settings: Object.assign({}, SITE_CONFIG, overrides) };
  },

  /** Admin: override the access fee amount and/or company M-Pesa number /
      PayPal email — no code edits required. Upserts rows in Settings. */
  updateSiteSettings(p) {
    const sheet = getSheet(SHEET_NAMES.SETTINGS);
    const existing = readRows(SHEET_NAMES.SETTINGS);
    Object.keys(p.updates || {}).forEach((key) => {
      const value = p.updates[key];
      if (existing.find((r) => r.key === key)) updateRowById(SHEET_NAMES.SETTINGS, "key", key, { value: value });
      else sheet.appendRow([key, value]);
    });
    return Actions.getSiteSettings();
  },

  /** Admin: every user's wallet balance in one table. */
  adminGetAllWallets() {
    const users = readRows(SHEET_NAMES.USERS);
    const wallets = readRows(SHEET_NAMES.WALLET);
    const rows = users.map((u) => {
      const w = wallets.find((x) => x.userId === u.id) || { balance: 0, escrow: 0 };
      return { userId: u.id, name: u.fullName, role: u.role, balance: Number(w.balance || 0), escrow: Number(w.escrow || 0) };
    });
    return { ok: true, wallets: rows.sort((a, b) => b.balance - a.balance) };
  },

  /** A user's own referral code, everyone who joined through it, and
      total bonus earned so far. */
  getReferrals(p) {
    const users = readRows(SHEET_NAMES.USERS);
    const user = users.find((u) => u.id === p.userId);
    if (!user) return { ok: false, error: "User not found." };
    const payments = readRows(SHEET_NAMES.PAYMENTS);
    const referred = users.filter((u) => u.referredBy === user.id).map((u) => {
      const paid = payments.find((pay) => pay.type === "referral" && pay.relatedUserId === u.id);
      return { id: u.id, name: u.fullName, role: u.role, accessStatus: u.accessStatus, joinedAt: u.createdAt, bonusEarned: !!paid };
    });
    const totalEarned = payments.filter((pay) => pay.type === "referral" && pay.userId === user.id).reduce((s, pay) => s + Number(pay.amount), 0);
    return { ok: true, code: user.referralCode, referred: referred.sort((a, b) => b.joinedAt - a.joinedAt), totalEarned };
  },

  adminStats() {
    const users = readRows(SHEET_NAMES.USERS);
    const jobs = readRows(SHEET_NAMES.JOBS);
    const payments = readRows(SHEET_NAMES.PAYMENTS).filter((p) => p.jobId);
    const tickets = readRows(SHEET_NAMES.TICKETS);
    const accessRequests = readRows(SHEET_NAMES.ACCESS_REQUESTS);
    return {
      ok: true,
      stats: {
        writers: users.filter((u) => u.role === "writer").length,
        clients: users.filter((u) => u.role === "client").length,
        jobs: jobs.length,
        completedJobs: jobs.filter((j) => j.status === "completed").length,
        totalPaid: payments.reduce((s, p) => s + Number(p.amount || 0), 0),
        openTickets: tickets.filter((t) => t.status === "open").length,
        pendingJobs: jobs.filter((j) => j.status === "pending_review").length,
        pendingAccessRequests: accessRequests.filter((r) => r.status === "pending").length,
      },
    };
  },
};

function deserializeSkills(u) {
  if (typeof u.skills === "string") u.skills = u.skills ? u.skills.split(",").map((s) => s.trim()) : [];
  return u;
}

function notify(userId, type, text) {
  if (!userId) return;
  appendRow(SHEET_NAMES.NOTIFICATIONS, { id: uid("ntf"), userId, type, text, read: false, createdAt: nowMs() });
}

/**
 * Run once manually from the Apps Script editor (select this function,
 * click Run) to create every sheet tab with correct headers if they
 * don't already exist. See SETUP.md for details.
 */
/**
 * Run this any time — safe to run repeatedly, including on a Sheet you
 * already set up months ago. Creates any missing sheet tabs, AND
 * backfills any columns your existing sheets are missing (e.g. if you
 * set this up before the referral or access-fee features existed).
 * Never touches or deletes existing data — only adds missing headers.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schema = {
    Users: ["id", "fullName", "username", "email", "phone", "country", "role", "passwordHash", "profilePic", "bio", "skills", "rate", "rating", "completedJobs", "createdAt", "verified", "suspended", "accessStatus", "accessRejectionReason", "referralCode", "referredBy"],
    Jobs: ["id", "clientId", "clientName", "title", "category", "budget", "description", "status", "createdAt", "deadline", "submissionFile", "submissionNote", "rejectionReason"],
    Applications: ["id", "jobId", "writerId", "writerName", "coverLetter", "proposedRate", "status", "createdAt"],
    Messages: ["id", "threadId", "fromId", "toId", "text", "createdAt", "read"],
    Payments: ["id", "jobId", "clientId", "writerId", "userId", "type", "amount", "method", "accountRef", "accountName", "reference", "relatedUserId", "createdAt"],
    Wallet: ["userId", "balance", "escrow"],
    Notifications: ["id", "userId", "type", "text", "read", "createdAt"],
    Reviews: ["id", "jobId", "fromId", "toId", "rating", "comment", "createdAt"],
    SupportTickets: ["id", "userId", "name", "email", "subject", "message", "status", "createdAt"],
    Settings: ["key", "value"],
    AccessRequests: ["id", "userId", "userName", "userEmail", "method", "accountRef", "accountName", "transactionMessage", "amount", "status", "reason", "createdAt", "reviewedAt"],
  };

  const report = [];
  Object.keys(schema).forEach((name) => {
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(schema[name]);
      report.push(name + ": created new sheet with " + schema[name].length + " columns.");
      return;
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(schema[name]);
      report.push(name + ": added header row (sheet existed but was empty).");
      return;
    }

    // Sheet already has data — never overwrite it. Just add any columns
    // from the current schema that aren't already there, at the end.
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const missing = schema[name].filter((col) => existingHeaders.indexOf(col) === -1);
    if (missing.length) {
      sheet.getRange(1, existingHeaders.length + 1, 1, missing.length).setValues([missing]);
      report.push(name + ": backfilled missing column(s): " + missing.join(", "));
    } else {
      report.push(name + ": already up to date.");
    }
  });

  SpreadsheetApp.flush();
  Logger.log(report.join("\n"));
  Logger.log("\nDone. If you don't have an admin login yet, run seedAdminAccount() next.");
}

/**
 * Run this any time something isn't working (e.g. "I can't approve a
 * client/writer") to get a full health check in the Logs (View → Logs,
 * or Executions). Checks every sheet exists with the right columns, and
 * whether an admin account exists — the two most common setup issues.
 */
function diagnoseSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requiredSheets = ["Users", "Jobs", "Applications", "Messages", "Payments", "Wallet", "Notifications", "Reviews", "SupportTickets", "Settings", "AccessRequests"];
  const lines = ["=== InkConnect setup diagnostic ==="];

  requiredSheets.forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) { lines.push(name + ": ❌ MISSING — run setupSheets() to create it."); return; }
    const rowCount = Math.max(0, sheet.getLastRow() - 1);
    lines.push(name + ": ✅ exists, " + rowCount + " row(s).");
  });

  try {
    const users = readRows(SHEET_NAMES.USERS);
    const admins = users.filter((u) => u.role === "admin");
    if (admins.length === 0) {
      lines.push("\nAdmin account: ❌ NONE FOUND — run seedAdminAccount() to create admin@inkconnect.com / Admin@123.");
    } else {
      lines.push("\nAdmin account(s): ✅ " + admins.map((a) => a.email).join(", "));
    }

    const usersHeaders = ss.getSheetByName("Users") ? ss.getSheetByName("Users").getRange(1, 1, 1, ss.getSheetByName("Users").getLastColumn()).getValues()[0] : [];
    const criticalCols = ["accessStatus", "referralCode", "referredBy", "passwordHash"];
    const missingCols = criticalCols.filter((c) => usersHeaders.indexOf(c) === -1);
    if (missingCols.length) {
      lines.push("\nUsers sheet is missing column(s): " + missingCols.join(", ") + " — run setupSheets() again to backfill them (this is the #1 cause of \"can't approve\" issues).");
    } else {
      lines.push("\nUsers sheet columns: ✅ all critical columns present.");
    }

    const pending = readRows(SHEET_NAMES.ACCESS_REQUESTS).filter((r) => r.status === "pending");
    lines.push("\nPending access requests waiting for approval: " + pending.length);
  } catch (err) {
    lines.push("\n⚠️ Error while checking Users/AccessRequests: " + err.message);
  }

  Logger.log(lines.join("\n"));
}

/**
 * Run once manually (select this function, click Run) right after
 * setupSheets() to create your first admin login: admin@inkconnect.com
 * / Admin@123. Change that password immediately after your first sign-in
 * (Admin Dashboard → Site Settings → Change your password), or edit the
 * DEFAULT_ADMIN_* constants below before running this and it will use
 * those instead. Safe to run more than once — does nothing if an admin
 * already exists.
 */
function seedAdminAccount() {
  const DEFAULT_ADMIN_EMAIL = "admin@inkconnect.com";
  const DEFAULT_ADMIN_PASSWORD = "Admin@123";

  const existing = readRows(SHEET_NAMES.USERS).find((u) => u.role === "admin");
  if (existing) { Logger.log("An admin account already exists (%s) — nothing to do.", existing.email); return; }

  const admin = {
    id: uid("usr"), fullName: "Site Administrator", username: "admin", email: DEFAULT_ADMIN_EMAIL,
    phone: "+10000000000", country: "", role: "admin", passwordHash: sha256Hex(DEFAULT_ADMIN_PASSWORD),
    profilePic: "", bio: "", skills: "", rate: 0, rating: 0, completedJobs: 0, createdAt: nowMs(),
    verified: true, suspended: false, accessStatus: "active", accessRejectionReason: "",
    referralCode: generateReferralCode(readRows(SHEET_NAMES.USERS), "admin"), referredBy: "",
  };
  appendRow(SHEET_NAMES.USERS, admin);
  appendRow(SHEET_NAMES.WALLET, { userId: admin.id, balance: 0, escrow: 0 });
  Logger.log("Admin account created: %s / %s — sign in at admin-login.html, then change this password.", DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD);
}

/** SHA-256 hex digest, computed server-side with Apps Script's own crypto
    so it matches exactly what the browser computes with crypto.subtle in
    assets/js/auth.js (Auth.hash) — needed here only to seed the admin
    account's password without a browser involved. */
function sha256Hex(str) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map((b) => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}
