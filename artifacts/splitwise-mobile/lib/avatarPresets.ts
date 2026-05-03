// Local, bundled avatar presets. Stored in the user record as
// `preset:<id>` strings (e.g. "preset:adventurer-felix") instead of remote
// URLs, so we never depend on an external image host at runtime and the
// images ship inside the app bundle.

export interface AvatarPreset {
  id: string;
  label: string;
  source: number;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "avataaars-alice",    label: "Alice",   source: require("@/assets/avatars/avataaars-alice.png") },
  { id: "avataaars-bob",      label: "Bob",     source: require("@/assets/avatars/avataaars-bob.png") },
  { id: "avataaars-charlie",  label: "Charlie", source: require("@/assets/avatars/avataaars-charlie.png") },
  { id: "avataaars-diana",    label: "Diana",   source: require("@/assets/avatars/avataaars-diana.png") },
  { id: "fun-emoji-alex",     label: "Alex",    source: require("@/assets/avatars/fun-emoji-alex.png") },
  { id: "fun-emoji-sam",      label: "Sam",     source: require("@/assets/avatars/fun-emoji-sam.png") },
  { id: "fun-emoji-jordan",   label: "Jordan",  source: require("@/assets/avatars/fun-emoji-jordan.png") },
  { id: "fun-emoji-casey",    label: "Casey",   source: require("@/assets/avatars/fun-emoji-casey.png") },
  { id: "adventurer-felix",   label: "Felix",   source: require("@/assets/avatars/adventurer-felix.png") },
  { id: "adventurer-luna",    label: "Luna",    source: require("@/assets/avatars/adventurer-luna.png") },
  { id: "adventurer-rider",   label: "Rider",   source: require("@/assets/avatars/adventurer-rider.png") },
  { id: "adventurer-max",     label: "Max",     source: require("@/assets/avatars/adventurer-max.png") },
  { id: "pixel-art-river",    label: "River",   source: require("@/assets/avatars/pixel-art-river.png") },
  { id: "pixel-art-sage",     label: "Sage",    source: require("@/assets/avatars/pixel-art-sage.png") },
  { id: "pixel-art-sky",      label: "Sky",     source: require("@/assets/avatars/pixel-art-sky.png") },
  { id: "pixel-art-storm",    label: "Storm",   source: require("@/assets/avatars/pixel-art-storm.png") },
];

const PRESET_PREFIX = "preset:";

export function presetIdToAvatarUrl(id: string): string {
  return `${PRESET_PREFIX}${id}`;
}

/** If `url` is a `preset:<id>` marker, return the bundled require()
 *  source. Otherwise return null (caller should treat it as a remote URI
 *  or data URL). */
export function resolvePresetSource(url: string | null | undefined): number | null {
  if (!url || !url.startsWith(PRESET_PREFIX)) return null;
  const id = url.slice(PRESET_PREFIX.length);
  const match = AVATAR_PRESETS.find((p) => p.id === id);
  return match ? match.source : null;
}
