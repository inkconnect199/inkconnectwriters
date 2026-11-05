document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let valid = true;
    ["name", "email", "message"].forEach((f) => {
      const field = form[f].closest(".field");
      const ok = f === "email" ? Validate.email(form[f].value) : Validate.required(form[f].value);
      if (!ok) { Validate.showError(field, "This field is required."); valid = false; } else Validate.clearError(field);
    });
    if (!valid) return;
    const session = Auth.getSession();
    await API.createTicket({ userId: session ? session.user.id : null, name: form.name.value, email: form.email.value, subject: "[Contact] " + form.topic.value, message: form.message.value });
    toast("Message sent — we'll get back to you soon.", "success");
    form.reset();
  });
});
