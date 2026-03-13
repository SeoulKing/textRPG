"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.choiceDefinitions = void 0;
function choice(definition) {
    return {
        conditions: [],
        hidden: false,
        ...definition,
    };
}
exports.choiceDefinitions = [
    choice({
        id: "opening_commit",
        label: "오늘 하루를 버티기로 마음먹는다",
        outcomeHint: "한 끼와 물, 그리고 돌아올 길을 염두에 두고 하루를 정리한다.",
        effects: [
            { type: "set_flag", flag: "opening_seen" },
            { type: "set_scene", sceneId: "shelter_day_intro" },
            { type: "log", message: "당신은 오늘을 운이 아니라 선택으로 버텨 보기로 한다." },
        ],
        riskHint: "low",
    }),
];
