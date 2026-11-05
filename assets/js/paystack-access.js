const PaystackAccess = {
  storageKey(userId) { return `inkconnect_paystack_access_${userId}`; },

  async start(user) {
    if (!API_CONFIG.GAS_URL) return { ok: false, error: "Connect the deployed Apps Script backend before using Paystack." };
    if (typeof PaystackPop !== "function") return { ok: false, error: "Paystack checkout could not load. Check your internet connection and try again." };

    const initialized = await API.initializePaystackAccessPayment({ userId: user.id });
    if (!initialized.ok) return { ok: false, error: initialized.error };
    sessionStorage.setItem(this.storageKey(user.id), initialized.reference);

    return new Promise((resolve) => {
      let completed = false;
      const finish = (result) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const timeout = setTimeout(() => finish({
        ok: false,
        error: "Checkout is taking longer than expected. You can check the payment status from the pending page.",
        reference: initialized.reference,
      }), 5 * 60 * 1000);

      try {
        new PaystackPop().resumeTransaction(initialized.accessCode, {
          onSuccess: async (transaction) => {
            if (!transaction || transaction.reference !== initialized.reference) {
              finish({ ok: false, error: "Paystack returned a different transaction reference.", reference: initialized.reference });
              return;
            }
            let verified;
            try {
              verified = await API.verifyPaystackAccessPayment({ userId: user.id, reference: initialized.reference });
            } catch (error) {
              finish({ ok: false, error: "Payment completed, but verification could not reach the server. Check your payment status from the pending page.", reference: initialized.reference });
              return;
            }
            if (verified.ok) {
              sessionStorage.removeItem(this.storageKey(user.id));
              finish({ ok: true, user: verified.user, reference: initialized.reference });
            } else {
              finish({ ok: false, error: verified.error, reference: initialized.reference });
            }
          },
          onCancel: () => finish({
            ok: false, error: "Payment was cancelled. You can retry from the payment page.", reference: initialized.reference,
          }),
          onError: (error) => finish({
            ok: false, error: error.message || "Paystack checkout could not be opened.", reference: initialized.reference,
          }),
        });
      } catch (error) {
        finish({ ok: false, error: error.message || "Paystack checkout could not be opened.", reference: initialized.reference });
      }
    });
  },

  pendingReference(userId) {
    return sessionStorage.getItem(this.storageKey(userId)) || "";
  },

  async verifyPending(userId) {
    const reference = this.pendingReference(userId);
    if (!reference) return { ok: false, error: "There is no Paystack payment to check in this browser session." };
    const result = await API.verifyPaystackAccessPayment({ userId, reference });
    if (result.ok) sessionStorage.removeItem(this.storageKey(userId));
    return result;
  },
};
