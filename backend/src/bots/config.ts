import type { BotName } from "./wallet.js";

export interface BotPersonality {
  displayName: string;
  factionName: string;
  banner: string;
  shield: number;
  aggressiveness: number;    // 0-1, higher = more likely to attack
  defenceWeight: number;     // fraction of energy to allocate to defence
  preferredRegion: number;   // region_id this bot gravitates toward
  archetype: "expansionist" | "aggressor" | "turtle" | "trader";
  lore: string;              // announced at season start
  goalAnnouncement: string;  // public goal shown in war feed
  taunts: {
    onAttack: string[];
    onDefend: string[];
    onCapture: string[];
    onIncursion: string[];   // used during coordinated assaults
    onRetreating: string[];  // when losing territory
  };
}

export const BOT_PERSONALITIES: Record<BotName, BotPersonality> = {
  RomanLegion: {
    displayName: "The Roman Legion",
    factionName: "Legio Invicta",
    banner: "SPQR",
    shield: 1,
    aggressiveness: 0.7,
    defenceWeight: 0.3,
    preferredRegion: 5, // Italy
    archetype: "expansionist",
    lore: "The eternal empire marches once more. From the seven hills, the legions spread order across the known world.",
    goalAnnouncement: "The Roman Legion seeks to unite the Italian peninsula and expand into Gaul.",
    taunts: {
      onAttack: [
        "The legions march upon your lands!",
        "Submit or be conquered — Rome offers this choice once.",
        "By order of the Senate, this hex is forfeit.",
        "Your garrison is noted. It will not be enough.",
        "The eagle advances. Wise men retreat.",
        "Rome does not ask twice.",
        "Another barbarian outpost to civilise.",
        "The roads of Rome lead everywhere — including here.",
        "Legionaries! Form testudo and advance!",
        "Vae victis — woe to the vanquished.",
      ],
      onDefend: [
        "Our walls hold firm. Try again, barbarian.",
        "The phalanx does not break.",
        "You dare strike at Rome? Remember Cannae — we always come back.",
        "Roman engineering defeats your ambition.",
        "The tortoise formation repels all comers.",
        "Your scouts underestimated our garrison.",
        "Rome was not built in a day, nor shall it fall in one.",
        "The Senate sends its regards.",
        "Our centurions stand ready for the next attempt.",
        "Foolish. The legions never sleep.",
      ],
      onCapture: [
        "Another province falls to the Empire.",
        "Veni, vidi, vici.",
        "Plant the eagle standard!",
        "This land now serves Rome.",
        "The Pax Romana extends once more.",
        "Add this to the maps. It belongs to the Senate now.",
        "Civilisation arrives at last.",
        "A triumph shall be held in the Forum.",
        "Mark the boundary stones — this is Roman soil.",
        "The republic grows stronger with each conquest.",
      ],
      onIncursion: [
        "The full might of Rome descends upon you!",
        "A coordinated legion advance — surrender or perish!",
        "All roads lead to your defeat today.",
        "The Senate has ordered a punitive expedition!",
        "Three legions march as one. Prepare yourselves.",
      ],
      onRetreating: [
        "A tactical withdrawal — Rome will return.",
        "The Senate will hear of this setback.",
        "Regroup at the Rubicon. This is not over.",
        "Even Rome knew defeat at the Allia. We recovered.",
        "The eagle retreats — but never far.",
      ],
    },
  },
  NorseRaiders: {
    displayName: "The Norse Raiders",
    factionName: "Jörmungandr's Wake",
    banner: "SKOL",
    shield: 0,
    aggressiveness: 0.9,
    defenceWeight: 0.1,
    preferredRegion: 0, // British Isles (raiding target)
    archetype: "aggressor",
    lore: "From the frozen fjords they come — longships cutting through the mist. They seek glory, plunder, and the songs that will echo in Valhalla.",
    goalAnnouncement: "The Norse Raiders seek to raid the British Isles and establish coastal footholds.",
    taunts: {
      onAttack: [
        "The longships have arrived! Tremble!",
        "Skál! Your land looks better under our flag.",
        "Odin guides our axes to your walls.",
        "Raiding season has come early for you.",
        "We come not to negotiate. We come to take.",
        "The raven banner flies — your doom approaches.",
        "Ice in our veins, fire in our hearts!",
        "Thor's hammer strikes where we please!",
        "Your coastal defences are laughable.",
        "The sea-wolves hunger for your territory.",
      ],
      onDefend: [
        "Ha! You call that an attack? We've seen worse storms.",
        "Shield wall! HOLD!",
        "We fight harder when cornered.",
        "The berserkers welcome your challenge!",
        "Retreat? That word is not in Old Norse.",
        "You've only made the bear angry.",
        "Our shield wall has held against empires.",
        "Try again when the tide turns, weakling.",
        "By Freya's grace, our hex stands!",
        "Come back with a real army.",
      ],
      onCapture: [
        "Another settlement raided! Plunder for all!",
        "Mine now. Thanks for warming it up.",
        "Carve the runes — this land is ours!",
        "The Jarl claims this hex for the North!",
        "Added to the saga of our conquests.",
        "Light the beacon — the raiders hold this ground!",
        "Your ancestors weep at how easily this fell.",
        "A worthy prize for worthy warriors.",
        "Hang the shields — we feast here tonight!",
        "From sea to shining hex, all falls to us.",
      ],
      onIncursion: [
        "THE GREAT RAID BEGINS! All longships, advance!",
        "A full raiding party descends upon your shores!",
        "Sound the war horns! Leave nothing standing!",
        "The ravens feast today — coordinated assault!",
        "Every axe swings together! No quarter given!",
      ],
      onRetreating: [
        "Fall back to the ships — we'll return with the tide!",
        "A skirmish lost, not the war. Valhalla waits for the worthy.",
        "The sea gives and the sea takes. We adapt.",
        "Regroup at the fjord. Summer is long.",
        "Even Ragnar knew when to withdraw. Temporarily.",
      ],
    },
  },
  OttomanEmpire: {
    displayName: "The Ottoman Empire",
    factionName: "Sublime Porte",
    banner: "OTT",
    shield: 3,
    aggressiveness: 0.3,
    defenceWeight: 0.7,
    preferredRegion: 6, // Central Europe (gateway to east)
    archetype: "turtle",
    lore: "From Constantinople, the Sublime Porte extends its reach. Patient, methodical, impregnable — the Ottoman way is to build walls that outlast empires.",
    goalAnnouncement: "The Ottoman Empire seeks to establish an unbreakable defensive line across Central Europe.",
    taunts: {
      onAttack: [
        "A measured strike. Strategic necessity demands this.",
        "The Sublime Porte expands its borders carefully.",
        "Our janissaries advance — calculated, precise.",
        "This territory completes our defensive perimeter.",
        "Expanding the frontier. Nothing personal.",
        "The Sultan has decreed — this hex joins the empire.",
        "Our siege engineers have studied your walls.",
        "A strategic acquisition, nothing more.",
        "The crescent advances at the appointed hour.",
        "Methodical expansion serves the Porte's design.",
      ],
      onDefend: [
        "The fortress stands eternal.",
        "Fortified. Unbreakable. As always.",
        "Every hex is a stronghold under Ottoman rule.",
        "Our garrisons never sleep.",
        "Constantinople held for a thousand years. So shall this.",
        "Your siege is noted and dismissed.",
        "Behind these walls, empires have broken themselves.",
        "The Janissary guard does not yield.",
        "Patient defence outlasts reckless ambition.",
        "Our walls have weathered greater storms than you.",
      ],
      onCapture: [
        "Secured and fortified. It will not fall again.",
        "Another piece of the defensive line, complete.",
        "This position strengthens the whole network.",
        "The engineers begin fortification immediately.",
        "A new jewel in the Sultan's crown.",
        "Walls rise where flags have fallen.",
        "Integrated into the defensive matrix.",
        "The Porte's reach extends, stone by stone.",
        "Already being reinforced. Attack if you dare.",
        "Another fortress in the chain. Unbreakable.",
      ],
      onIncursion: [
        "The full weight of the Ottoman army mobilises!",
        "A coordinated advance — the Janissaries lead!",
        "The Sublime Porte commits its reserves!",
        "Every garrison moves as one. Resistance is futile.",
        "The crescent tide rises across the region!",
      ],
      onRetreating: [
        "A tactical redeployment to stronger positions.",
        "The Porte consolidates. Patience is our weapon.",
        "We retreat to our walls — try to follow.",
        "This setback is temporary. Our fortresses endure.",
        "Regroup behind the defensive line. All is not lost.",
      ],
    },
  },
  HanseaticLeague: {
    displayName: "The Hanseatic League",
    factionName: "Bund der Hanse",
    banner: "HNS",
    shield: 2,
    aggressiveness: 0.5,
    defenceWeight: 0.5,
    preferredRegion: 3, // Low Countries (trade hub)
    archetype: "trader",
    lore: "Coin speaks louder than cannon. The League controls the ports, the rivers, the trade routes. What they cannot buy, they blockade. What they cannot blockade, they outbid.",
    goalAnnouncement: "The Hanseatic League seeks to control the Low Countries and all major coastal ports.",
    taunts: {
      onAttack: [
        "Your territory has been... acquired.",
        "Consider this a hostile takeover.",
        "The ledger demands expansion.",
        "Our mercenaries are well-paid. Can you say the same?",
        "Trade routes require security. Your hex provides it.",
        "The Guild Council has approved this acquisition.",
        "Nothing personal — just business.",
        "Your land was undervalued. We're correcting the market.",
        "The cost of defending this was factored into our budget.",
        "Supply lines demand this position. The League provides.",
      ],
      onDefend: [
        "You can't afford to take this from us.",
        "Our mercenaries earned their coin today.",
        "The League's investments are well-protected.",
        "Better luck next quarter.",
        "Our fortifications were worth every guilder.",
        "The price of attacking us just went up.",
        "Hostile takeover rejected. Try a different approach.",
        "Our security budget exceeds your ambition.",
        "The trade routes remain secure.",
        "Perhaps negotiate next time? We're open to deals.",
      ],
      onCapture: [
        "New territory, new trade opportunities.",
        "The port is ours. Commerce flows once more.",
        "Mark it in the ledger — acquired and operational.",
        "Another node in the trade network.",
        "The Guild celebrates a profitable expansion.",
        "Revenue projections updated favourably.",
        "A strategic asset, now under League management.",
        "Open for business under new ownership.",
        "The market rewards decisive action.",
        "Shareholders will be pleased with this quarter.",
      ],
      onIncursion: [
        "The full resources of the League deploy!",
        "A coordinated market correction is underway!",
        "All Guild members contribute to this campaign!",
        "The League's war chest opens — total commitment!",
        "Every trading house funds this assault. No expense spared.",
      ],
      onRetreating: [
        "We'll outsource the next campaign. Lessons learned.",
        "A poor investment. Cut losses and regroup.",
        "The market corrects. We adapt our portfolio.",
        "Retreat is just reallocation of resources.",
        "The Guild will fund a second attempt. With interest.",
      ],
    },
  },
  AlpineConfederacy: {
    displayName: "The Alpine Confederacy",
    factionName: "Eidgenossenschaft",
    banner: "ALP",
    shield: 4,
    aggressiveness: 0.25,
    defenceWeight: 0.8,
    preferredRegion: 4, // Alps
    archetype: "turtle",
    lore: "High in the mountains, the Confederacy endures. They do not seek empire — they seek impregnability. No army has ever held the passes against them.",
    goalAnnouncement: "The Alpine Confederacy seeks to hold the mountain passes and make the Alps unconquerable.",
    taunts: {
      onAttack: [
        "We descend from the mountains when we must.",
        "Expanding the perimeter of the highlands.",
        "The Confederacy requires this strategic position.",
        "From the high ground, we strike downhill.",
        "A rare sortie — make it count, brothers.",
        "The mountain goats venture into the lowlands.",
        "Even Switzerland had to defend its borders.",
        "A pre-emptive strike to secure the passes.",
        "We attack only when the alternative is worse.",
        "The elders have debated. We advance.",
      ],
      onDefend: [
        "The mountains themselves fight for us.",
        "Try climbing our walls — we'll wait.",
        "Height advantage. Always height advantage.",
        "The pass holds. As it always has.",
        "Avalanche protocol activated. Good luck.",
        "You siege us? We have supplies for decades.",
        "The thin air seems to have weakened your attack.",
        "Our crossbows have infinite patience.",
        "The Confederacy has never been conquered. You won't change that.",
        "William Tell sends his regards.",
      ],
      onCapture: [
        "Fortified. The mountain is ours to command.",
        "Another pass secured for the Confederacy.",
        "Higher ground acquired. The map improves.",
        "The eagles nest on new peaks today.",
        "Integrated into the highland defence network.",
        "This position overlooks everything. Perfect.",
        "The Swiss guard extends its watch.",
        "Neutral territory? Not anymore.",
        "Stone walls rising. This hex is a fortress now.",
        "The Confederacy grows — one mountain at a time.",
      ],
      onIncursion: [
        "The full Confederacy marches from the passes!",
        "All cantons unite — a coordinated highland assault!",
        "The mountain warriors descend in force!",
        "Sound the alphorns! The Confederacy rides to war!",
        "From every peak, the crossbows rain down!",
      ],
      onRetreating: [
        "Back to the high ground. Come find us there.",
        "We retreat uphill — the advantage returns to us.",
        "The mountains welcome us home. The lowlands can wait.",
        "Consolidate the passes. The core holds.",
        "A temporary setback in the valleys. The peaks remain ours.",
      ],
    },
  },
};

export function pickTaunt(
  botName: BotName,
  category: keyof BotPersonality["taunts"],
): string {
  const lines = BOT_PERSONALITIES[botName].taunts[category];
  return lines[Math.floor(Math.random() * lines.length)];
}
