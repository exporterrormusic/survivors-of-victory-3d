// Starts the Survivors of Victory front end (Phaser 4): disclaimer, lobby, character and
// stage select, shop, records, achievements and settings. Adapted from that project's main.ts.
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import Phaser from "phaser";

import { AchievementsScene } from "./scenes/AchievementsScene";
import { CharacterSelectScene } from "./scenes/CharacterSelectScene";
import { DisclaimerScene } from "./scenes/DisclaimerScene";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { RecordsScene } from "./scenes/RecordsScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { ShopScene } from "./scenes/ShopScene";
import { StageSelectScene } from "./scenes/StageSelectScene";
import {
  DisplayQualityPlugin,
  RENDER_HEIGHT,
  RENDER_WIDTH,
} from "./rendering/DisplayQualityPlugin";
import "./styles.css";

export async function bootFrontEnd(parent: HTMLElement): Promise<Phaser.Game> {
  await Promise.all([
    document.fonts.load("500 24px Rajdhani"),
    document.fonts.load("600 32px Rajdhani"),
    document.fonts.load("700 40px Rajdhani"),
    document.fonts.load("500 22px Pretendard"),
    document.fonts.load("700 32px Pretendard"),
  ]);

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
    backgroundColor: "#11171e",
    scene: [
      DisclaimerScene,
      MainMenuScene,
      AchievementsScene,
      RecordsScene,
      ShopScene,
      SettingsScene,
      CharacterSelectScene,
      StageSelectScene,
    ],
    input: { gamepad: true },
    plugins: {
      scene: [{ key: "displayQuality", plugin: DisplayQualityPlugin }],
    },
    render: {
      antialias: true,
      pixelArt: false,
      preserveDrawingBuffer: false,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      autoRound: true,
    },
  });
}
