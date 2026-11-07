/**
 * AVATARS — who the player is, and how each one is come by.
 *
 * There are ninety-eight painted faces (`src/ui/avatars/`), and they are the first thing
 * in this app a player collects that is about THEM rather than about a colony. A skin
 * says what the Fire Ant looks like; an avatar is the picture beside your own name, so it
 * belongs to the save rather than to a species and it is never worn by an opponent.
 *
 * THEY ARRIVE THREE WAYS, and the split is the whole of this file:
 *
 *   TEN are there from the first launch (`FREE_AVATARS`). A player who has just arrived
 *   has to be able to choose a face, and a picker with one entry is not a choice. They
 *   are deliberately the PLAIN ones — ordinary workers in a range of colours, nothing
 *   with a costume or a prop — so that none of them reads as something that was earned.
 *
 *   FIFTY are on the COLONY ROAD, one per chapter (`roadAvatar`), and that is the half
 *   this was asked for: "50 best ones available in colony road, one per each chapter".
 *   They are ordered to climb — small charm early, the showpieces in the last ten — so
 *   the road hands out something visibly better the further it is walked.
 *
 *   THE REST — thirty-eight — are the LUCKY HATCH's lowest rung (`HATCH_AVATARS`).
 *
 * THE ORDER IN `ROAD_AVATARS` IS THE ONLY THING THAT DECIDES WHICH CHAPTER PAYS WHICH,
 * and the three lists are the only thing that decides how an avatar is come by. Moving an
 * id between them, or along the road, is an edit to this file and to nothing else — which
 * matters because "the best ones" is a judgement about pictures that only a person
 * looking at them can make. There is no second table anywhere to keep in step.
 */
import { TIER_IDS } from "../engine";
import type { TierId } from "../engine";

/**
 * EVERY AVATAR THERE IS, and the id IS the filename (`av43` ⇢ `avatars/av43.webp`).
 *
 * Numbered from the set they were delivered in rather than renumbered 1..98: a save holds
 * these strings for the life of a colony, so renumbering the table would silently hand
 * every player a different face. The gaps (95, 123) are gaps in the delivered set.
 */
export const AVATAR_IDS: readonly string[] = [
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  90, 91, 92, 93, 94, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
  109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 124, 125,
  126, 127, 128, 129,
].map((n) => `av${n}`);

/**
 * THE TEN A NEW COLONY ALREADY HAS.
 *
 * Plain workers, one in each of the colours the set offers — a gold, a black, a brown, a
 * green, a grey, a red, a white, an orange, a worker with a seed and a blue flier. None
 * of them wears a costume, which is the rule: a starter face that looked like a prize
 * would make the fifty on the road look like more of the same.
 *
 * They are never STORED as found, for the reason a basic look is not (`skinsAndLooks` in
 * `profile.ts`): they are not something that happened to a player, and putting them in
 * the set would make "how many avatars have I collected" start at ten for everybody.
 */
export const FREE_AVATARS: readonly string[] =
  [83, 46, 54, 57, 36, 94, 71, 85, 84, 59].map((n) => `av${n}`);

/**
 * THE FACE A COLONY WEARS BEFORE IT HAS CHOSEN ONE, and it is a real painting.
 *
 * The app has always drawn a generic worker into the avatar disc — three blobs and two
 * eyes, ported from the legacy build — which reads fine at thirty pixels and like a
 * placeholder at ninety-six. There is no reason for it now: a brand-new colony already
 * HAS ten faces, so it can wear the plainest of them from the first launch and the drawn
 * one is left as what shows when a FILE is missing, which is the folder's own fallback.
 *
 * `profile.avatar` still stores null for "has not chosen" — two ways to spell one state
 * is two states to keep in step, and this is the `lookFor` shape: the save holds the
 * choice, and the accessor is never null.
 */
export const DEFAULT_AVATAR: string = FREE_AVATARS[0] as string;

/**
 * WHAT EACH FACE IS CALLED.
 *
 * Asked for directly, with the picker's hero in mind: "instead of the road name it has
 * to be the name of the icon — look at every icon and give it a name based on what's on
 * it, make some fun names, not classic."
 *
 * So these are read off the PICTURES, one at a time, and they are the one thing in this
 * file that cannot be derived from anything: a name is a judgement about a drawing, the
 * same way the ORDER of `ROAD_AVATARS` is. A bedsheet ghost, a snail with a moon on its
 * shell, an ant that has been in amber since the Cretaceous — the name says what you are
 * looking at and has a bit of fun doing it, because ninety-eight entries of "Red Ant 14"
 * is a spreadsheet rather than a collection.
 *
 * They live here rather than in `ui/` for the reason the three lists do: this file is
 * the one table of what an avatar IS, it holds no url, and a second table anywhere would
 * be a second place to keep in step. A test holds that every id has a name and that no
 * two share one — two faces with one name is a collection a player cannot talk about.
 */
const AVATAR_NAMES: Readonly<Record<string, string>> = {
  av30: "Scout Dustgoggle", av31: "Bedsheet Boo",
  av32: "Toadstool Trickster", av33: "Gemjaw the Grim",
  av34: "The Acorn Inn", av35: "Pillowfluff Moth",
  av36: "Grumpy Rollypoly", av37: "Dewdrop Hoodling",
  av38: "Pocketful of Pollen", av39: "The Last Berry",
  av40: "Admiral Breadcrumb", av41: "Snowfluff Jumper",
  av42: "Thunderquiff", av43: "The Thornheart Crystal",
  av44: "Nightlight Napper", av45: "Spotty Speedster",
  av46: "Bad Mood Bitey", av47: "The Petal Assassin",
  av48: "Nutbolt the Fixer", av49: "Professor Pagefeeler",
  av50: "Velvet Troublemaker", av51: "Moonshell Dozer",
  av52: "Sealed by the Queen", av53: "Boulder-Shover Scarab",
  av54: "Snaggletooth", av55: "Pharaoh of Crumbs",
  av56: "Peacock Showoff", av57: "Jade Snapjaw",
  av58: "Bongo Marchmaster", av59: "Blue Buzzbolt",
  av60: "Travelling Lutebug", av61: "The Honeylamp Hood",
  av62: "Stuck Since Forever", av63: "The Stargazing Shroom",
  av64: "Lucky Little Jester", av65: "Pickaxe Tunneller",
  av66: "The Fern Compass", av67: "Daydream Butterfly",
  av68: "Hammerhorn", av69: "Deep Bubble Diver",
  av70: "General Grumpyboots", av71: "Frosty Seedhauler",
  av72: "Berry Tart Baker", av73: "Mister Longsnoot",
  av74: "Jade Temple Guard", av75: "Acorn Ninja",
  av76: "Glasswing Drifter", av77: "Jellybean Spider",
  av78: "Rainy Day Bloomhead", av79: "The Blueberry Haul",
  av80: "The Twig Sail", av81: "Hardhat Hammerhand",
  av82: "The Sun Pharaoh", av83: "Just a Happy Worker",
  av84: "Seed Hugger", av85: "Blue Scarf Worker",
  av86: "Magmacrack", av87: "Frostcrown",
  av88: "The Fossil Fern", av89: "Pink Cap Lurker",
  av90: "Thistle Bringer", av91: "Bubblegum Beetle",
  av92: "Quill and Ledger", av93: "Splotchy Painter",
  av94: "Dewdrop Crown", av96: "The Walnut Submarine",
  av97: "Flower Hat Pathfinder", av98: "Frosting Swirler",
  av99: "Eggshell Warbeater", av100: "Circus Rollball",
  av101: "Scrollwing Messenger", av102: "Always On Time",
  av103: "Racing Rhino", av104: "Ice Cream Scooper",
  av105: "Cherry Jester", av106: "Masked Luchador",
  av107: "Fossil Brusher", av108: "Bubbling Tinkerer",
  av109: "Biker Fuzz", av110: "Orchid Songstress",
  av111: "Seedpod Pilot", av112: "Mailbox Postie",
  av113: "Carved Mask Dancer", av114: "Storm in a Jar",
  av115: "Pancake Flipper", av116: "Sleepy Tea Sipper",
  av117: "Fungal Sceptre Bearer", av118: "Megaphone Buccaneer",
  av119: "Clockwork Keyback", av120: "Mothcloak Oracle",
  av121: "Top Hat Conjurer", av122: "Acorn Referee",
  av124: "Desert Longnose", av125: "Peacock Fan Dancer",
  av126: "Maestro Croak", av127: "Drummer Hopper",
  av128: "Fiddling Grasshopper", av129: "Spotted Potioneer",
};

/**
 * The name to print, and never an empty string.
 *
 * An id with no entry falls back to the id itself rather than to nothing: a hero with a
 * blank line under it reads as a screen that failed, where `av43` reads as a face whose
 * name has not been written yet — the same null-fallback shape the art folder uses.
 */
export const avatarName = (id: string): string => AVATAR_NAMES[id] ?? id;

/** The face to DRAW: the one chosen, or the one every colony starts behind. */
export const faceOf = (chosen: string | null | undefined): string =>
  chosen ?? DEFAULT_AVATAR;

/**
 * THE FIFTY ON THE ROAD, in chapter order — index 0 is chapter 1, index 49 is chapter 50.
 *
 * The climb is deliberate: a ladybird and a moth early, then trades and travellers through
 * the middle, and the last ten are the ones worth walking fifty chapters for — the
 * admiral, the pirate, the magician, the carnival, the peacock spider, the pharaoh and the
 * crystal at the end of it.
 */
export const ROAD_AVATARS: readonly string[] = [
  45, 35, 37, 90, 44, 76, 73, 67, 91, 78,
  49, 92, 60, 58, 116, 104, 115, 117, 72, 93,
  112, 111, 102, 97, 48, 65, 81, 107, 69, 96,
  30, 103, 109, 119, 108, 75, 50, 68, 42, 47,
  128, 31, 32, 70, 118, 121, 106, 125, 82, 43,
].map((n) => `av${n}`);

/**
 * WHAT IS LEFT, which is what the hatch pays — derived rather than written out.
 *
 * A third hand-kept list would be a third chance for an id to end up in two places at
 * once, or in none: an avatar in both the road and the hatch is one a player can be paid
 * twice, and one in neither is a file that ships and can never be had.
 */
export const HATCH_AVATARS: readonly string[] = AVATAR_IDS.filter(
  (id) => !FREE_AVATARS.includes(id) && !ROAD_AVATARS.includes(id),
);

/** Whether this is an avatar the table knows about. A save can hold anything. */
export const isAvatar = (id: string): boolean => AVATAR_IDS.includes(id);

/** Whether every colony has this one from the start. */
export const isFreeAvatar = (id: string): boolean => FREE_AVATARS.includes(id);

/**
 * The avatar a chapter of the road pays, or null outside the road.
 *
 * One per chapter, which is what makes walking the whole road a complete-ish collection
 * on its own: fifty faces, plus the ten that were always there.
 */
export const roadAvatar = (chapter: number): string | null =>
  ROAD_AVATARS[chapter - 1] ?? null;

/**
 * THE TIER AN AVATAR COMES OUT OF, and it is the BOTTOM of the ladder.
 *
 * This is the skin rule stood on its head and it is deliberately the same mechanism
 * (`platform/skins.ts`). A skin is the TOP two rungs, so a roll there pays a skin while
 * one is locked; an avatar is the LOWEST rung, so a common roll pays an avatar while one
 * is locked. Neither needs a chance of its own, which is the only way the odds printed on
 * the hatch screen can be the odds the game actually uses — there is no second number
 * anywhere that can drift out of step with them.
 *
 * Derived from `TIER_IDS` rather than typed, so a retune of the ladder cannot leave this
 * pointing at a rung that is no longer the bottom one.
 */
export const AVATAR_TIER: TierId = TIER_IDS[0];

/** Whether a tier roll is one an avatar can come out of. */
export const avatarTier = (tier: TierId): boolean => tier === AVATAR_TIER;

/**
 * Every avatar this player could still find in the hatch.
 *
 * The ROAD's fifty are not in here: those are paid for by walking, and a hatch that could
 * also pay one would make the chapter it belongs to hand out nothing. Nor are the free
 * ten, for the obvious reason.
 */
export const lockedAvatars = (found: readonly string[]): readonly string[] => {
  const has = new Set(found);
  return HATCH_AVATARS.filter((id) => !has.has(id));
};

/**
 * One avatar out of the hatch pool, or null when there is none left to find.
 *
 * Null is not a failure — it is what makes a finished collection fall back to a common
 * TRAIT instead of eating the larva, so the last avatar found is never the moment the
 * hatch got worse. Exactly what `rollSkin` does at the other end of the ladder.
 */
export function rollAvatar(
  random: () => number, found: readonly string[],
): string | null {
  const pool = lockedAvatars(found);
  return pool[Math.floor(random() * pool.length)] ?? null;
}

/** How far the collection has come: held, out of all there are. */
export const avatarProgress = (
  found: readonly string[],
): { has: number; of: number } => ({
  has: new Set([...FREE_AVATARS, ...found.filter(isAvatar)]).size,
  of: AVATAR_IDS.length,
});
