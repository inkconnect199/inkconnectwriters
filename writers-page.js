document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("writers-grid");
  const form = document.getElementById("writers-filter-form");

  async function load() {
    grid.innerHTML = `<div class="skeleton" style="height:180px;"></div><div class="skeleton" style="height:180px;"></div><div class="skeleton" style="height:180px;"></div>`;
    const res = await API.getWriters();
    let writers = res.writers;
    const q = form.q.value.trim().toLowerCase();
    if (q) writers = writers.filter((w) => w.fullName.toLowerCase().includes(q) || (w.skills || []).some((s) => s.toLowerCase().includes(q)));
    if (form.skill.value) writers = writers.filter((w) => (w.skills || []).includes(form.skill.value));
    if (form.sort.value === "rate-low") writers.sort((a, b) => a.rate - b.rate);
    else if (form.sort.value === "rate-high") writers.sort((a, b) => b.rate - a.rate);
    else writers.sort((a, b) => b.rating - a.rating);

    if (!writers.length) { grid.innerHTML = emptyState("🔍", "No writers found", "Try a different search or skill filter."); return; }
    const session = Auth.getSession();
    grid.innerHTML = writers.map((w) => `
      <div class="glass glass-card writer-card">
        <div class="writer-top"><div class="avatar">${initials(w.fullName)}</div>
          <div><div class="writer-name">${escapeHtml(w.fullName)}</div><div class="writer-role">${escapeHtml(w.country)} • ${money(w.rate)}/hr</div></div>
        </div>
        <div class="rating mt-2">★ ${w.rating.toFixed(1)} <span class="muted" style="font-family:var(--font-body);">(${w.completedJobs} jobs)</span></div>
        <p class="body-md mt-2" style="font-size:.88rem;">${escapeHtml(w.bio || "")}</p>
        <div class="tag-row">${(w.skills || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}</div>
        ${session && session.user.role === "client"
          ? `<a href="client-dashboard.html" class="btn btn-primary btn-sm mt-3 w-full">Post a job for ${w.fullName.split(" ")[0]}</a>`
          : `<a href="${session ? "#" : "register.html?role=client"}" class="btn btn-outline btn-sm mt-3 w-full">${session ? "Sign in as a client to hire" : "Join as a client to hire"}</a>`}
      </div>`).join("");
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); load(); });
  load();
});
