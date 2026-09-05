document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("jobs-grid");
  const form = document.getElementById("jobs-filter-form");
  const params = new URLSearchParams(window.location.search);
  if (params.get("category")) form.category.value = params.get("category");
  if (params.get("q")) form.q.value = params.get("q");

  async function load() {
    grid.innerHTML = `<div class="skeleton" style="height:180px;"></div><div class="skeleton" style="height:180px;"></div><div class="skeleton" style="height:180px;"></div>`;
    const res = await API.getJobs({ status: "open" });
    let jobs = res.jobs;
    const q = form.q.value.trim().toLowerCase();
    if (q) jobs = jobs.filter((j) => j.title.toLowerCase().includes(q) || j.description.toLowerCase().includes(q));
    if (form.category.value) jobs = jobs.filter((j) => j.category === form.category.value);
    if (form.sort.value === "budget-high") jobs.sort((a, b) => b.budget - a.budget);
    else if (form.sort.value === "budget-low") jobs.sort((a, b) => a.budget - b.budget);
    else jobs.sort((a, b) => b.createdAt - a.createdAt);

    if (!jobs.length) { grid.innerHTML = emptyState("🔍", "No jobs found", "Try adjusting your search or filters."); return; }
    const session = Auth.getSession();
    grid.innerHTML = jobs.map((j) => `
      <div class="glass glass-card job-card">
        <div class="flex-between"><h4 style="font-size:1.05rem;">${escapeHtml(j.title)}</h4></div>
        <span class="job-budget">${money(j.budget)}</span>
        <p class="body-md mt-2">${escapeHtml(j.description.slice(0, 120))}${j.description.length > 120 ? "…" : ""}</p>
        <div class="tag-row"><span class="tag">${escapeHtml(j.category)}</span></div>
        <div class="job-meta"><span>${escapeHtml(j.clientName)}</span><span>Due ${new Date(j.deadline).toLocaleDateString()}</span></div>
        ${session && session.user.role === "writer"
          ? `<button class="btn btn-primary btn-sm mt-3 w-full" data-quick-apply="${j.id}" data-title="${escapeHtml(j.title)}">Apply now</button>`
          : `<a href="${session ? "#" : "register.html?role=writer"}" class="btn btn-outline btn-sm mt-3 w-full" ${session ? 'data-need-writer="1"' : ""}>${session ? "Switch to a writer account to apply" : "Join as a writer to apply"}</a>`}
      </div>`).join("");

    grid.querySelectorAll("[data-quick-apply]").forEach((b) => b.addEventListener("click", () => {
      window.location.href = "writer-dashboard.html";
    }));
    grid.querySelectorAll("[data-need-writer]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); toast("This account is registered as a client. Sign in with a writer account to apply.", "info"); }));
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); load(); });
  load();
});
