/* ============================================================
   INKCONNECT — HOME PAGE
   ============================================================ */

const CATEGORY_ICONS = {
  "Blog Writing": "✍️", "SEO Content": "🔍", "Copywriting": "🧲", "Technical Writing": "🛠️",
  "Academic Writing": "🎓", "Creative Writing": "🎭", "Email Marketing": "✉️", "Scriptwriting": "🎬",
};

document.addEventListener("DOMContentLoaded", async () => {
  animateCounters();
  wireHeroSearch();

  const grid = document.getElementById("category-grid");
  if (grid) {
    const categories = Object.keys(CATEGORY_ICONS);
    grid.innerHTML = categories.map((c) => `
      <a href="jobs.html?category=${encodeURIComponent(c)}" class="glass glass-card category-card reveal in-view">
        <div class="cat-icon" style="font-size:1.3rem;">${CATEGORY_ICONS[c]}</div>
        <h4>${c}</h4><p>Explore ${c.toLowerCase()} jobs</p>
      </a>`).join("");
  }

  const writersEl = document.getElementById("featured-writers");
  if (writersEl) {
    const res = await API.getWriters();
    const featured = res.writers.sort((a, b) => b.rating - a.rating).slice(0, 3);
    writersEl.innerHTML = featured.map((w) => `
      <a href="writers.html" class="glass glass-card writer-card reveal in-view">
        <div class="writer-top"><div class="avatar">${initials(w.fullName)}</div>
          <div><div class="writer-name">${escapeHtml(w.fullName)}</div><div class="writer-role">${escapeHtml(w.country)}</div></div>
        </div>
        <div class="rating mt-2">★ ${w.rating.toFixed(1)} <span class="muted" style="font-family:var(--font-body);">(${w.completedJobs} jobs)</span></div>
        <div class="tag-row">${(w.skills || []).slice(0, 3).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}</div>
      </a>`).join("");
  }

  const jobsEl = document.getElementById("latest-jobs");
  if (jobsEl) {
    const res = await API.getJobs({ status: "open" });
    const jobs = res.jobs.slice(0, 3);
    jobsEl.innerHTML = jobs.length ? jobs.map((j) => `
      <a href="jobs.html" class="glass glass-card job-card reveal in-view">
        <div class="flex-between"><h4 style="font-size:1rem;">${escapeHtml(j.title)}</h4></div>
        <span class="job-budget">${money(j.budget)}</span>
        <div class="tag-row"><span class="tag">${escapeHtml(j.category)}</span></div>
        <div class="job-meta"><span>${escapeHtml(j.clientName)}</span><span>${timeAgo(j.createdAt)}</span></div>
      </a>`).join("") : emptyState("📄", "No open jobs yet", "");
  }
});

function animateCounters() {
  document.querySelectorAll("[data-counter]").forEach((el) => {
    const target = Number(el.dataset.counter);
    const prefix = el.dataset.prefix || "";
    const duration = 1600;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = prefix + Math.floor(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { requestAnimationFrame(tick); io.unobserve(el); } });
    }, { threshold: 0.5 });
    io.observe(el);
  });
}

function wireHeroSearch() {
  const form = document.getElementById("hero-search-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("hero-search-input").value.trim();
    window.location.href = "jobs.html" + (q ? `?q=${encodeURIComponent(q)}` : "");
  });
}
