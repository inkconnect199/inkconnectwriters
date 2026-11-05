# InkConnect — Google Apps Script Backend Setup

The frontend works instantly with **zero setup** using a local demo
database (localStorage). Follow this guide only when you're ready to
wire it up to a real Google Sheet.

## Quick start

1. Open the Google Sheet you want to use as InkConnect's database.
2. From the sheet menu, choose **Extensions → Apps Script**. Replace
   the default `Code.gs` contents with `backend/Code.gs` and click Save.
3. Return to the spreadsheet and reload it. Choose
   **InkConnect → 1. Setup / update sheets** and approve the Google
   permissions prompt. A dialog reports which tabs and columns were
   created or updated. Existing data is not deleted.
4. Choose **InkConnect → 2. Check setup** to verify the sheets and
   required columns.
5. Choose **InkConnect → 3. Create admin account** to create the first
   admin login: **`admin@inkconnect.com`** / **`Admin@123`**. Change
   this temporary password immediately after signing in.

The setup, diagnostic, and admin functions are also available in the
Apps Script editor's Run menu. For a standalone script, see the
troubleshooting instructions below.

Do not deploy the current backend as a public web app with real account
or payment data until server-side authentication and permission checks
are in place. Once secured and tested, set the deployed `/exec` URL in
`assets/js/api.js`:
   ```js
   const API_CONFIG = { GAS_URL: "https://script.google.com/macros/s/XXXXXXXX/exec" };
   ```

## If Apps Script says there is no spreadsheet

The recommended setup is a script bound to the spreadsheet: open the
sheet, then use **Extensions → Apps Script**. If using a standalone
Apps Script project, open **Project Settings → Script Properties**, add
`SPREADSHEET_ID`, and set it to the ID in the sheet URL (between `/d/`
and `/edit`). Run `setupSheets` again and authorize access.

## 1. Create the spreadsheet

1. Open the Google Sheet you created — this will be your database.
2. Open **Extensions → Apps Script** from that sheet.
3. Replace the default `Code.gs` content and paste in the contents of
   `backend/Code.gs` from this project.

## 2. Create the sheet tabs

Reload the spreadsheet and choose **InkConnect → 1. Setup / update
sheets**. The first run asks for authorization — approve it. This
creates the required tabs with the correct column headers:

`Users, Jobs, Applications, Messages, Payments, Wallet, Notifications, Reviews, SupportTickets, Settings, AccessRequests`

## 2b. Create your first admin login

Choose **InkConnect → 3. Create admin account** in the spreadsheet.
Alternatively, run **`seedAdminAccount`** from the Apps Script editor.
This adds one row to the `Users` tab with role `admin` and
password `Admin@123` (hashed the same way the browser hashes it, so it
logs in correctly on the first try). Sign in at `admin-login.html`,
then change the password from Admin Dashboard → Settings.

Safe to run again later — it does nothing if an admin already exists.
If you'd rather set a specific email/password from the start, open
`seedAdminAccount()` in `Code.gs` and edit `DEFAULT_ADMIN_EMAIL` /
`DEFAULT_ADMIN_PASSWORD` before running it.

## 3. Web app deployment

Do not deploy the current backend as a public Web App for real account or
payment data. `doPost` does not yet authenticate and authorize every
request, so a publicly accessible deployment could expose or modify
Sheet data. Deploy only after adding and testing server-side
authentication and authorization. For local demo use, leave `GAS_URL`
empty; the frontend uses browser `localStorage`.

## 4. Connect the frontend

After securing and deploying the backend, open `assets/js/api.js` and set:

```js
const API_CONFIG = {
  GAS_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
};
```

Reload the site — every page now reads and writes through your Google
Sheet instead of the local demo database. No other frontend code needs
to change, since `LocalAPI` and the real Apps Script backend both
implement the exact same action contract (`register`, `login`,
`postJob`, `getJobs`, `applyJob`, `sendMessage`, `deposit`, `withdraw`,
etc.).

## 5. Notes on scaling to MySQL later

Because every frontend call goes through the single `API` object in
`assets/js/api.js`, migrating from Google Sheets to MySQL later only
requires replacing the Apps Script backend (or swapping it for a small
Node/PHP API) that implements the same action names and response
shapes (`{ ok: true, ... }` / `{ ok: false, error: "..." }`). No page
HTML/CSS/JS needs to change.

## 6. Security notes

- Passwords are SHA-256 hashed in the browser before they're ever sent
  to the backend (`assets/js/auth.js` → `Auth.hash`). The backend only
  ever stores and compares hashes.
- Do not use the backend with real user or payment data until it checks
  authentication and authorization on the server for every action.
  A secret embedded in frontend JavaScript is public and does not
  protect the backend.
- Admin accounts are seeded manually — there is no public admin
  registration form, matching the "Admin Registration (manual only)"
  requirement. Add admin rows directly to the `Users` tab in Sheets
  (with `role = admin`) once your Sheet is live.

## 7. Paystack access-fee checkout

The registration and pending-payment pages can offer Paystack's secure
inline checkout for the one-time access fee. Customers pay in KES using
the channels enabled for your Paystack account. InkConnect initializes
and verifies every transaction on Apps Script; a successful, amount-
matched payment activates the account and awards any referral bonus.

1. Create or sign in to a [Paystack account](https://dashboard.paystack.com/)
   and get a **test secret key** from **Settings → API Keys & Webhooks**.
   Paystack's [supported currencies](https://paystack.com/docs/api/#supported-currency)
   include KES for Kenya.
2. In the linked Google Apps Script project, open **Project Settings →
   Script Properties** and add `PAYSTACK_SECRET_KEY` with your test
   secret key. Never put a secret key in frontend code or share it publicly.
3. Run **`setupSheets`** again from the Apps Script editor. This safely
   adds the `expectedAmountKobo` column to an existing `AccessRequests`
   tab; existing rows are preserved.
4. Deploy the Apps Script project as a **new Web App version** and confirm
   its `/exec` URL is set as `GAS_URL` in `assets/js/api.js`. The Paystack
   option only appears when the site uses this backend.
5. Test a new signup using Paystack's test keys and test payment details.
   Check the Paystack dashboard and the `AccessRequests` / `Payments`
   tabs. Only switch the Script Property to a live secret key after
   verifying the full flow.

Paystack's [InlineJS documentation](https://paystack.com/docs/developer-tools/inlinejs/)
describes the checkout popup. InkConnect does not trust the browser's
success callback: Apps Script independently verifies the reference,
account email, KES currency, and exact configured amount before activation.
Manual M-Pesa, PayPal, and bank-transfer proof submission remains available.

## 8. Connecting M-Pesa and PayPal (deposits & withdrawals)

The wallet already has a full M-Pesa / PayPal / bank-transfer method
picker on both the client's **Deposit** form and the writer's
**Withdraw** form. Out of the box (no credentials configured) every
method completes as a simulated instant success, so you can test the
entire flow today. Add real credentials to switch specific methods
over to live payments — you don't need to configure all of them.

### M-Pesa (Safaricom Daraja API)

1. Create an app at [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
   to get sandbox `Consumer Key` / `Consumer Secret`, and go live later
   for production keys.
2. In Apps Script: **Project Settings → Script Properties**, add:
   - `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`
   - `MPESA_SHORTCODE` (Paybill/Till number — `174379` for the Daraja sandbox)
   - `MPESA_PASSKEY` (from the Daraja portal's STK Push simulator page)
   - `MPESA_ENV` = `sandbox` or `production`
3. This enables **deposits via STK Push** immediately — a real prompt
   is sent to the phone number entered in the wallet form.
4. **Withdrawals (B2C payouts)** additionally need `MPESA_INITIATOR_NAME`
   and `MPESA_SECURITY_CREDENTIAL` (the initiator password encrypted
   with Safaricom's public certificate — see Daraja's B2C docs). Without
   these, M-Pesa withdrawals return a clear error rather than failing
   silently.
5. STK Push is asynchronous in real life (the customer must enter their
   PIN, then Safaricom calls back to this same Web App URL). This
   reference implementation credits the wallet optimistically when the
   push is sent, and reverses it if `handleMpesaCallback` in `Code.gs`
   receives a failure/cancellation. For stricter accounting, change
   `Actions.deposit` to only credit the wallet from inside that callback.

### PayPal

1. Create an app at [developer.paypal.com](https://developer.paypal.com)
   to get a `Client ID` / `Client Secret` (sandbox first, then live).
2. Add Script Properties: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
   `PAYPAL_ENV` = `sandbox` or `production`.
3. This enables **withdrawals via the PayPal Payouts API** immediately
   — funds are sent to the PayPal email entered in the wallet form.
4. **Deposits via PayPal** need the PayPal JS SDK's browser-side
   checkout approval flow (the client must approve the charge on
   PayPal's own page), which doesn't fit a single Apps Script call.
   `Code.gs` has a documented extension point in `Actions.deposit`
   where you can call the Orders API's `/v2/checkout/orders` (create)
   from the frontend, then `POST` the resulting order ID to a new
   `capturePaypalOrder` action here to finalize and credit the wallet.

### Bank / Other account

Bank transfers are inherently manual/asynchronous (no public instant
API), so both deposits and withdrawals via this method always record
a reference and rely on manual confirmation — check `SupportTickets`
or the `Payments` sheet periodically, or extend `Actions.deposit` /
`Actions.withdraw` to call your own banking partner's API.
After updating `Code.gs`, run `setupSheets()` once to add the
`bankName` and `bankBranch` columns used to record bank payout requests.

## 9. Client access-fee gate & job approval flow

Two moderation features are on by default — both fully editable from
one place:

- **`assets/js/api.js`** → `SITE_CONFIG` (frontend/local demo mode)
- **`backend/Code.gs`** → `SITE_CONFIG` (live Google Sheets mode)

```js
const SITE_CONFIG = {
  ACCESS_FEE_KES: 500,                       // fee amount shown to clients
  ACCESS_FEE_USD: 5,
  COMPANY_MPESA_NUMBER: "0106012195",        // where the fee gets sent
  COMPANY_PAYPAL_EMAIL: "inkconnect.payments@gmail.com",
  COMPANY_BANK_NAME: "",
  COMPANY_BANK_ACCOUNT_NAME: "",
  COMPANY_BANK_ACCOUNT_NUMBER: "",
  COMPANY_BANK_BRANCH: "",
  COMMUNITY_WHATSAPP_LINK: "",
  COMMUNITY_FACEBOOK_LINK: "",
  COMMUNITY_TIKTOK_LINK: "",
  COMPANY_NAME: "InkConnect",
  REQUIRE_CLIENT_ACCESS_FEE: true,           // set false to skip the gate for clients
  REQUIRE_WRITER_ACCESS_FEE: true,           // set false to skip the gate for writers
  REQUIRE_ADMIN_JOB_APPROVAL: true,          // set false to auto-publish jobs
};
```

Bank account details and the WhatsApp, Facebook, and TikTok community links
can also be updated by an admin from **Site Settings → Client access-fee
payment details**. After a member signs in, they land on the community page;
configured social links appear there.

**How it works — for both clients and writers:**

1. A new client or writer account starts with `accessStatus: "unpaid"`
   (each role's requirement is controlled independently by its own
   `REQUIRE_*_ACCESS_FEE` flag above). The payment fields — M-Pesa,
   PayPal, or bank/other, plus a box to paste the transaction
   confirmation message — are built directly into the registration
   form and submitted together with the account details in one step.
2. On submit they land on the standalone **`registration-pending.html`**
   page (not an overlay on the dashboard) showing "Registration under
   review." This page polls automatically every few seconds — no
   manual refresh needed — and redirects to the right dashboard the
   moment an admin approves. A "Check approval status now" button is
   also there for an immediate manual check. Trying to open
   `client-dashboard.html` / `writer-dashboard.html` directly while
   still pending bounces back to this review page.
3. In the **Admin Dashboard → Access Requests**, the admin sees the
   applicant's name, role, chosen method, and the exact transaction
   message they pasted, and can **Approve** (unlocks their dashboard —
   picked up automatically by that person's polling) or **Reject**
   (with a reason shown back to them, and an option to resubmit).
4. Separately, when a client posts a job it's created with
   `status: "pending_review"` and is **not** visible to writers yet.
   It shows up in **Admin Dashboard → Job Approvals**, where the admin
   can **Approve & publish** (status becomes `"open"`, now visible in
   Find Jobs / the writer dashboard) or **Reject** with a reason.

Both flows are pure moderation gates on top of the same underlying
data — turning either `REQUIRE_*` flag off makes that step disappear
without touching any other code.

## 10. Troubleshooting: "I can't approve a client/writer"

This almost always means your Google Sheet was set up (via
`setupSheets()`) **before** a newer column or tab existed — most
commonly the `accessStatus` column on `Users`, or the whole
`AccessRequests` tab. When that happens, clicking Approve looks like
it works (no error) but the account never actually unlocks, because
the code tries to write to a column that isn't there yet and silently
skips it.

**Fix — run these from the spreadsheet's InkConnect menu:**

1. Choose **InkConnect → 1. Setup / update sheets**. This is safe to run
   repeatedly; it never deletes or overwrites existing data. It creates
   missing tabs and adds missing columns.
2. Choose **InkConnect → 2. Check setup**. The dialog reports whether
   the required sheets and columns exist, whether an admin account
   exists, and how many access requests are pending.

If `diagnoseSetup()` shows everything green and approval still doesn't
work, check that `assets/js/api.js` → `API_CONFIG.GAS_URL` actually
points at your deployed `/exec` URL (not left blank, which silently
falls back to the local demo database instead of your real Sheet).

### Editing the payment details without touching code

The access-fee amount, company M-Pesa number, and company PayPal email
shown to clients are also editable live from **Admin Dashboard → Site
Settings → Client access-fee payment details**. This writes to the
`Settings` sheet (as simple `key`/`value` rows) and overrides the
`SITE_CONFIG` code defaults immediately — every page that shows this
info (`register.html`, `registration-pending.html`) reads through
`getEffectiveSiteConfig()` in `assets/js/api.js`, so no redeploy is
needed after an admin changes it.

### Admin sign-in is separate from the public login page

Admins sign in at **`admin-login.html`**, a page that isn't linked
anywhere in the public navigation — only someone who already knows the
URL (and has admin credentials) can reach it. The public `login.html`
form intentionally rejects admin accounts and points them to
`admin-login.html` instead, so there's a clean separation between
"customer" and "staff" sign-in.

### Reviewing every client ↔ writer message

**Admin Dashboard → Manage Messages** lists every conversation on the
platform (not just a summary) — click a thread to read the full
back-and-forth, with each message labeled by sender name and role.
This is read-only by design; it's for moderation and dispute
resolution, not for the admin to post as a participant.
