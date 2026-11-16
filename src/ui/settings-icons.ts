/** Supplied settings artwork. Row ids keep decorative art separate from actions. */
import name from "./settings-icons/name.webp";
import signOut from "./settings-icons/sign-out.webp";
import sound from "./settings-icons/sound.webp";
import music from "./settings-icons/music.webp";
import vibration from "./settings-icons/vibration.webp";
import howToPlay from "./settings-icons/how-to-play.webp";
import tutorial from "./settings-icons/replay-the-tutorial.webp";
import progress from "./settings-icons/where-your-progress-lives.webp";
import backup from "./settings-icons/backup-code.webp";
import restore from "./settings-icons/restore-a-colony.webp";
import reset from "./settings-icons/reset-everything.webp";
import "./settings-icons.css";

const ART: Readonly<Record<string, string>> = {
  setNameRow: name,
  setSignOut: signOut,
  setSound: sound,
  setMusic: music,
  setHaptics: vibration,
  setRules: howToPlay,
  setTutorial: tutorial,
  setKeepSafe: progress,
  setBackupRow: backup,
  setRestoreRow: restore,
  setReset: reset,
  setDelete: reset,
};

export function settingsIcon(rowId: string): HTMLImageElement | null {
  const source = ART[rowId];
  if (!source) return null;
  const image = document.createElement("img");
  image.className = "settings-icon";
  image.src = source;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.width = 34;
  image.height = 34;
  image.decoding = "async";
  return image;
}
