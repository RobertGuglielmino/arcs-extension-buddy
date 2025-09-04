import { GameData, GeneralData, PlayerData, RESOURCES, TITLES, Fates } from "@robertguglielmino/arcs-types";


// Input JSON interface
interface InputJSON {
    campaign: boolean;
    players: Array<{
        name?: string;
        color: string;
        initiative: boolean;
        power: number;
        resources: (string | null)[];
        outrage: any[];
        cities: number;
        spaceports: number;
        ships: number;
        agents: number;
        cards: string[];
        court: string[];
        objective?: number;
        titles: string[];
    }>;
    ambitions: Array<{
        id: string;
        declared: string[];
        ranking: number[];
    }>;
    court: Array<{
        id: string;
        influence: number[];
    }>;
    discard: string[];
    edicts: string[];
    laws: string[];
}


export function convertJSONToGameData(input: InputJSON): GameData {
    const players = input.players;
    const ambitions = input.ambitions;
    const court = input.court;
    
    const getAmbitionRanking = (id: string): number[] => {
        const ambition = ambitions.find(a => a.id === id);
        return ambition ? ambition.ranking : new Array(players.length).fill(0);
    };

    const getAmbitionPodium = (id: string): number[][] => {
        const ambition = ambitions.find(a => a.id === id);

        if (!ambition) {
          console.error("not valid ambition!");
          return [[-1], [-1]];
        }

        const podium = [[0], [0]];

        const sortedAmbitions = [...ambition.ranking].sort().reverse();
        const firstAmount = sortedAmbitions[0];
        const secondAmount = sortedAmbitions[1];
        const thirdAmount = (ambition.ranking.length >= 3) ? sortedAmbitions[2] : -1;

        const tiedForFirst = firstAmount == secondAmount;
        const tiedForSecond = secondAmount == thirdAmount && !tiedForFirst;


        function getMultipleSecondPlaces(): number[] {
          let secondArray: number[] = [];

          ambition!.ranking.forEach((val, index) => {
            if (val == firstAmount) secondArray.push(index);
          })

          return secondArray;
        }

        podium[0] = tiedForFirst ? [] : [ambition.ranking.indexOf(firstAmount)];
        podium[1] = tiedForFirst ?
          getMultipleSecondPlaces() :
          tiedForSecond ?
            [] :
            [ambition.ranking.indexOf(secondAmount)];

        return podium;
    }

    const getAmbitionDeclaration = (id: string): number[][] => {
        const ambition = ambitions.find(a => a.id === id);

        if (!ambition) {
          console.error("not valid ambition!");
          return [];
        }

        const AMBITION_MARKER_MAP = {
          9: "firstGold",
          6: "secondGold",
          4: "thirdGold",

          5: "firstSilver",
          3: "secondSilver",
          2: "thirdSilver",
        }

        const sortedAmbitions = ambition.declared.map(a => AMBITION_MARKER_MAP[a]);

        return sortedAmbitions;
    }

      
    const getAmbitionDeclared = (id: string) => {
      const ambition = ambitions.find(a => a.id === id);

      if (!ambition) {
        console.error("not valid ambition!");
        return [];
      }

      const AMBITION_MARKER_MAP = {
        9: "firstGold",
        6: "secondGold",
        4: "thirdGold",

        5: "firstSilver",
        3: "secondSilver",
        2: "thirdSilver",
      }

      const sortedAmbitions = ambition.declared.map(a => AMBITION_MARKER_MAP[a]);

      return sortedAmbitions;
    }

    const getColorFromHex = (color: string): string => {
      switch (color) {
        case "0095A9":
          return "blue"
        case "FFB700":
          return "yellow"
        case "D7D2CB":
          return "white"
        case "E1533D":
          return "red"
        default:
          return "white"
      }
    }
    
    // Extract player data
    const playerData: PlayerData = {
        name: players.map(p => p.name || ""),
        fate: players.map(p => {
          let parsedFates = p.cards.filter(card => card.includes("FATE"))
          return parsedFates ? parsedFates[0].replace("-", "_") as Fates : Fates.Steward; //steward is default if nothing else parsed
        }), 
        color: players.map(p => getColorFromHex(p.color)),
        power: players.map(p => p.power),
        objectiveProgress: players.map(p => p.objective || 0),
        resources: players.map(p => p.resources.map(resource => (resource === null) ? "" : resource) as RESOURCES[]),
        supply: {
            cities: players.map(p => p.cities),
            starports: players.map(p => p.spaceports),
            ships: players.map(p => p.ships),
            agents: players.map(p => p.agents),
            favors: players.map(() => []) 
        },
        outrage: players.map(p => {
            return Array.isArray(p.outrage) ? p.outrage.map(() => true) : [false, false, false, false, false];
        }),
        courtCards: players.map(p => p.court.map(card => card.replace("-", "_")) || []),
        ambitionProgress: {
            tycoon: getAmbitionRanking("tycoon"),
            tyrant: getAmbitionRanking("tyrant"),
            warlord: getAmbitionRanking("warlord"),
            keeper: getAmbitionRanking("keeper"),
            empath: getAmbitionRanking("empath"),
            blightkin: getAmbitionRanking("blightkin"),
            edenguard: getAmbitionRanking("edenguard"),
        },
        hasFlagship: [false, false, false, false],
        flagshipBoard: [[""],[""],[""],[""]], //not available yet
        titles: players.map(p => p.titles as TITLES[])
    };
    
    // Extract general data
    const gameData: GeneralData = {
        isCampaign: input.campaign,
        hasBlightkin: playerData.fate.includes(Fates.Naturalist),
        hasEdenguard: playerData.fate.includes(Fates.Guardian),
        ambitionDeclarations: {
            tycoon: getAmbitionDeclared("tycoon"),
            tyrant: getAmbitionDeclared("tyrant"),
            warlord: getAmbitionDeclared("warlord"),
            keeper: getAmbitionDeclared("keeper"),
            empath: getAmbitionDeclared("empath"),
            blightkin: getAmbitionDeclared("blightkin"),
            edenguard: getAmbitionDeclared("edenguard"),
        },
        ambitionPodium: {
            tycoon: getAmbitionPodium("tycoon"),
            tyrant: getAmbitionPodium("tyrant"),
            warlord: getAmbitionPodium("warlord"),
            keeper: getAmbitionPodium("keeper"),
            empath: getAmbitionPodium("empath"),
            blightkin: getAmbitionPodium("blightkin"),
            edenguard: getAmbitionPodium("edenguard"),
        },
        courtCards: court.map(c => ({
            id: c.id.replace("-", "_"),
            agents: c.influence
                .map((value, index) => ({
                    color: getColorFromHex(players[index]?.color),
                    value: value
                }))
                .filter(agent => agent.value > 0) // Only include agents with influence > 0
        })),
        edicts: input.edicts.map(edict => edict.replace("-", "_")) || [],
        laws: input.laws || []
    };

    
    return {
        playerData,
        gameData
    };
}

// Example usage:
const inputJSON = {
  "campaign": true,
  "players": [
    {
      "color": "0095A9",
      "initiative": true,
      "power": 0,
      "resources": [
        null,
        null,
        null,
        null,
        null,
        null
      ],
      "outrage": [],
      "cities": 5,
      "spaceports": 5,
      "ships": 15,
      "agents": 6,
      "cards": [
        "ARCS-FATE01",
        "ARCS-FATE02"
      ],
      "court": [],
      "titles": [
        "ARCS-AID09A"
      ]
    },
    {
      "name": "BlueChell",
      "color": "E1533D",
      "initiative": false,
      "power": 0,
      "resources": [
        "psionic",
        "material",
        null,
        null,
        null,
        null
      ],
      "outrage": [],
      "cities": 4,
      "spaceports": 5,
      "ships": 15,
      "agents": 9,
      "cards": [
        "ARCS-FATE07"
      ],
      "court": [],
      "titles": [
        "ARCS-AID08A"
      ]
    },
    {
      "color": "FFB700",
      "initiative": false,
      "power": 0,
      "resources": [
        null,
        null,
        null,
        null,
        null,
        null
      ],
      "outrage": [],
      "cities": 5,
      "spaceports": 5,
      "ships": 15,
      "agents": 6,
      "cards": [
        "ARCS-FATE04",
        "ARCS-FATE08"
      ],
      "court": [],
      "objective": 18,
      "titles": [
        "ARCS-AID06A"
      ]
    },
    {
      "color": "D7D2CB",
      "initiative": false,
      "power": 0,
      "resources": [
        null,
        null,
        null,
        null,
        null,
        null
      ],
      "outrage": [],
      "cities": 5,
      "spaceports": 5,
      "ships": 12,
      "agents": 9,
      "cards": [
        "ARCS-FATE06",
        "ARCS-FATE03"
      ],
      "court": [],
      "titles": [
        "ARCS-AID07A"
      ]
    }
  ],
  "ambitions": [
    {
      "id": "tycoon",
      "declared": [],
      "ranking": [
        0,
        0,
        1,
        0
      ]
    },
    {
      "id": "tyrant",
      "declared": [],
      "ranking": [
        0,
        0,
        4,
        0
      ]
    },
    {
      "id": "warlord",
      "declared": [],
      "ranking": [
        0,
        0,
        3,
        0
      ]
    },
    {
      "id": "keeper",
      "declared": [],
      "ranking": [
        0,
        0,
        0,
        0
      ]
    },
    {
      "id": "empath",
      "declared": [],
      "ranking": [
        0,
        0,
        1,
        0
      ]
    }
  ],
  "court": [
    {
      "id": "ARCS-AID01A",
      "influence": [
        0,
        0,
        0,
        0
      ]
    },
    {
      "id": "ARCS-CC07",
      "influence": [
        4,
        0,
        1,
        1
      ]
    },
    {
      "id": "ARCS-CC12",
      "influence": [
        0,
        0,
        0,
        0
      ]
    },
    {
      "id": "ARCS-CC06",
      "influence": [
        0,
        0,
        0,
        0
      ]
    },
    {
      "id": "ARCS-CC13",
      "influence": [
        0,
        0,
        0,
        0
      ]
    }
  ],
  "discard": [],
  "edicts": [
    "ARCS-AID05A"
  ],
  "laws": []
};
const gameData = convertJSONToGameData(inputJSON);
console.log(JSON.stringify(gameData));