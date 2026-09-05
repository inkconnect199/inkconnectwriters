document.addEventListener("DOMContentLoaded", () => {
  const settingsForm = document.getElementById("site-settings-form");
  if (settingsForm) settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    localStorage.setItem("inkconnect_site_settings", JSON.stringify({ siteName: settingsForm.siteName.value, commission: settingsForm.commission.value }));
    toast("Site settings saved", "success");
  });

  const annForm = document.getElementById("announcement-form");
  if (annForm) annForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = annForm.text.value.trim();
    if (!text) return toast("Write an announcement first", "error");
    const submitBtn = annForm.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Publishing...";
    const res = await API.broadcastAnnouncement({ text });
    submitBtn.disabled = false; submitBtn.textContent = "Publish announcement";
    if (res.ok) {
      toast(`Announcement sent to ${res.recipientCount} user${res.recipientCount === 1 ? "" : "s"}`, "success");
      annForm.reset();
    } else {
      toast(res.error, "error");
    }
  });

  // Client access-fee payment details (M-Pesa / PayPal) — editable here
  // instead of in code. Pre-fill with current effective values whenever
  // the Site Settings section is opened.
  const paymentForm = document.getElementById("payment-settings-form");
  if (paymentForm) {
    document.querySelector('[data-section-link="site-settings"]')?.addEventListener("click", async () => {
      const c = await getEffectiveSiteConfig(true);
      paymentForm.ACCESS_FEE_KES.value = c.ACCESS_FEE_KES;
      paymentForm.ACCESS_FEE_USD.value = c.ACCESS_FEE_USD;
      paymentForm.COMPANY_MPESA_NUMBER.value = c.COMPANY_MPESA_NUMBER;
      paymentForm.COMPANY_PAYPAL_EMAIL.value = c.COMPANY_PAYPAL_EMAIL;
    });

    paymentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const updates = {
        ACCESS_FEE_KES: Number(paymentForm.ACCESS_FEE_KES.value),
        ACCESS_FEE_USD: Number(paymentForm.ACCESS_FEE_USD.value),
        COMPANY_MPESA_NUMBER: paymentForm.COMPANY_MPESA_NUMBER.value.trim(),
        COMPANY_PAYPAL_EMAIL: paymentForm.COMPANY_PAYPAL_EMAIL.value.trim(),
      };
      if (!Validate.email(updates.COMPANY_PAYPAL_EMAIL)) return toast("Enter a valid PayPal email.", "error");
      const res = await API.updateSiteSettings({ updates });
      if (res.ok) { await getEffectiveSiteConfig(true); toast("Payment details updated — live immediately.", "success"); }
      else toast(res.error, "error");
    });
  }

  // Referral bonus + max withdrawal cap — same pattern as the payment
  // details form above: pre-fill on open, save through updateSiteSettings.
  const referralForm = document.getElementById("referral-settings-form");
  if (referralForm) {
    document.querySelector('[data-section-link="site-settings"]')?.addEventListener("click", async () => {
      const c = await getEffectiveSiteConfig(true);
      referralForm.REFERRAL_BONUS_KES.value = c.REFERRAL_BONUS_KES;
      referralForm.REFERRAL_BONUS_USD.value = c.REFERRAL_BONUS_USD;
      referralForm.MAX_WITHDRAWAL_USD.value = c.MAX_WITHDRAWAL_USD;
    });

    referralForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const updates = {
        REFERRAL_BONUS_KES: Number(referralForm.REFERRAL_BONUS_KES.value),
        REFERRAL_BONUS_USD: Number(referralForm.REFERRAL_BONUS_USD.value),
        MAX_WITHDRAWAL_USD: Number(referralForm.MAX_WITHDRAWAL_USD.value),
      };
      const res = await API.updateSiteSettings({ updates });
      if (res.ok) { await getEffectiveSiteConfig(true); toast("Referral and withdrawal settings updated.", "success"); }
      else toast(res.error, "error");
    });
  }
});
