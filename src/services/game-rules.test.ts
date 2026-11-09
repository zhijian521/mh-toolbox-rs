import { afterEach, describe, expect, it } from 'vitest';
import { GAME_DATA_FILES } from './game-data.fixture';
import { installGameData } from './game-data';
import {
    ATTR_GROUPS,
    GEAR_ACTIVES,
    GEAR_RULES,
    GEAR_SLOTS,
    STAR_GAINS,
    TRAINING_GROUPS,
    parseCharacterRules,
} from './game-rules';
import { parseActivities } from './game-activities';
import { parseGameplay } from './gameplay';
import { emptyCharacter, normalizeCharacter } from '../views/characters/roster';
import { parseGearPanel } from '../views/characters/ocr/gear-panel';
import { trainingDefaultCap } from '../views/characters/character';

afterEach(() => installGameData(GAME_DATA_FILES));

describe('外置角色规则', () => {
    it('真实部位、图标分组、属性与修炼名录不冲突', () => {
        const rules = parseCharacterRules(GAME_DATA_FILES.characterRules);
        expect(GEAR_SLOTS).toHaveLength(12);
        expect(GEAR_ACTIVES).toHaveLength(69);
        const icons = import.meta.glob('/public/game/icons/**/*.webp');
        for (const slot of rules.gear.slots) {
            expect(`/public/game/icons/${slot.icon}` in icons, slot.name).toBe(true);
            for (const label of [...slot.base, ...slot.extra, ...slot.gem]) {
                expect(rules.gear.statLabels, `${slot.name} 的 ${label}`).toContain(label);
            }
        }
        const labels = ATTR_GROUPS.flatMap((group) => group.labels);
        expect(new Set(labels).size).toBe(labels.length);
        const trainings = TRAINING_GROUPS.flatMap((group) => group.rows.map((row) => row.name));
        expect(new Set(trainings).size).toBe(trainings.length);
        expect(STAR_GAINS.气血).toBe(28);
        expect(GEAR_RULES['玉魄·阳']?.effects).toEqual(['奇袭特技']);
    });

    it('拒绝分数格数、重复部位/坐标/图标分组和越界图标路径', () => {
        for (const change of [
            (rules: typeof GAME_DATA_FILES.characterRules) => {
                rules.pets.skillSlots = 1.5;
            },
            (rules: typeof GAME_DATA_FILES.characterRules) => {
                rules.gear.slots[0].col = 1.5;
            },
            (rules: typeof GAME_DATA_FILES.characterRules) => {
                rules.gear.slots[1].name = rules.gear.slots[0].name;
            },
            (rules: typeof GAME_DATA_FILES.characterRules) => {
                Object.assign(rules.gear.slots[1], {
                    col: rules.gear.slots[0].col,
                    row: rules.gear.slots[0].row,
                });
            },
            (rules: typeof GAME_DATA_FILES.characterRules) => {
                rules.gear.slots[1].groups = rules.gear.slots[0].groups;
            },
            (rules: typeof GAME_DATA_FILES.characterRules) => {
                rules.gear.slots[0].icon = '../outside.webp';
            },
        ]) {
            const rules = structuredClone(GAME_DATA_FILES.characterRules);
            change(rules);
            expect(() => parseCharacterRules(rules)).toThrow(/character-rules/);
        }
    });

    it('新规则安装后修炼和 OCR 当次生效，属性名中的正则符号按字面匹配', () => {
        const files = structuredClone(GAME_DATA_FILES);
        files.characterRules.trainings[0].rows[0].cap = 27;
        files.characterRules.gear.statLabels.push('临时(属性)');
        installGameData(files);
        expect(trainingDefaultCap(files.characterRules.trainings[0].rows[0].name)).toBe(27);
        const result = parseGearPanel(
            [{ text: '临时(属性)+9', x: 0, y: 0, width: 100, height: 16, score: 1 }],
            [],
            '武器',
        );
        expect(result.detail.stats).toEqual([{ label: '临时(属性)', value: '+9' }]);
    });

    it('规则不可用时保留已录入的属性、修炼与装备', () => {
        const character = emptyCharacter();
        character.name = '保留记录';
        character.attrGroups[0].rows[0].value = '4567';
        character.trainings[0].rows[0] = { ...character.trainings[0].rows[0], level: 18, cap: 25 };
        character.gear[0].detail = {
            name: '已录装备',
            kind: '头盔',
            stats: [{ label: '防御', value: '80' }],
        };
        const before = normalizeCharacter(character);
        const files = structuredClone(GAME_DATA_FILES);
        files.characterRules.attributes = [];
        files.characterRules.trainings = [];
        files.characterRules.gear.slots = [];
        installGameData(files);
        expect(normalizeCharacter(before)).toEqual(before);
    });
});

describe('外置活动与玩法规则', () => {
    it('真实活动表完整可读，时段与周期合法', () => {
        expect(parseActivities(GAME_DATA_FILES.activities)).toHaveLength(24);
        const rules = parseGameplay(GAME_DATA_FILES.gameplay);
        expect(rules.prices.groups).toHaveLength(9);
        expect(rules.ghost).toEqual({ tolerance: 50, edgeLow: 50, edgeHigh: 150 });
    });

    it('拒绝重复活动、错误周期和逆序时段', () => {
        const activity = {
            id: 'test',
            name: '测试',
            tone: 'week',
            rule: { type: 'weekly', weekdays: [1] },
            slots: [{ start: '10:00', end: '11:00' }],
        };
        expect(() => parseActivities([activity, activity])).toThrow(/重复/);
        expect(() =>
            parseActivities([{ ...activity, rule: { type: 'weekly', weekdays: [7] } }]),
        ).toThrow(/周期/);
        expect(() =>
            parseActivities([{ ...activity, slots: [{ start: '12:00', end: '11:00' }] }]),
        ).toThrow(/时段/);
        expect(() =>
            parseGameplay({
                ...GAME_DATA_FILES.gameplay,
                ghost: { tolerance: 0, edgeLow: 150, edgeHigh: 50 },
            }),
        ).toThrow(/gameplay/);
    });
});
