document.addEventListener("DOMContentLoaded", async () => {
  let session = Auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return;
  }
  if (session.user.role === "admin") {
    window.location.href = "admin-dashboard.html";
    return;
  }
  if (Auth.needsOnboarding && !Auth.needsOnboarding(session.user)) {
    routeAfterOnboarding(session.user);
    return;
  }

  const statusEl = document.getElementById("onboarding-status");
  const profileFields = document.getElementById("onboarding-profile-fields");
  const preferenceFields = document.getElementById("onboarding-preference-fields");
  renderCommunityLinks().catch((error) => {
    console.error("Unable to load onboarding community links:", error);
    document.getElementById("onboarding-community-status").textContent = "Community links could not be loaded. Please refresh the page or contact support.";
    toast("Could not load community links. " + (error instanceof Error ? error.message : String(error)), "error");
  });
  const categories = ["Blog Writing", "SEO Content", "Copywriting", "Technical Writing", "Academic Writing", "Creative Writing", "Email Marketing", "Scriptwriting"];
  let user = session.user;
  let step = Math.min(4, Math.max(1, Number(user.onboardingStep) || 1));

  document.getElementById("onboarding-name").textContent = (user.fullName || "").split(" ")[0] || "there";
  renderRoleFields();
  hydrateFields();
  renderStep(step);

  const fresh = await API.getUser({ id: user.id });
  if (fresh.ok) {
    user = fresh.user;
    session = Auth.getSession();
    Auth.setSession(user, session.token, !!localStorage.getItem(SESSION_KEY));
    if (Auth.needsOnboarding && !Auth.needsOnboarding(user)) {
      routeAfterOnboarding(user);
      return;
    }
    step = Math.min(4, Math.max(1, Number(user.onboardingStep) || 1));
    hydrateFields();
    renderStep(step);
  } else {
    toast(fresh.error || "Could not load your saved onboarding details. You can still try again below.", "error");
  }

  document.querySelectorAll("[data-onboarding-next]").forEach((button) => {
    button.addEventListener("click", async () => {
      const next = Number(button.dataset.onboardingNext);
      if (step === 2 && !validateProfileFields()) return;
      if (step === 3 && !validatePreferenceFields()) return;
      const updates = step === 2 ? collectProfileFields() : step === 3 ? collectPreferenceFields() : {};
      if (!await saveProgress(Object.assign(updates, { onboardingStep: next }))) return;
      renderStep(next);
    });
  });
  document.querySelectorAll("[data-onboarding-skip]").forEach((button) => {
    button.addEventListener("click", async () => {
      const next = Number(button.dataset.onboardingSkip);
      const updates = step === 2 ? collectProfileFields() : step === 3 ? collectPreferenceFields() : {};
      if (!await saveProgress(Object.assign(updates, { onboardingStep: next }))) return;
      renderStep(next);
    });
  });
  document.querySelectorAll("[data-onboarding-back]").forEach((button) => {
    button.addEventListener("click", async () => {
      const previous = Number(button.dataset.onboardingBack);
      if (!await saveProgress({ onboardingStep: previous })) return;
      renderStep(previous);
    });
  });
  document.getElementById("onboarding-finish").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Saving...";
    if (!await saveProgress({ onboardingComplete: true, onboardingStep: 4 })) {
      button.disabled = false;
      button.textContent = "Finish setup";
      return;
    }
    button.textContent = "Done";
    toast("Your setup is complete.", "success");
    setTimeout(() => routeAfterOnboarding(user), 450);
  });
  document.querySelector("[data-onboarding-logout]").addEventListener("click", () => Auth.logout());

  function renderRoleFields() {
    if (user.role === "writer") {
      profileFields.innerHTML = `
        <h2 class="h-3">Build your writer profile</h2>
        <p class="muted mt-1 mb-3">A clear profile helps clients understand your experience. You can add or change details later.</p>
        <div class="field"><label for="onboarding-bio">Professional introduction</label><textarea id="onboarding-bio" maxlength="1200" placeholder="Describe your writing experience and the work you do."></textarea></div>
        <div class="field-row">
          <div class="field"><label for="onboarding-experience">Writing experience</label><select id="onboarding-experience"><option value="">Choose an experience range</option><option>Just starting</option><option>1-2 years</option><option>3-5 years</option><option>6-10 years</option><option>10+ years</option></select></div>
          <div class="field"><label for="onboarding-education">Education or relevant training</label><input id="onboarding-education" type="text" maxlength="160" placeholder="Optional"></div>
        </div>
        <div class="field"><label for="onboarding-portfolio">Portfolio links <span class="muted">(optional)</span></label><textarea id="onboarding-portfolio" placeholder="Add HTTPS links, one per line"></textarea><p class="method-note">Only share work you have permission to publish.</p></div>`;
      preferenceFields.innerHTML = `
        <h2 class="h-3">Choose your work preferences</h2>
        <p class="muted mt-1 mb-3">Select the writing work you want to be considered for.</p>
        ${renderCategoryOptions()}
        <div class="field-row mt-3">
          <div class="field"><label for="onboarding-rate">Starting hourly rate (USD)</label><input id="onboarding-rate" type="number" min="1" max="10000" step="1" placeholder="e.g. 20"></div>
          <div class="field"><label for="onboarding-availability">Availability</label><select id="onboarding-availability"><option value="Available">Available</option><option value="Limited">Limited availability</option><option value="Unavailable">Not available right now</option></select></div>
        </div>
        <div class="field"><label for="onboarding-languages">Languages</label><input id="onboarding-languages" type="text" maxlength="160" placeholder="e.g. English, Swahili"></div>`;
    } else {
      profileFields.innerHTML = `
        <h2 class="h-3">Tell us about your business or project</h2>
        <p class="muted mt-1 mb-3">A little context helps writers understand who you are and what you’re working on.</p>
        <div class="field"><label for="onboarding-organization">Company or organization <span class="muted">(optional)</span></label><input id="onboarding-organization" type="text" maxlength="120" placeholder="Company or organization name"></div>
        <div class="field"><label for="onboarding-bio">Company or project overview</label><textarea id="onboarding-bio" maxlength="1200" placeholder="What does your organization do, or what are you looking to create?"></textarea></div>`;
      preferenceFields.innerHTML = `
        <h2 class="h-3">Set your writing preferences</h2>
        <p class="muted mt-1 mb-3">Choose the services you may need. You can still browse all available writers and jobs.</p>
        ${renderCategoryOptions()}
        <div class="field mt-3"><label for="onboarding-budget">Typical project budget</label><select id="onboarding-budget"><option value="">Choose an optional budget range</option><option>Under $100</option><option>$100-$500</option><option>$501-$2,000</option><option>Over $2,000</option><option>Not sure yet</option></select></div>`;
    }
  }

  async function renderCommunityLinks() {
    const result = await API.getSiteSettings();
    if (!result.ok) throw new Error(result.error || "Site settings request failed.");
    const config = result.settings || SITE_CONFIG;
    const links = [
      { url: config.COMMUNITY_WHATSAPP_LINK, label: "Open WhatsApp community", mark: "☎", color: "#25D366" },
      { url: config.COMMUNITY_FACEBOOK_LINK, label: "Open Facebook community", mark: "f", color: "#1877F2" },
      { url: config.COMMUNITY_TIKTOK_LINK, label: "Open TikTok community", mark: "♪", color: "#111111" },
    ];
    const container = document.getElementById("onboarding-community-links");
    const status = document.getElementById("onboarding-community-status");
    let displayedCount = 0;
    links.forEach(({ url, label, mark, color }) => {
      if (!url) return;
      if (!Validate.httpsUrl(String(url).trim())) {
        console.warn(`Skipping invalid configured community URL for ${label}.`);
        return;
      }
      const link = document.createElement("a");
      link.className = "btn btn-sm";
      link.href = String(url).trim();
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", label);
      link.style.backgroundColor = color;
      link.style.borderColor = color;
      link.style.color = "#ffffff";
      link.textContent = `${mark} ${label}`;
      container.appendChild(link);
      displayedCount += 1;
    });
    status.textContent = displayedCount
      ? "Choose a platform to open its InkConnect community."
      : "No community links are configured yet. Add them in Admin Dashboard → Site Settings.";
  }

  function renderCategoryOptions() {
    return `<fieldset class="field" style="border:0;padding:0;margin:0;">
      <legend class="mb-2">${user.role === "writer" ? "Writing skills and services" : "Writing services you may need"} <span class="muted">(optional)</span></legend>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;">
        ${categories.map((category) => `<label class="checkbox-row"><input type="checkbox" name="onboarding-category" value="${escapeHtml(category)}"> ${escapeHtml(category)}</label>`).join("")}
      </div>
    </fieldset>`;
  }

  function hydrateFields() {
    setValue("onboarding-bio", user.bio || "");
    setValue("onboarding-experience", user.experience || "");
    setValue("onboarding-education", user.education || "");
    setValue("onboarding-portfolio", listValue(user.portfolio).join("\n"));
    setValue("onboarding-rate", user.rate || "");
    setValue("onboarding-availability", user.availability || "Available");
    setValue("onboarding-languages", listValue(user.languages).join(", "));
    setValue("onboarding-organization", user.organization || "");
    setValue("onboarding-budget", user.preferredBudget || "");
    const selected = new Set(listValue(user.skills));
    document.querySelectorAll('input[name="onboarding-category"]').forEach((input) => { input.checked = selected.has(input.value); });
    document.getElementById("onboarding-name").textContent = (user.fullName || "").split(" ")[0] || "there";
    updateReview();
  }

  function collectProfileFields() {
    const updates = { bio: value("onboarding-bio") };
    if (user.role === "writer") {
      updates.experience = value("onboarding-experience");
      updates.education = value("onboarding-education");
      updates.portfolio = value("onboarding-portfolio").split(/\r?\n/).map((link) => link.trim()).filter(Boolean);
    } else {
      updates.organization = value("onboarding-organization");
    }
    return updates;
  }

  function collectPreferenceFields() {
    const updates = { skills: [...document.querySelectorAll('input[name="onboarding-category"]:checked')].map((input) => input.value) };
    if (user.role === "writer") {
      const rate = value("onboarding-rate");
      updates.rate = rate ? Number(rate) : 0;
      updates.availability = value("onboarding-availability");
      updates.languages = value("onboarding-languages").split(",").map((language) => language.trim()).filter(Boolean);
    } else {
      updates.preferredBudget = value("onboarding-budget");
    }
    return updates;
  }

  function validateProfileFields() {
    if (user.role !== "writer") return true;
    const links = value("onboarding-portfolio").split(/\r?\n/).map((link) => link.trim()).filter(Boolean);
    if (links.some((link) => !Validate.httpsUrl(link))) {
      toast("Portfolio links must be valid HTTPS URLs, one per line.", "error");
      return false;
    }
    return true;
  }

  function validatePreferenceFields() {
    if (user.role !== "writer") return true;
    const rate = value("onboarding-rate");
    if (rate && (!Number.isFinite(Number(rate)) || Number(rate) < 1 || Number(rate) > 10000)) {
      toast("Enter an hourly rate between $1 and $10,000, or leave it blank.", "error");
      return false;
    }
    return true;
  }

  async function saveProgress(updates) {
    statusEl.textContent = "";
    const button = document.activeElement;
    if (button && button.matches("button")) button.disabled = true;
    const result = await API.updateProfile({ id: user.id, updates });
    if (button && button.matches("button")) button.disabled = false;
    if (!result.ok) {
      statusEl.textContent = result.error || "Could not save your onboarding progress. Please try again.";
      statusEl.className = "mt-3 field-error";
      toast(result.error || "Could not save your onboarding progress.", "error");
      return false;
    }
    user = result.user;
    const current = Auth.getSession();
    Auth.setSession(user, current.token, !!localStorage.getItem(SESSION_KEY));
    statusEl.textContent = "Progress saved.";
    statusEl.className = "mt-3 muted";
    updateReview();
    return true;
  }

  function renderStep(target) {
    step = target;
    const stepNames = ["Welcome", "Profile", "Skills & preferences", "Review"];
    document.querySelectorAll("[data-onboarding-step]").forEach((section) => {
      section.style.display = Number(section.dataset.onboardingStep) === step ? "" : "none";
    });
    document.getElementById("onboarding-step-label").textContent = `Step ${step} of 4: ${stepNames[step - 1]}`;
    document.getElementById("onboarding-progress").innerHTML = [1, 2, 3, 4].map((number) =>
      `<span class="tag" aria-current="${number === step ? "step" : "false"}" style="flex:1;text-align:center;opacity:${number <= step ? 1 : .45};">0${number} · ${escapeHtml(stepNames[number - 1])}</span>`
    ).join("");
    if (step === 4) updateReview();
  }

  function updateReview() {
    const active = user.accessStatus === "active" || !roleNeedsAccessFee(user.role);
    const status = user.accessStatus || "unpaid";
    document.getElementById("onboarding-access-summary").textContent = active
      ? "Your account is active. You can continue to your dashboard when setup is finished."
      : status === "pending"
        ? "Your access-fee payment is awaiting review. You can complete your profile while the team reviews it; dashboard access unlocks after approval."
        : status === "rejected"
          ? "Your access-fee payment was not approved. Review the reason on the account review page and follow its instructions before dashboard access."
          : "A one-time access fee is required for your account. Complete or check payment on the account review page; dashboard access is available after approval.";
    const paymentReview = document.getElementById("onboarding-review-payment");
    paymentReview.style.display = active ? "none" : "block";

    const profileComplete = user.role === "writer"
      ? Boolean(String(user.bio || "").trim() && String(user.experience || "").trim())
      : Boolean(String(user.organization || "").trim() || String(user.bio || "").trim());
    const preferencesComplete = listValue(user.skills).length > 0 &&
      (user.role === "writer" ? Number(user.rate) > 0 : Boolean(String(user.preferredBudget || "").trim()));
    const checklist = [
      [true, "Account created"],
      [profileComplete, user.role === "writer" ? "Writer profile introduction and experience" : "Business or project profile"],
      [preferencesComplete, user.role === "writer" ? "Work preferences and starting rate" : "Writing needs and budget preference"],
      [active, active ? "Account access approved" : "Account access review"],
    ];
    document.getElementById("onboarding-checklist").innerHTML = checklist.map(([done, label]) =>
      `<li>${done ? "✓" : "○"} ${escapeHtml(label)}${done ? "" : " — optional, you can finish this later"}</li>`
    ).join("");
  }

  function setValue(id, nextValue) {
    const field = document.getElementById(id);
    if (field) field.value = nextValue;
  }
  function value(id) { return document.getElementById(id)?.value.trim() || ""; }
  function listValue(input) {
    if (Array.isArray(input)) return input.map(String).map((item) => item.trim()).filter(Boolean);
    return String(input || "").split(",").map((item) => item.trim()).filter(Boolean);
  }
});

function routeAfterOnboarding(user) {
  if (roleNeedsAccessFee(user.role) && user.accessStatus !== "active") {
    window.location.href = "registration-pending.html";
    return;
  }
  window.location.href = user.role === "writer" ? "writer-dashboard.html" : "client-dashboard.html";
}
