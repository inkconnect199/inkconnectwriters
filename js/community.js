document.addEventListener("DOMContentLoaded", async () => {
  const session = Auth.requireRole();
  if (!session) return;

  const dashboardByRole = {
    client: "client-dashboard.html",
    writer: "writer-dashboard.html",
    admin: "admin-dashboard.html",
  };
  const dashboardUrl = dashboardByRole[session.user.role] || "index.html";
  document.getElementById("community-dashboard-link").href = dashboardUrl;
  document.getElementById("community-skip").href = dashboardUrl;
  document.querySelector("[data-community-logout]").addEventListener("click", (event) => {
    event.preventDefault();
    Auth.logout();
  });

  const notificationStatus = document.getElementById("community-notification-status");
  const notificationButton = document.getElementById("community-enable-notifications");
  const updateNotificationStatus = () => {
    if (!("Notification" in window)) {
      notificationStatus.textContent = "This browser does not support desktop notifications.";
      notificationButton.disabled = true;
      return;
    }

    const permission = window.Notification.permission;
    notificationButton.disabled = permission !== "default";
    notificationButton.textContent = permission === "granted" ? "Notifications allowed" : "Allow notifications";
    if (permission === "granted") {
      notificationStatus.textContent = "Notifications are enabled. Keep InkConnect open to receive updates.";
    } else if (permission === "denied") {
      notificationStatus.textContent = "Notifications are blocked in your browser. Change this site's notification permission in browser settings.";
    } else {
      notificationStatus.textContent = "Allow browser notifications to receive updates about jobs, messages, and payments.";
    }
  };
  const requestNotificationPermission = async () => {
    if (!("Notification" in window) || window.Notification.permission !== "default") {
      updateNotificationStatus();
      return;
    }
    try {
      await window.Notification.requestPermission();
    } catch (error) {
      console.warn("Unable to request browser notification permission:", error);
    }
    updateNotificationStatus();
  };
  notificationButton.addEventListener("click", requestNotificationPermission);
  updateNotificationStatus();
  if ("Notification" in window && window.Notification.permission === "default") {
    requestNotificationPermission();
  }

  const config = await getEffectiveSiteConfig();
  const invite = document.getElementById("community-invite");
  const links = [
    { url: config.COMMUNITY_WHATSAPP_LINK, label: "Join WhatsApp", pattern: /^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i, primary: true },
    { url: config.COMMUNITY_FACEBOOK_LINK, label: "Follow on Facebook", pattern: /^https:\/\/([a-z0-9-]+\.)?facebook\.com\//i },
    { url: config.COMMUNITY_TIKTOK_LINK, label: "Follow on TikTok", pattern: /^https:\/\/([a-z0-9-]+\.)?tiktok\.com\//i },
  ];
  let validLinkCount = 0;
  links.forEach(({ url, label, pattern, primary }) => {
    if (!url) return;
    if (!pattern.test(url)) {
      toast(`The configured ${label.replace(/^(Join|Follow on) /, "")} link is invalid.`, "error");
      return;
    }
    const link = document.createElement("a");
    link.className = primary ? "btn btn-primary" : "btn btn-outline";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    invite.appendChild(link);
    validLinkCount += 1;
  });
  if (!validLinkCount) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "Community links will appear here when the administrator adds them.";
    invite.appendChild(note);
  }
});
