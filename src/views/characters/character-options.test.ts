import { describe, expect, it } from 'vitest';
import { characterOptions, UNASSIGNED_CHARACTER } from './character-options';
import { ALL_OPTIONS } from '../../components/select-options';

describe('历史角色选项', () => {
    it('全部、未指定、已删角色保持独立，编辑与筛选使用相同归属', () => {
        const options = characterOptions([], ['', 'old'], { all: true, unassigned: '未指定' });
        expect(options).toEqual([
            { value: ALL_OPTIONS, label: '全部角色' },
            { value: UNASSIGNED_CHARACTER, label: '未指定' },
            { value: 'old', label: '已删角色' },
        ]);
        expect(characterOptions([], [], { unassigned: '不指定' })).toEqual([
            { value: UNASSIGNED_CHARACTER, label: '不指定' },
        ]);
    });
    it('现有角色在前，历史已删角色保留且去重，不混入未指定', () => {
        expect(characterOptions([{ id: 'a', name: '甲' }], ['', 'a', 'b', 'b'])).toEqual([
            { value: 'a', label: '甲' },
            { value: 'b', label: '已删角色' },
        ]);
    });

    it('多个已删角色可以分别选择', () => {
        const options = characterOptions([], ['b', 'c']);
        expect(new Set(options.map((one) => one.label)).size).toBe(2);
        expect(options.map((one) => one.value)).toEqual(['b', 'c']);
    });
});
