import Phaser from "/vendor/phaser.mjs";

export const COOKING_SCENE_KEY = "shelter-cooking";
export const COOKING_SCENE_WIDTH = 768;
export const COOKING_SCENE_HEIGHT = 224;
export const COOKING_ENTRANCE_DURATION_MS = 2160;

const BACKGROUND_KEY = "cooking-background";
const SURVIVOR_SHEET_KEY = "survivor-cooking-cycle";
const SURVIVOR_WALK_ANIMATION_KEY = "survivor-cooking-walk";
const SURVIVOR_READY_ANIMATION_KEY = "survivor-cooking-ready";

const ACTOR_SCALE = 0.625;
const ACTOR_START_X = 180;
const ACTOR_TARGET_X = 445;
const ACTOR_FOOT_Y = 207;
const SHADOW_Y = 210;
const WALK_FRAME_RATE = 14;
const READY_FRAME_RATE = 4;

export class CookingScene extends Phaser.Scene {
  constructor() {
    super({ key: COOKING_SCENE_KEY });
    this.actor = null;
    this.shadow = null;
    this.activeTween = null;
    this.activeResolve = null;
    this.visualState = "hidden";
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  preload() {
    this.load.image(
      BACKGROUND_KEY,
      "/assets/scenes/cooking/shelter-cooking-background.png",
    );
    this.load.spritesheet(
      SURVIVOR_SHEET_KEY,
      "/assets/scenes/cooking/survivor-cooking-cycle.png",
      { frameWidth: 96, frameHeight: 128 },
    );
  }

  create() {
    const missingTextures = [BACKGROUND_KEY, SURVIVOR_SHEET_KEY]
      .filter((key) => !this.textures.exists(key));
    if (missingTextures.length > 0) {
      this.visualState = "error";
      this.rejectReady?.(new Error(
        `Cooking scene assets failed to load: ${missingTextures.join(", ")}`,
      ));
      this.resolveReady = null;
      this.rejectReady = null;
      return;
    }

    this.add
      .image(0, 0, BACKGROUND_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(COOKING_SCENE_WIDTH, COOKING_SCENE_HEIGHT);

    if (!this.anims.exists(SURVIVOR_WALK_ANIMATION_KEY)) {
      this.anims.create({
        key: SURVIVOR_WALK_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(SURVIVOR_SHEET_KEY, {
          start: 0,
          end: 7,
        }),
        frameRate: WALK_FRAME_RATE,
        repeat: -1,
      });
    }

    if (!this.anims.exists(SURVIVOR_READY_ANIMATION_KEY)) {
      this.anims.create({
        key: SURVIVOR_READY_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(SURVIVOR_SHEET_KEY, {
          start: 8,
          end: 11,
        }),
        frameRate: READY_FRAME_RATE,
        repeat: -1,
        repeatDelay: 260,
      });
    }

    this.shadow = this.add
      .ellipse(ACTOR_TARGET_X, SHADOW_Y, 46, 7, 0x090706, 0.3)
      .setDepth(1)
      .setVisible(false);

    this.actor = this.add
      .sprite(ACTOR_TARGET_X, ACTOR_FOOT_Y, SURVIVOR_SHEET_KEY, 8)
      .setOrigin(0.5, 1)
      .setScale(ACTOR_SCALE)
      .setDepth(2)
      .setVisible(false);

    this.cameras.main.setRoundPixels(true);
    this.resolveReady?.();
    this.resolveReady = null;
    this.rejectReady = null;
  }

  whenReady() {
    return this.readyPromise;
  }

  settleActiveAnimation() {
    if (this.activeTween) {
      this.activeTween.stop();
      this.activeTween = null;
    }
    if (this.activeResolve) {
      const resolve = this.activeResolve;
      this.activeResolve = null;
      resolve();
    }
  }

  placeActorAtReady({ animate = true } = {}) {
    if (!this.actor || !this.shadow) {
      return;
    }

    this.actor
      .stop()
      .setTexture(SURVIVOR_SHEET_KEY, 8)
      .setOrigin(0.5, 1)
      .setScale(ACTOR_SCALE)
      .setPosition(ACTOR_TARGET_X, ACTOR_FOOT_Y)
      .setVisible(true);
    this.shadow
      .setPosition(ACTOR_TARGET_X, SHADOW_Y)
      .setVisible(true);

    if (animate) {
      this.actor.play(SURVIVOR_READY_ANIMATION_KEY);
    }
    this.visualState = "ready";
  }

  showAtRest({ reduceMotion = false } = {}) {
    this.settleActiveAnimation();
    if (this.visualState === "ready" && this.actor?.visible) {
      if (reduceMotion) {
        this.actor.stop().setFrame(8);
      } else if (!this.actor.anims.isPlaying) {
        this.actor.play(SURVIVOR_READY_ANIMATION_KEY);
      }
      return;
    }
    this.placeActorAtReady({ animate: !reduceMotion });
  }

  hideVisual() {
    this.settleActiveAnimation();
    this.actor?.stop().setVisible(false);
    this.shadow?.setVisible(false);
    this.visualState = "hidden";
  }

  playEntrance({
    durationMs = COOKING_ENTRANCE_DURATION_MS,
    reduceMotion = false,
  } = {}) {
    this.settleActiveAnimation();
    if (!this.actor || !this.shadow || reduceMotion) {
      this.placeActorAtReady({ animate: false });
      return Promise.resolve();
    }

    this.visualState = "entering";
    this.shadow
      .setPosition(ACTOR_START_X, SHADOW_Y)
      .setVisible(true);
    this.actor
      .setTexture(SURVIVOR_SHEET_KEY, 0)
      .setOrigin(0.5, 1)
      .setScale(ACTOR_SCALE)
      .setPosition(ACTOR_START_X, ACTOR_FOOT_Y)
      .setVisible(true)
      .play(SURVIVOR_WALK_ANIMATION_KEY);

    return new Promise((resolve) => {
      this.activeResolve = resolve;
      this.activeTween = this.tweens.add({
        targets: this.actor,
        x: ACTOR_TARGET_X,
        duration: durationMs,
        ease: "Linear",
        onUpdate: () => {
          this.shadow?.setX(Math.round(this.actor.x));
        },
        onComplete: () => {
          this.activeTween = null;
          this.placeActorAtReady();
          const finish = this.activeResolve;
          this.activeResolve = null;
          finish?.();
        },
      });
    });
  }

  snapshot() {
    const frame = this.actor?.frame?.name;
    return {
      engine: "phaser",
      scene: COOKING_SCENE_KEY,
      state: this.visualState,
      actor: this.actor
        ? {
            x: Math.round(this.actor.x),
            y: Math.round(this.actor.y),
            scaleX: this.actor.scaleX,
            scaleY: this.actor.scaleY,
            frame: typeof frame === "number" ? frame : Number(frame) || 0,
            visible: this.actor.visible,
          }
        : null,
      groundY: ACTOR_FOOT_Y,
    };
  }
}
