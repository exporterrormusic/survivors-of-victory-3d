import Phaser from "phaser";

import { CHARACTER_IDS, type CharacterId } from "../profile/Ids";
import { CHARACTER_MODULES, type VoiceLine } from "../../characters";
import { characterVoice } from "../../characters/assets";
import {
  AUDIO_SETTINGS_EVENT,
  loadAudioSettings,
  scaledSfxVolume,
} from "../settings/GameSettings";

export const GAME_AUDIO_KEYS = Object.freeze({
  music: {
    lobby: "global-music-lobby",
    stageHazard: "stage-select-music-hazard",
  },
  ui: {
    back: "global-ui-back",
    confirm: "global-ui-confirm",
    select: "global-ui-select",
  },
});

export type UiSound = keyof typeof GAME_AUDIO_KEYS.ui;

type CharacterVoiceVariant = VoiceLine;

// Each character's lines live in src/characters/<id>/index.ts.
const characterVoices = (id: CharacterId): readonly VoiceLine[] =>
  CHARACTER_MODULES[id].voices;

const characterVoiceKey = (characterId: CharacterId, index: number): string =>
  `character-selection-voice-${characterId}-${index}`;

export function preloadCharacterSelectionVoices(scene: Phaser.Scene): void {
  CHARACTER_IDS.forEach((characterId) => {
    characterVoices(characterId).forEach((variant, index) => {
      scene.load.audio(
        characterVoiceKey(characterId, index),
        characterVoice(characterId, variant.file),
      );
    });
  });
}

export function preloadLobbyAudio(scene: Phaser.Scene): void {
  scene.load.audio(
    GAME_AUDIO_KEYS.music.lobby,
    "assets/audio/music/main-menu.mp3",
  );
  scene.load.audio(GAME_AUDIO_KEYS.ui.select, "assets/audio/ui/select.wav");
  scene.load.audio(GAME_AUDIO_KEYS.ui.confirm, "assets/audio/ui/confirm.wav");
  scene.load.audio(GAME_AUDIO_KEYS.ui.back, "assets/audio/ui/back.wav");
}

export function preloadStageSelectAudio(scene: Phaser.Scene): void {
  scene.load.audio(
    GAME_AUDIO_KEYS.music.stageHazard,
    "assets/audio/music/timer.mp3",
  );
}

type AdjustableSound = Phaser.Sound.BaseSound & {
  setVolume: (value: number) => Phaser.Sound.BaseSound;
};

class GameAudioDirector {
  private characterSelectionVoice?: Phaser.Sound.BaseSound;
  private stageHazardMusic?: AdjustableSound;
  private lobbyMusic?: AdjustableSound;

  public playLobby(scene: Phaser.Scene): void {
    if (this.lobbyMusic === undefined || this.lobbyMusic.pendingRemove) {
      this.lobbyMusic = scene.sound.add(GAME_AUDIO_KEYS.music.lobby, {
        loop: true,
        volume: this.lobbyVolume(),
      }) as AdjustableSound;
    }
    this.lobbyMusic.setVolume(this.lobbyVolume());
    if (this.lobbyMusic.isPaused) this.lobbyMusic.resume();
    else if (!this.lobbyMusic.isPlaying)
      this.lobbyMusic.play({ loop: true, volume: this.lobbyVolume() });
  }

  public updateMusicVolume(): void {
    this.lobbyMusic?.setVolume(this.lobbyVolume());
    this.stageHazardMusic?.setVolume(this.hazardVolume());
  }

  public updateAmbienceVolume(): void {
    // Survivor ambience will be attached to the gameplay runtime later.
  }

  public stopEnvironmentAmbience(): void {
    // Retained for the exact menu-scene interface.
  }

  public playUi(
    scene: Phaser.Scene,
    sound: UiSound,
    baseVolume?: number,
  ): void {
    const defaults: Readonly<Record<UiSound, number>> = {
      back: 0.3,
      confirm: 0.22,
      select: 0.16,
    };
    scene.sound.play(GAME_AUDIO_KEYS.ui[sound], {
      volume: scaledSfxVolume(
        baseVolume ?? defaults[sound],
        loadAudioSettings(),
      ),
    });
  }

  public playCharacterSelectionVoice(
    scene: Phaser.Scene,
    characterId: CharacterId,
  ): void {
    const variants = characterVoices(characterId);
    if (variants === undefined || variants.length === 0) return;
    this.stopCharacterSelectionVoice();
    const selectedIndex = weightedVariantIndex(variants);
    const selected = variants[selectedIndex]!;
    const key = characterVoiceKey(characterId, selectedIndex);
    if (!scene.cache.audio.exists(key)) return;
    const voice = scene.sound.add(key, {
      volume: scaledSfxVolume(
        0.5 * 10 ** (selected.offsetDb / 20),
        loadAudioSettings(),
      ),
    });
    this.characterSelectionVoice = voice;
    voice.once("complete", () => {
      if (this.characterSelectionVoice === voice)
        this.characterSelectionVoice = undefined;
      voice.destroy();
    });
    voice.play();
  }

  public stopCharacterSelectionVoice(): void {
    const voice = this.characterSelectionVoice;
    this.characterSelectionVoice = undefined;
    if (voice === undefined || voice.pendingRemove) return;
    voice.stop();
    voice.destroy();
  }

  public playStageHazard(scene: Phaser.Scene): void {
    if (this.lobbyMusic?.isPlaying) this.lobbyMusic.pause();
    if (
      this.stageHazardMusic === undefined ||
      this.stageHazardMusic.pendingRemove
    ) {
      this.stageHazardMusic = scene.sound.add(
        GAME_AUDIO_KEYS.music.stageHazard,
        {
          loop: true,
          volume: this.hazardVolume(),
        },
      ) as AdjustableSound;
    }
    if (!this.stageHazardMusic.isPlaying) {
      this.stageHazardMusic.play({ loop: true, volume: this.hazardVolume() });
    }
  }

  public stopStageHazard(): void {
    const music = this.stageHazardMusic;
    this.stageHazardMusic = undefined;
    if (music === undefined || music.pendingRemove) return;
    music.stop();
    music.destroy();
  }

  public stopMusic(): void {
    const lobby = this.lobbyMusic;
    this.lobbyMusic = undefined;
    if (lobby !== undefined && !lobby.pendingRemove) {
      lobby.stop();
      lobby.destroy();
    }
    this.stopStageHazard();
  }

  private lobbyVolume(): number {
    return loadAudioSettings().musicVolume * 0.225;
  }

  private hazardVolume(): number {
    return loadAudioSettings().musicVolume * 0.5;
  }
}

export const gameAudio = new GameAudioDirector();

// The music control and Settings screen both save audio settings; follow them live.
window.addEventListener(AUDIO_SETTINGS_EVENT, () => gameAudio.updateMusicVolume());

function weightedVariantIndex(
  variants: readonly CharacterVoiceVariant[],
): number {
  const totalWeight = variants.reduce(
    (total, variant) => total + variant.weight,
    0,
  );
  let roll = Math.random() * totalWeight;
  for (let index = 0; index < variants.length; index += 1) {
    roll -= variants[index]!.weight;
    if (roll <= 0) return index;
  }
  return variants.length - 1;
}
