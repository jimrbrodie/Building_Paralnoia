// Mobile nav toggle
const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");

if (navToggle && mainNav) {
  navToggle.addEventListener("click", () => {
    mainNav.classList.toggle("open");
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => mainNav.classList.remove("open"));
  });
}

// Highlight the current page in the nav
const currentPage = window.location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".main-nav a").forEach((link) => {
  const linkPage = link.getAttribute("href");
  if (linkPage === currentPage) {
    link.classList.add("active");
  }
});

// Home page video intro
const introScreen = document.querySelector("#intro-screen");

if (introScreen) {
  const playButton = introScreen.querySelector("#intro-play");
  const skipButton = introScreen.querySelector("#intro-skip");
  const introVideo = introScreen.querySelector("#intro-video");
  const introPrompt = introScreen.querySelector(".intro-prompt");
  const alreadySeen = sessionStorage.getItem("paralnoiaIntroSeen") === "true";

  const endIntro = () => {
    sessionStorage.setItem("paralnoiaIntroSeen", "true");
    introScreen.classList.add("intro-hidden");
    introVideo.pause();
    setTimeout(() => introScreen.remove(), 800);
  };

  if (alreadySeen) {
    introScreen.remove();
  } else {
    playButton.addEventListener("click", () => {
      introPrompt.classList.add("intro-hidden");
      skipButton.classList.remove("intro-hidden");
      introVideo.classList.add("intro-visible");
      introVideo.play();
    });

    skipButton.addEventListener("click", endIntro);
    introVideo.addEventListener("ended", endIntro);
  }
}

// Regional news grids (UK / Europe / US)
if (typeof newsData !== "undefined") {
  const formatDate = (isoDate) => {
    const d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const isHttpUrl = (url) => typeof url === "string" && /^https?:\/\//i.test(url);

  const renderCard = (item) => {
    const url = isHttpUrl(item.url) ? item.url : "#";
    const image = isHttpUrl(item.image) ? item.image : null;
    return `
    <a class="news-card" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
      ${image
        ? `<img class="news-card-img" src="${escapeHtml(image)}" alt="" loading="lazy" />`
        : `<div class="news-card-img news-card-img--placeholder"><img src="assets/Paralnoia_Logo.png" alt="" /></div>`
      }
      <div class="news-card-body">
        <div class="news-card-meta">
          <span>${escapeHtml(item.source)}</span>
          <span>${formatDate(item.date)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="news-card-excerpt">${escapeHtml(item.excerpt)}</p>
        <span class="news-card-link">Read Story &#8599;</span>
      </div>
    </a>
  `;
  };

  ["uk", "europe", "us"].forEach((region) => {
    const grid = document.querySelector(`#news-grid-${region}`);
    if (!grid) return;

    const items = newsData[region] || [];
    grid.innerHTML = items.length
      ? items.map(renderCard).join("")
      : `<p class="news-empty">No matching stories found in the latest update — check back soon.</p>`;
  });

  const updatedLabel = document.querySelector("#news-updated");
  if (updatedLabel) {
    updatedLabel.textContent = newsData.updatedAt
      ? `Last updated ${new Date(newsData.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
      : "Awaiting first automated update";
  }
}

// "Update Now" button — calls a Cloudflare Worker that holds the GitHub
// token server-side and triggers the update-news workflow on our behalf.
// Set this after deploying the worker (see cloudflare-worker/README.md).
const NEWS_TRIGGER_WORKER_URL = "https://paralnoia-news-trigger.jimrbrodie.workers.dev";

const newsRefreshBtn = document.querySelector("#news-refresh-btn");
const newsRefreshStatus = document.querySelector("#news-refresh-status");

if (newsRefreshBtn && newsRefreshStatus) {
  if (!NEWS_TRIGGER_WORKER_URL) {
    newsRefreshBtn.disabled = true;
    newsRefreshStatus.textContent = "Manual update isn't configured yet.";
  } else {
    const pollUntilDone = () => {
      const start = Date.now();
      const maxWaitMs = 3 * 60 * 1000;

      const tick = async () => {
        if (Date.now() - start > maxWaitMs) {
          newsRefreshStatus.textContent = "Still running — check back in a minute and reload the page.";
          newsRefreshBtn.disabled = false;
          return;
        }
        try {
          const res = await fetch(`${NEWS_TRIGGER_WORKER_URL}/status`);
          const data = await res.json();
          const run = data.latestRun;
          if (run && run.status === "completed") {
            if (run.conclusion === "success") {
              newsRefreshStatus.textContent = "Done — reloading with the latest stories…";
              setTimeout(() => window.location.reload(), 1200);
            } else {
              newsRefreshStatus.textContent = "Update finished but hit an error.";
              newsRefreshBtn.disabled = false;
            }
            return;
          }
        } catch (err) {
          // Transient network hiccup — keep polling.
        }
        setTimeout(tick, 5000);
      };

      tick();
    };

    newsRefreshBtn.addEventListener("click", async () => {
      newsRefreshBtn.disabled = true;
      newsRefreshStatus.textContent = "Starting update…";
      try {
        const res = await fetch(NEWS_TRIGGER_WORKER_URL, { method: "POST" });
        const data = await res.json().catch(() => ({}));

        if (res.status === 202) {
          newsRefreshStatus.textContent = "Update started — this can take a minute…";
          pollUntilDone();
        } else if (res.status === 429) {
          newsRefreshStatus.textContent = data.error || "Please try again shortly.";
          newsRefreshBtn.disabled = false;
        } else {
          newsRefreshStatus.textContent = data.error || "Couldn't start the update.";
          newsRefreshBtn.disabled = false;
        }
      } catch (err) {
        newsRefreshStatus.textContent = "Couldn't reach the update service.";
        newsRefreshBtn.disabled = false;
      }
    });
  }
}
