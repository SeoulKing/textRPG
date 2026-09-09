import Phaser from "/vendor/phaser.mjs";
import {
  SHELTER_SCENE_HEIGHT,
  SHELTER_SCENE_WIDTH,
  ShelterScene,
} from "./scenes/cooking-scene.js";

export class SceneDirector {
  constructor({ canvas, host }) {
    this.canvas = canvas;
    this.host = host;
    this.game = null;
    this.shelterScene = null;
    this.readyPromise = null;
    this.commandToken = 0;
    this.lastError = null;
  }

  ensureReady() {
    if (!this.canvas) {
      return Promise.reject(new Error("Scene canvas is not available."));
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.shelterScene = new ShelterScene();
    this.game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: SHELTER_SCENE_WIDTH,
      height: SHELTER_SCENE_HEIGHT,
      canvas: this.canvas,
      canvasStyle: "width: 100%; height: 100%;",
      transparent: true,
      pixelArt: true,
      roundPixels: true,
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
      audio: {
        noAudio: true,
      },
      scene: [this.shelterScene],
    });

    this.readyPromise = this.shelterScene
      .whenReady()
      .then(() => {
        this.lastError = null;
        return this.shelterScene;
      })
      .catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      });
    return this.readyPromise;
  }

  preloadShelter() {
    return this.ensureReady();
  }

  setShelterVisible(visible) {
    if (this.canvas) {
      this.canvas.hidden = !visible;
    }
    this.host?.classList.toggle("has-shelter-scene-visual", visible);
  }

  async showShelterAtStation(station, { reduceMotion = false } = {}) {
    const token = ++this.commandToken;
    const scene = await this.ensureReady();
    if (token !== this.commandToken) {
      return;
    }
    this.setShelterVisible(true);
    scene.showAtStation(station, { reduceMotion });
  }

  async moveShelterActor(station, {
    durationMs = null,
    reduceMotion = false,
  } = {}) {
    const token = ++this.commandToken;
    const scene = await this.ensureReady();
    if (token !== this.commandToken) {
      return;
    }
    this.setShelterVisible(true);
    await scene.moveToStation(station, { durationMs, reduceMotion });
  }

  hideShelter() {
    this.commandToken += 1;
    this.shelterScene?.hideVisual();
    this.setShelterVisible(false);
  }

  snapshot() {
    if (this.lastError) {
      return {
        engine: "phaser",
        state: "error",
        error: this.lastError,
      };
    }
    return this.shelterScene?.snapshot() ?? {
      engine: "phaser",
      state: this.readyPromise ? "loading" : "idle",
    };
  }
}
