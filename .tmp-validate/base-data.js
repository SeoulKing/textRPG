"use strict";
/**
 * Base game data exports.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseLocations = exports.basePeople = exports.baseItems = exports.baseSkills = exports.STARVATION_TICK_MS = exports.AUTO_FULLNESS_TICK_MS = exports.PHASE_DURATION_MS = exports.REAL_DAY_MS = exports.SAVE_VERSION = exports.PHASES = void 0;
exports.getQuestEntries = getQuestEntries;
exports.getSkillEntries = getSkillEntries;
exports.getPeopleEntries = getPeopleEntries;
exports.PHASES = ["morning", "late morning", "afternoon", "evening", "night"];
exports.SAVE_VERSION = 7;
exports.REAL_DAY_MS = 15 * 60 * 1000;
exports.PHASE_DURATION_MS = exports.REAL_DAY_MS / exports.PHASES.length;
exports.AUTO_FULLNESS_TICK_MS = exports.REAL_DAY_MS / 4;
exports.STARVATION_TICK_MS = exports.REAL_DAY_MS / 2;
exports.baseSkills = {
    keenEye: {
        id: "keenEye",
        name: "예리한 눈",
        description: "작은 물자와 놓치기 쉬운 단서를 남들보다 먼저 발견한다.",
    },
    endure: {
        id: "endure",
        name: "버티기",
        description: "고된 이동과 수색 속에서도 쉽게 무너지지 않는다.",
    },
    barter: {
        id: "barter",
        name: "흥정",
        description: "거래가 필요한 순간, 손해를 조금 덜 본다.",
    },
};
const quest_definitions_1 = require("./quest-definitions");
const items_1 = require("./data/items");
Object.defineProperty(exports, "baseItems", { enumerable: true, get: function () { return items_1.baseItems; } });
const people_1 = require("./data/people");
Object.defineProperty(exports, "basePeople", { enumerable: true, get: function () { return people_1.basePeople; } });
const locations_1 = require("./data/locations");
Object.defineProperty(exports, "baseLocations", { enumerable: true, get: function () { return locations_1.baseLocations; } });
function getQuestEntries() {
    return quest_definitions_1.questDefinitions.map((q) => ({
        id: q.id,
        name: q.title,
        summary: q.description,
    }));
}
function getSkillEntries() {
    return Object.values(exports.baseSkills);
}
function getPeopleEntries() {
    return Object.values(people_1.basePeople);
}
