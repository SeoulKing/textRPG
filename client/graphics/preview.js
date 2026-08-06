import { SceneDirector } from "./scene-director.js";

const canvas = document.querySelector("#scene-animation");
const host = document.querySelector("#preview-frame");
const debug = document.querySelector("#preview-debug");
const playButton = document.querySelector("#preview-play");
const readyButton = document.querySelector("#preview-ready");
const resetButton = document.querySelector("#preview-reset");

const director = new SceneDirector({ canvas, host });

function renderDebug() {
  debug.textContent = JSON.stringify(director.snapshot(), null, 2);
}

async function showReady() {
  await director.showCookingAtRest();
  renderDebug();
}

playButton.addEventListener("click", async () => {
  playButton.disabled = true;
  try {
    await director.playCookingEntrance();
  } finally {
    playButton.disabled = false;
    renderDebug();
  }
});

readyButton.addEventListener("click", showReady);
resetButton.addEventListener("click", () => {
  director.hideCooking();
  renderDebug();
});

window.setInterval(renderDebug, 80);
director.preloadCooking()
  .then(showReady)
  .catch((error) => {
    debug.textContent = error instanceof Error ? error.message : String(error);
  });
