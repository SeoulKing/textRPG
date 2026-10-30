import { SceneDirector } from "./scene-director.js";

const canvas = document.querySelector("#scene-animation");
const host = document.querySelector("#preview-frame");
const debug = document.querySelector("#preview-debug");
const restButton = document.querySelector("#preview-rest");
const craftingButton = document.querySelector("#preview-crafting");
const cookingButton = document.querySelector("#preview-cooking");

const director = new SceneDirector({ canvas, host });

function renderDebug() {
  debug.textContent = JSON.stringify(director.snapshot(), null, 2);
}

async function showRest() {
  await director.showShelterAtStation("rest");
  renderDebug();
}

async function moveTo(station, button) {
  button.disabled = true;
  try {
    await director.moveShelterActor(station);
  } finally {
    button.disabled = false;
    renderDebug();
  }
}

restButton.addEventListener("click", () => moveTo("rest", restButton));
craftingButton.addEventListener("click", () => moveTo("crafting", craftingButton));
cookingButton.addEventListener("click", () => moveTo("cooking", cookingButton));

window.setInterval(renderDebug, 80);
director.preloadShelter()
  .then(showRest)
  .catch((error) => {
    debug.textContent = error instanceof Error ? error.message : String(error);
  });
