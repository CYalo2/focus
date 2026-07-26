// mm:ss while a minute or more remains; switches to seconds with 2 decimal places
// once under a minute, since mm:ss stops being precise enough to be useful right
// when precision starts to matter most. Shared by ui/Hud.js (the in-level countdown)
// and scenes/LevelSelectScene.js (time limits and best times in the level details).
export function formatTime(ms) {
  if (ms < 60000) {
    return (ms / 1000).toFixed(2);
  }
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}