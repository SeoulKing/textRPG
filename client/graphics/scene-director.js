import Phaser from "/vendor/phaser.mjs";
import {
  COOKING_ENTRANCE_DURATION_MS,
  COOKING_SCENE_HEIGHT,
  COOKING_SCENE_WIDTH,
  CookingScene,
} from "./scenes/cooking-scene.js";

export class SceneDirector {
  constructor({ canvas, host }) {
    this.canvas = canvas;
    this.host = host;
    this.game = null;
    this.cookingScene = null;
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

    this.cookingScene = new CookingScene();
    this.game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: COOKING_SCENE_WIDTH,
      height: COOKING_SCENE_HEIGHT,
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
      scene: [this.cookingScene],
    });

    this.readyPromise = this.cookingScene
      .whenReady()
      .then(() => {
        this.lastError = null;
        return this.cookingScene;
      })
      .catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      });
    return this.readyPromise;
  }

  preloadCooking() {
    return this.ensureReady();
  }

  setCookingVisible(visible) {
    if (this.canvas) {
      this.canvas.hidden = !visible;
    }
    this.host?.classList.toggle("has-cooking-scene-visual", visible);
  }

  async showCookingAtRest({ reduceMotion = false } = {}) {
    const token = ++this.commandToken;
    const scene = await this.ensureReady();
    if (token !== this.commandToken) {
      return;
    }
    this.setCookingVisible(true);
    scene.showAtRest({ reduceMotion });
  }

  async playCookingEntrance({
    durationMs = COOKING_ENTRANCE_DURATION_MS,
    reduceMotion = false,
  } = {}) {
    const token = ++this.commandToken;
    const scene = await this.ensureReady();
    if (token !== this.commandToken) {
      return;
    }
    this.setCookingVisible(true);
    await scene.playEntrance({ durationMs, reduceMotion });
  }

  hideCooking() {
    this.commandToken += 1;
    this.cookingScene?.hideVisual();
    this.setCookingVisible(false);
  }

  snapshot() {
    if (this.lastError) {
      return {
        engine: "phaser",
        state: "error",
        error: this.lastError,
      };
    }
    return this.cookingScene?.snapshot() ?? {
      engine: "phaser",
      state: this.readyPromise ? "loading" : "idle",
    };
  }
}
