const FAQS = [
  { q: "How does escrow payment work?", a: "When a client accepts a writer, the job budget is set aside. Once the writer submits work and the client releases payment, funds move instantly from the client's wallet to the writer's wallet." },
  { q: "How do I withdraw my earnings as a writer?", a: "Go to your Writer Dashboard → Wallet → Withdraw, enter an amount up to your available balance, and submit the request." },
  { q: "Can I switch between being a client and a writer?", a: "Each account has one role at signup. If you need both, create two separate accounts with different emails." },
  { q: "What happens if a writer misses a deadline?", a: "Clients can message the writer directly from the Applicants or Active Jobs section to discuss timelines, or decline to release payment until work is delivered satisfactorily." },
  { q: "Is my password stored securely?", a: "Yes — passwords are hashed with SHA-256 before they ever leave your browser, and the backend never stores or transmits plain text passwords." },
];

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("faq-list");
  list.innerHTML = FAQS.map((f, i) => `
    <div class="glass mb-2" style="padding:0;overflow:hidden;">
      <button class="faq-toggle flex-between" data-faq="${i}" style="width:100%;padding:18px 20px;background:none;border:none;cursor:pointer;text-align:left;font-family:var(--font-body);color:var(--text-0);font-weight:600;font-size:.95rem;">
        <span>${escapeHtml(f.q)}</span><span class="faq-icon">＋</span>
      </button>
      <div class="faq-answer" id="faq-answer-${i}" style="max-height:0;overflow:hidden;transition:max-height .3s var(--ease-out);">
        <p class="body-md" style="padding:0 20px 18px;">${escapeHtml(f.a)}</p>
      </div>
    </div>`).join("");

  list.querySelectorAll(".faq-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const answer = document.getElementById("faq-answer-" + btn.dataset.faq);
      const icon = btn.querySelector(".faq-icon");
      const isOpen = answer.style.maxHeight && answer.style.maxHeight !== "0px";
      list.querySelectorAll(".faq-answer").forEach((a) => (a.style.maxHeight = "0px"));
      list.querySelectorAll(".faq-icon").forEach((ic) => (ic.textContent = "＋"));
      if (!isOpen) { answer.style.maxHeight = answer.scrollHeight + "px"; icon.textContent = "－"; }
    });
  });

  const form = document.getElementById("ticket-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let valid = true;
    ["name", "email", "subject", "message"].forEach((f) => {
      const field = form[f].closest(".field");
      const ok = f === "email" ? Validate.email(form[f].value) : Validate.required(form[f].value);
      if (!ok) { Validate.showError(field, "This field is required."); valid = false; } else Validate.clearError(field);
    });
    if (!valid) return;
    const session = Auth.getSession();
    const res = await API.createTicket({ userId: session ? session.user.id : null, name: form.name.value, email: form.email.value, subject: form.subject.value, message: form.message.value });
    if (res.ok) { toast("Support ticket submitted — we'll be in touch soon.", "success"); form.reset(); }
  });
});
