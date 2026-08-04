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
