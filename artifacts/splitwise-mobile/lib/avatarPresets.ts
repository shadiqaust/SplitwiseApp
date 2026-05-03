// Local, bundled avatar presets. Stored in user / group records as
// `preset:<id>` strings instead of remote URLs, so we never depend on an
// external image host at runtime and the images ship inside the app bundle.

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

export const GROUP_AVATAR_PRESETS: AvatarPreset[] = [
  { id: "bottts-alpha",            label: "Alpha",       source: require("@/assets/group-avatars/bottts-alpha.png") },
  { id: "bottts-beta",             label: "Beta",        source: require("@/assets/group-avatars/bottts-beta.png") },
  { id: "bottts-gamma",            label: "Gamma",       source: require("@/assets/group-avatars/bottts-gamma.png") },
  { id: "bottts-delta",            label: "Delta",       source: require("@/assets/group-avatars/bottts-delta.png") },
  { id: "thumbs-hike",             label: "Hike",        source: require("@/assets/group-avatars/thumbs-hike.png") },
  { id: "thumbs-trip",             label: "Trip",        source: require("@/assets/group-avatars/thumbs-trip.png") },
  { id: "thumbs-squad",            label: "Squad",       source: require("@/assets/group-avatars/thumbs-squad.png") },
  { id: "thumbs-crew",             label: "Crew",        source: require("@/assets/group-avatars/thumbs-crew.png") },
  { id: "pixel-art-house",         label: "House",       source: require("@/assets/group-avatars/pixel-art-house.png") },
  { id: "pixel-art-flat",          label: "Flat",        source: require("@/assets/group-avatars/pixel-art-flat.png") },
  { id: "pixel-art-family",        label: "Family",      source: require("@/assets/group-avatars/pixel-art-family.png") },
  { id: "pixel-art-work",          label: "Work",        source: require("@/assets/group-avatars/pixel-art-work.png") },
  { id: "adventurer-voyage",       label: "Voyage",      source: require("@/assets/group-avatars/adventurer-voyage.png") },
  { id: "adventurer-explorer",     label: "Explorer",    source: require("@/assets/group-avatars/adventurer-explorer.png") },
  { id: "adventurer-nomad",        label: "Nomad",       source: require("@/assets/group-avatars/adventurer-nomad.png") },
  { id: "adventurer-trailblazer",  label: "Trailblazer", source: require("@/assets/group-avatars/adventurer-trailblazer.png") },
];

const PRESET_PREFIX = "preset:";

const ALL_PRESETS_BY_ID: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const p of AVATAR_PRESETS) map[p.id] = p.source;
  for (const p of GROUP_AVATAR_PRESETS) map[p.id] = p.source;
  return map;
})();

export function presetIdToAvatarUrl(id: string): string {
  return `${PRESET_PREFIX}${id}`;
}

/** If `url` is a `preset:<id>` marker, return the bundled require() source.
 *  Otherwise returns null (caller should treat it as a remote URI / data URL). */
export function resolvePresetSource(url: string | null | undefined): number | null {
  if (!url || !url.startsWith(PRESET_PREFIX)) return null;
  const id = url.slice(PRESET_PREFIX.length);
  return ALL_PRESETS_BY_ID[id] ?? null;
}
