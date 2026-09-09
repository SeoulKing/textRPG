import Phaser from "/vendor/phaser.mjs";

export const SHELTER_SCENE_KEY = "shelter-diorama";
export const SHELTER_SCENE_WIDTH = 768;
export const SHELTER_SCENE_HEIGHT = 224;
export const SHELTER_STATION_IDS = Object.freeze({
  rest: "rest",
  crafting: "crafting",
  cooking: "cooking",
});

const BACKGROUND_KEY = "cooking-background";
const SURVIVOR_SHEET_KEY = "survivor-cooking-cycle";
const FOREGROUND_CRATE_KEY = "cooking-foreground-crate";
const SURVIVOR_WALK_ANIMATION_KEY = "survivor-cooking-walk";
const SURVIVOR_READY_ANIMATION_KEY = "survivor-cooking-ready";

const ACTOR_SCALE = 1.2;
const ACTOR_FOOT_Y = 207;
const SHADOW_Y = 210;
const SHADOW_WIDTH = 82;
const SHADOW_HEIGHT = 12;
const ACTOR_MOVE_SPEED = 123;
const ACTOR_MOVE_MIN_DURATION_MS = 700;
const STATIONS = Object.freeze({
  [SHELTER_STATION_IDS.rest]: Object.freeze({ x: 235, flipX: false }),
  [SHELTER_STATION_IDS.crafting]: Object.freeze({ x: 395, flipX: true }),
  [SHELTER_STATION_IDS.cooking]: Object.freeze({ x: 445, flipX: false }),
});
const WALK_FRAME_RATE = 14;
const READY_FRAME_RATE = 4;
const LAYER_DEPTH = Object.freeze({
  background: 0,
  ambient: 10,
  shadow: 20,
  actor: 30,
  foreground: 40,
});

export class ShelterScene extends Phaser.Scene {
  constructor() {
    super({ key: SHELTER_SCENE_KEY });
    this.actor = null;
    this.shadow = null;
    this.activeTween = null;
    this.activeResolve = null;
    this.ambientTweens = [];
    this.ambientParticles = [];
    this.ambientMotionEnabled = false;
    this.visualState = "hidden";
    this.currentStation = null;
    this.targetStation = null;
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  preload() {
    this.load.image(
      BACKGROUND_KEY,
      "/assets/scenes/cooking/shelter-cooking-diorama.png",
    );
    this.load.spritesheet(
      SURVIVOR_SHEET_KEY,
      "/assets/scenes/cooking/survivor-cooking-cycle-v2.png",
      { frameWidth: 96, frameHeight: 128 },
    );
    this.load.image(
      FOREGROUND_CRATE_KEY,
      "/assets/scenes/cooking/foreground-supply-crate.png",
    );
  }

  create() {
    const missingTextures = [
      BACKGROUND_KEY,
      SURVIVOR_SHEET_KEY,
      FOREGROUND_CRATE_KEY,
    ]
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
      .setDisplaySize(SHELTER_SCENE_WIDTH, SHELTER_SCENE_HEIGHT)
      .setDepth(LAYER_DEPTH.background);

    this.createAmbientLayers();

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
      .ellipse(
        STATIONS.rest.x,
        SHADOW_Y,
        SHADOW_WIDTH,
        SHADOW_HEIGHT,
        0x090706,
        0.3,
      )
      .setDepth(LAYER_DEPTH.shadow)
      .setVisible(false);

    this.actor = this.add
      .sprite(STATIONS.rest.x, ACTOR_FOOT_Y, SURVIVOR_SHEET_KEY, 8)
      .setOrigin(0.5, 1)
      .setScale(ACTOR_SCALE)
      .setDepth(LAYER_DEPTH.actor)
      .setVisible(false);

    this.add
      .ellipse(334, 214, 92, 8, 0x090706, 0.22)
      .setDepth(LAYER_DEPTH.foreground - 1);
    this.add
      .image(334, 224, FOREGROUND_CRATE_KEY)
      .setOrigin(0.5, 1)
      .setDepth(LAYER_DEPTH.foreground);

    this.cameras.main.setRoundPixels(true);
    this.setAmbientMotion(false);
    this.resolveReady?.();
    this.resolveReady = null;
    this.rejectReady = null;
  }

  whenReady() {
    return this.readyPromise;
  }

  createAmbientLayers() {
    this.fireGlow = this.add
      .ellipse(536, 165, 116, 78, 0xff7a24, 0.08)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(LAYER_DEPTH.ambient);
    this.lanternGlow = this.add
      .ellipse(644, 91, 70, 64, 0xffc568, 0.055)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(LAYER_DEPTH.ambient);

    this.ambientTweens.push(
      this.tweens.add({
        targets: this.fireGlow,
        alpha: { from: 0.055, to: 0.115 },
        scaleX: { from: 0.96, to: 1.04 },
        scaleY: { from: 0.94, to: 1.06 },
        duration: 540,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      }),
      this.tweens.add({
        targets: this.lanternGlow,
        alpha: { from: 0.04, to: 0.075 },
        duration: 920,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      }),
    );

    const emberColors = [0xffc15a, 0xff8b36, 0xffe19a];
    for (let index = 0; index < 6; index += 1) {
      const x = 520 + index * 7;
      const y = 172 - (index % 2) * 3;
      const ember = this.add
        .rectangle(x, y, 2, 2, emberColors[index % emberColors.length], 0.85)
        .setDepth(LAYER_DEPTH.ambient + 1);
      this.ambientParticles.push(ember);
      this.ambientTweens.push(this.tweens.add({
        targets: ember,
        x: x + (index % 2 === 0 ? -3 : 3),
        y: y - 16 - index,
        alpha: 0,
        duration: 720 + index * 95,
        delay: index * 130,
        ease: "Quad.easeOut",
        repeat: -1,
        repeatDelay: 180,
      }));
    }

    for (let index = 0; index < 3; index += 1) {
      const x = 536 + index * 5;
      const y = 108 - index * 3;
      const steam = this.add
        .rectangle(x, y, 3, 2, 0xd7c7a7, 0.4)
        .setDepth(LAYER_DEPTH.ambient + 1);
      this.ambientParticles.push(steam);
      this.ambientTweens.push(this.tweens.add({
        targets: steam,
        x: x + (index % 2 === 0 ? 4 : -3),
        y: y - 17,
        alpha: 0,
        duration: 1150 + index * 170,
        delay: 220 + index * 360,
        ease: "Sine.easeOut",
        repeat: -1,
        repeatDelay: 380,
      }));
    }
  }

  setAmbientMotion(enabled) {
    this.ambientMotionEnabled = enabled;
    this.ambientTweens.forEach((tween) => {
      if (enabled) tween.resume();
      else tween.pause();
    });
    this.ambientParticles.forEach((particle) => particle.setVisible(enabled));
    if (!enabled) {
      this.fireGlow?.setAlpha(0.075).setScale(1);
      this.lanternGlow?.setAlpha(0.05);
    }
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

  station(stationId) {
    const station = STATIONS[stationId];
    if (!station) {
      throw new Error(`Unknown shelter station: ${stationId}`);
    }
    return station;
  }

  placeActorAtStation(stationId, { animate = true } = {}) {
    if (!this.actor || !this.shadow) {
      return;
    }
    const station = this.station(stationId);

    this.actor
      .stop()
      .setTexture(SURVIVOR_SHEET_KEY, 8)
      .setOrigin(0.5, 1)
      .setScale(ACTOR_SCALE)
      .setFlipX(station.flipX)
      .setPosition(station.x, ACTOR_FOOT_Y)
      .setVisible(true);
    this.shadow
      .setPosition(station.x, SHADOW_Y)
      .setVisible(true);

    if (animate) {
      this.actor.play(SURVIVOR_READY_ANIMATION_KEY);
    }
    this.visualState = "ready";
    this.currentStation = stationId;
    this.targetStation = null;
  }

  showAtStation(stationId = SHELTER_STATION_IDS.rest, { reduceMotion = false } = {}) {
    this.settleActiveAnimation();
    this.setAmbientMotion(!reduceMotion);
    if (
      this.visualState === "ready"
      && this.currentStation === stationId
      && this.actor?.visible
    ) {
      if (reduceMotion) {
        this.actor.stop().setFrame(8);
      } else if (!this.actor.anims.isPlaying) {
        this.actor.play(SURVIVOR_READY_ANIMATION_KEY);
      }
      return;
    }
    this.placeActorAtStation(stationId, { animate: !reduceMotion });
  }

  hideVisual() {
    this.settleActiveAnimation();
    this.setAmbientMotion(false);
    this.actor?.stop().setVisible(false);
    this.shadow?.setVisible(false);
    this.visualState = "hidden";
    this.currentStation = null;
    this.targetStation = null;
  }

  moveToStation(stationId, {
    durationMs = null,
    reduceMotion = false,
  } = {}) {
    this.settleActiveAnimation();
    this.setAmbientMotion(!reduceMotion);
    const target = this.station(stationId);
    if (!this.actor || !this.shadow) {
      return Promise.resolve();
    }
    if (!this.actor.visible) {
      this.placeActorAtStation(SHELTER_STATION_IDS.rest, { animate: false });
    }
    if (reduceMotion || Math.abs(this.actor.x - target.x) < 1) {
      this.placeActorAtStation(stationId, { animate: !reduceMotion });
      return Promise.resolve();
    }

    const startX = this.actor.x;
    const movingLeft = target.x < startX;
    const resolvedDuration = Number.isFinite(durationMs)
      ? Math.max(0, durationMs)
      : Math.max(
          ACTOR_MOVE_MIN_DURATION_MS,
          Math.round((Math.abs(target.x - startX) / ACTOR_MOVE_SPEED) * 1000),
        );
    this.visualState = "moving";
    this.currentStation = null;
    this.targetStation = stationId;
    this.shadow
      .setPosition(startX, SHADOW_Y)
      .setVisible(true);
    this.actor
      .setTexture(SURVIVOR_SHEET_KEY, 0)
      .setOrigin(0.5, 1)
      .setScale(ACTOR_SCALE)
      .setFlipX(movingLeft)
      .setPosition(startX, ACTOR_FOOT_Y)
      .setVisible(true)
      .play(SURVIVOR_WALK_ANIMATION_KEY);

    return new Promise((resolve) => {
      this.activeResolve = resolve;
      this.activeTween = this.tweens.add({
        targets: this.actor,
        x: target.x,
        duration: resolvedDuration,
        ease: "Linear",
        onUpdate: () => {
          this.shadow?.setX(Math.round(this.actor.x));
        },
        onComplete: () => {
          this.activeTween = null;
          this.placeActorAtStation(stationId);
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
      scene: SHELTER_SCENE_KEY,
      state: this.visualState,
      station: this.currentStation,
      targetStation: this.targetStation,
      actor: this.actor
        ? {
            x: Math.round(this.actor.x),
            y: Math.round(this.actor.y),
            scaleX: this.actor.scaleX,
            scaleY: this.actor.scaleY,
            flipX: this.actor.flipX,
            frame: typeof frame === "number" ? frame : Number(frame) || 0,
            visible: this.actor.visible,
          }
        : null,
      groundY: ACTOR_FOOT_Y,
      stations: Object.fromEntries(
        Object.entries(STATIONS).map(([id, station]) => [id, { x: station.x }]),
      ),
      layers: LAYER_DEPTH,
      ambientMotion: this.ambientMotionEnabled,
    };
  }
}
