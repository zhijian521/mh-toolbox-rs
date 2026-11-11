import { describe, expect, it } from 'vitest';
import { findAttrRow, findTrainingRow } from './character';
import { emptyCharacter } from './roster';

describe('角色分组行查询', () => {
    it('按游戏中的行名找到属性与修炼，查不到不编造行', () => {
        const character = emptyCharacter();
        const attr = character.attrGroups[0]?.rows[0];
        const training = character.trainings[0]?.rows[0];
        expect(attr && findAttrRow(character, attr.label)).toBe(attr);
        expect(training && findTrainingRow(character, training.name)).toBe(training);
        expect(findAttrRow(character, '不存在的属性')).toBeUndefined();
        expect(findTrainingRow(character, '不存在的修炼')).toBeUndefined();
    });
});
