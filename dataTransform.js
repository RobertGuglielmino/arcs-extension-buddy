"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertJSONToGameData = convertJSONToGameData;
var arcs_types_1 = require("@robertguglielmino/arcs-types");
function convertJSONToGameData(input) {
    var players = input.players;
    var ambitions = input.ambitions;
    var court = input.court;
    var getAmbitionRanking = function (id) {
        var ambition = ambitions.find(function (a) { return a.id === id; });
        return ambition ? ambition.ranking : new Array(players.length).fill(0);
    };
    var getAmbitionPodium = function (id) {
        var ambition = ambitions.find(function (a) { return a.id === id; });
        if (!ambition) {
            console.error("not valid ambition!");
            return [[-1], [-1]];
        }
        var podium = [[0], [0]];
        var sortedAmbitions = __spreadArray([], ambition.ranking, true).sort().reverse();
        var firstAmount = sortedAmbitions[0];
        var secondAmount = sortedAmbitions[1];
        var thirdAmount = (ambition.ranking.length >= 3) ? sortedAmbitions[2] : -1;
        var tiedForFirst = firstAmount == secondAmount;
        var tiedForSecond = secondAmount == thirdAmount && !tiedForFirst;
        function getMultipleSecondPlaces() {
            var secondArray = [];
            ambition.ranking.forEach(function (val, index) {
                if (val == firstAmount)
                    secondArray.push(index);
            });
            return secondArray;
        }
        podium[0] = tiedForFirst ? [] : [ambition.ranking.indexOf(firstAmount)];
        podium[1] = tiedForFirst ?
            getMultipleSecondPlaces() :
            tiedForSecond ?
                [] :
                [ambition.ranking.indexOf(secondAmount)];
        return podium;
    };
    var getColorFromHex = function (color) {
        switch (color) {
            case "0095A9":
                return "blue";
            case "FFB700":
                return "yellow";
            case "D7D2CB":
                return "white";
            case "E1533D":
                return "red";
            default:
                return "white";
        }
    };
    // Extract player data
    var playerData = {
        name: players.map(function (p) { return p.name || ""; }),
        fate: players.map(function (p) { return p.cards.filter(function (card) { return card.includes("FATE"); })[0]; }),
        color: players.map(function (p) { return getColorFromHex(p.color); }),
        power: players.map(function (p) { return p.power; }),
        objectiveProgress: players.map(function (p) { return p.objective || 0; }),
        resources: players.map(function (p) { return p.resources.map(function (resource) { return (resource === null) ? "" : resource; }); }),
        supply: {
            cities: players.map(function (p) { return p.cities; }),
            starports: players.map(function (p) { return p.spaceports; }),
            ships: players.map(function (p) { return p.ships; }),
            agents: players.map(function (p) { return p.agents; }),
            favors: players.map(function () { return []; })
        },
        outrage: players.map(function (p) {
            return Array.isArray(p.outrage) ? p.outrage.map(function () { return true; }) : [false, false, false, false, false];
        }),
        courtCards: players.map(function (p) { return p.court || []; }),
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
        flagshipBoard: [undefined, undefined, undefined, undefined],
        titles: players.map(function (p) { return p.titles; })
    };
    // Extract general data
    var gameData = {
        isCampaign: input.campaign,
        hasBlightkin: playerData.fate.includes(arcs_types_1.Fates.Naturalist),
        hasEdenguard: playerData.fate.includes(arcs_types_1.Fates.Guardian),
        ambitionDeclarations: ambitions.map(function (a) { return a.declared; }),
        ambitionPodium: {
            tycoon: getAmbitionPodium("tycoon"),
            tyrant: getAmbitionPodium("tyrant"),
            warlord: getAmbitionPodium("warlord"),
            keeper: getAmbitionPodium("keeper"),
            empath: getAmbitionPodium("empath"),
            blightkin: getAmbitionPodium("blightkin"),
            edenguard: getAmbitionPodium("edenguard"),
        },
        courtCards: court.map(function (c) { return ({
            id: c.id,
            agents: c.influence
                .map(function (value, index) {
                var _a;
                return ({
                    color: getColorFromHex((_a = players[index]) === null || _a === void 0 ? void 0 : _a.color),
                    value: value
                });
            })
                .filter(function (agent) { return agent.value > 0; }) // Only include agents with influence > 0
        }); }),
        edicts: input.edicts || [],
        laws: input.laws || []
    };
    return {
        playerData: playerData,
        gameData: gameData
    };
}
// Example usage:
var inputJSON = {
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
var gameData = convertJSONToGameData(inputJSON);
console.log(JSON.stringify(gameData));
