// Local, bundled avatar presets. Stored in user / group records as
// `preset:<id>` strings (e.g. "preset:adventurer-felix") instead of remote
// URLs, so the app never depends on an external image host at runtime.
// The same `preset:<id>` namespace is shared with the mobile app — see
// artifacts/splitwise-mobile/lib/avatarPresets.ts.

import avataaarsAlice   from "@/assets/avatars/avataaars-alice.png";
import avataaarsBob     from "@/assets/avatars/avataaars-bob.png";
import avataaarsCharlie from "@/assets/avatars/avataaars-charlie.png";
import avataaarsDiana   from "@/assets/avatars/avataaars-diana.png";
import funEmojiAlex     from "@/assets/avatars/fun-emoji-alex.png";
import funEmojiSam      from "@/assets/avatars/fun-emoji-sam.png";
import funEmojiJordan   from "@/assets/avatars/fun-emoji-jordan.png";
import funEmojiCasey    from "@/assets/avatars/fun-emoji-casey.png";
import adventurerFelix  from "@/assets/avatars/adventurer-felix.png";
import adventurerLuna   from "@/assets/avatars/adventurer-luna.png";
import adventurerRider  from "@/assets/avatars/adventurer-rider.png";
import adventurerMax    from "@/assets/avatars/adventurer-max.png";
import pixelArtRiver    from "@/assets/avatars/pixel-art-river.png";
import pixelArtSage     from "@/assets/avatars/pixel-art-sage.png";
import pixelArtSky      from "@/assets/avatars/pixel-art-sky.png";
import pixelArtStorm    from "@/assets/avatars/pixel-art-storm.png";

import botttsAlpha     from "@/assets/group-avatars/bottts-alpha.png";
import botttsBeta      from "@/assets/group-avatars/bottts-beta.png";
import botttsGamma     from "@/assets/group-avatars/bottts-gamma.png";
import botttsDelta     from "@/assets/group-avatars/bottts-delta.png";
import thumbsHike      from "@/assets/group-avatars/thumbs-hike.png";
import thumbsTrip      from "@/assets/group-avatars/thumbs-trip.png";
import thumbsSquad     from "@/assets/group-avatars/thumbs-squad.png";
import thumbsCrew      from "@/assets/group-avatars/thumbs-crew.png";
import pixelArtHouse   from "@/assets/group-avatars/pixel-art-house.png";
import pixelArtFlat    from "@/assets/group-avatars/pixel-art-flat.png";
import pixelArtFamily  from "@/assets/group-avatars/pixel-art-family.png";
import pixelArtWork    from "@/assets/group-avatars/pixel-art-work.png";
import advVoyage       from "@/assets/group-avatars/adventurer-voyage.png";
import advExplorer     from "@/assets/group-avatars/adventurer-explorer.png";
import advNomad        from "@/assets/group-avatars/adventurer-nomad.png";
import advTrailblazer  from "@/assets/group-avatars/adventurer-trailblazer.png";

export interface AvatarPreset {
  id: string;
  label: string;
  src: string;
}

export const USER_AVATAR_PRESETS: AvatarPreset[] = [
  { id: "avataaars-alice",   label: "Alice",   src: avataaarsAlice },
  { id: "avataaars-bob",     label: "Bob",     src: avataaarsBob },
  { id: "avataaars-charlie", label: "Charlie", src: avataaarsCharlie },
  { id: "avataaars-diana",   label: "Diana",   src: avataaarsDiana },
  { id: "fun-emoji-alex",    label: "Alex",    src: funEmojiAlex },
  { id: "fun-emoji-sam",     label: "Sam",     src: funEmojiSam },
  { id: "fun-emoji-jordan",  label: "Jordan",  src: funEmojiJordan },
  { id: "fun-emoji-casey",   label: "Casey",   src: funEmojiCasey },
  { id: "adventurer-felix",  label: "Felix",   src: adventurerFelix },
  { id: "adventurer-luna",   label: "Luna",    src: adventurerLuna },
  { id: "adventurer-rider",  label: "Rider",   src: adventurerRider },
  { id: "adventurer-max",    label: "Max",     src: adventurerMax },
  { id: "pixel-art-river",   label: "River",   src: pixelArtRiver },
  { id: "pixel-art-sage",    label: "Sage",    src: pixelArtSage },
  { id: "pixel-art-sky",     label: "Sky",     src: pixelArtSky },
  { id: "pixel-art-storm",   label: "Storm",   src: pixelArtStorm },
];

export const GROUP_AVATAR_PRESETS: AvatarPreset[] = [
  { id: "bottts-alpha",           label: "Alpha",       src: botttsAlpha },
  { id: "bottts-beta",            label: "Beta",        src: botttsBeta },
  { id: "bottts-gamma",           label: "Gamma",       src: botttsGamma },
  { id: "bottts-delta",           label: "Delta",       src: botttsDelta },
  { id: "thumbs-hike",            label: "Hike",        src: thumbsHike },
  { id: "thumbs-trip",            label: "Trip",        src: thumbsTrip },
  { id: "thumbs-squad",           label: "Squad",       src: thumbsSquad },
  { id: "thumbs-crew",            label: "Crew",        src: thumbsCrew },
  { id: "pixel-art-house",        label: "House",       src: pixelArtHouse },
  { id: "pixel-art-flat",         label: "Flat",        src: pixelArtFlat },
  { id: "pixel-art-family",       label: "Family",      src: pixelArtFamily },
  { id: "pixel-art-work",         label: "Work",        src: pixelArtWork },
  { id: "adventurer-voyage",      label: "Voyage",      src: advVoyage },
  { id: "adventurer-explorer",    label: "Explorer",    src: advExplorer },
  { id: "adventurer-nomad",       label: "Nomad",       src: advNomad },
  { id: "adventurer-trailblazer", label: "Trailblazer", src: advTrailblazer },
];

const PRESET_PREFIX = "preset:";

const ALL_PRESETS_BY_ID: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const p of USER_AVATAR_PRESETS) map[p.id] = p.src;
  for (const p of GROUP_AVATAR_PRESETS) map[p.id] = p.src;
  return map;
})();

export function presetIdToAvatarUrl(id: string): string {
  return `${PRESET_PREFIX}${id}`;
}

/** If `url` is a `preset:<id>` marker, return the bundled image URL.
 *  Otherwise returns the original url (so http(s)/data: URLs pass through). */
export function resolveAvatarUrl(url: string | null | undefined): string | null | undefined {
  if (!url || !url.startsWith(PRESET_PREFIX)) return url;
  const id = url.slice(PRESET_PREFIX.length);
  return ALL_PRESETS_BY_ID[id] ?? url;
}
