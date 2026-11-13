import { describe, expect, it } from 'vitest';
import { characterOptions } from './character-options';

describe('历史角色选项', () => {
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
