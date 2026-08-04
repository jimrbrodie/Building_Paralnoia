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
