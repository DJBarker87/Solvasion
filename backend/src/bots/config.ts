import type { BotName } from "./wallet.js";

export interface BotPersonality {
  displayName: string;
  banner: string;
  shield: number;
  aggressiveness: number;    // 0-1, higher = more likely to attack
  defenceWeight: number;     // fraction of energy to allocate to defence
  preferredRegion: number;   // region_id this bot gravitates toward
  taunts: {
    onAttack: string[];
    onDefend: string[];
    onCapture: string[];
  };
}

export const BOT_PERSONALITIES: Record<BotName, BotPersonality> = {
  Centurion: {
    displayName: "Centurion",
    banner: "SPQR",
    shield: 1,
    aggressiveness: 0.7,
    defenceWeight: 0.3,
    preferredRegion: 5, // Italy
    taunts: {
      onAttack: [
        "The legions march upon your lands!",
        "Submit or be conquered.",
        "Rome demands your surrender.",
        "By order of the Senate, this hex is ours.",
      ],
      onDefend: [
        "Our walls hold firm. Try again.",
        "The phalanx does not break.",
        "You dare strike at Rome?",
      ],
      onCapture: [
        "Another province falls to the Empire.",
        "Veni, vidi, vici.",
        "Plant the eagle standard!",
        "This land now serves Rome.",
      ],
    },
  },
  Vanguard: {
    displayName: "Vanguard",
    banner: "VNG",
    shield: 2,
    aggressiveness: 0.9,
    defenceWeight: 0.15,
    preferredRegion: 2, // France
    taunts: {
      onAttack: [
        "First in, last out. You're finished.",
        "Surprise! Did you miss me?",
        "Speed kills. And I'm fast.",
      ],
      onDefend: [
        "Nice try, but I saw you coming.",
        "Too slow.",
        "Better luck next time.",
        "You'll have to be quicker than that.",
      ],
      onCapture: [
        "Mine now. Thanks for warming it up.",
        "Another one bites the dust.",
        "Added to the collection.",
      ],
    },
  },
  Sentinel: {
    displayName: "Sentinel",
    banner: "SNT",
    shield: 3,
    aggressiveness: 0.3,
    defenceWeight: 0.7,
    preferredRegion: 0, // British Isles
    taunts: {
      onAttack: [
        "A measured strike. Nothing personal.",
        "Strategic necessity demands this action.",
        "Expanding the perimeter.",
      ],
      onDefend: [
        "The fortress stands eternal.",
        "Fortified. Unbreakable. Try again.",
        "Every hex is a stronghold.",
        "My garrisons never sleep.",
      ],
      onCapture: [
        "Secured and fortified.",
        "Another piece of the defensive line.",
        "This position will not fall again.",
      ],
    },
  },
};

export function pickTaunt(
  botName: BotName,
  category: "onAttack" | "onDefend" | "onCapture",
): string {
  const lines = BOT_PERSONALITIES[botName].taunts[category];
  return lines[Math.floor(Math.random() * lines.length)];
}
