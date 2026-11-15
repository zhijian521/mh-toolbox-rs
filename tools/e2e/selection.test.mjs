import { describe, expect, it } from 'vitest';
import { createSelection } from './selection.mjs';

describe('烟测范围选择', () => {
    it('角色子流程命中父入口，且保留各自前置', () => {
        const selection = createSelection('角色/快速修改');
        expect(selection.want('角色')).toBe(true);
        expect(selection.want('账号')).toBe(false);
        expect(selection.characterSteps).toEqual(['ocr', 'pets', 'quick']);
        expect(createSelection('角色/装备').characterSteps).toEqual(['pets', 'equipment']);
        expect(createSelection('角色/截图').characterSteps).toEqual(['ocr']);
        expect(createSelection('角色/基础').characterSteps).toEqual([]);
    });

    it('保留页面选择、收益日期联动和全量入口', () => {
        expect(createSelection().want('数据')).toBe(true);
        expect(createSelection('收益').want('收益日期')).toBe(true);
        expect(createSelection('', '角色').want('角色')).toBe(false);
        expect(createSelection('角色').characterSteps).toContain('history');
    });

    it('未知分区不能静默跳过全部测试', () => {
        expect(() => createSelection('角色/未知')).toThrow('未知');
        expect(() => createSelection('未知')).toThrow('未知');
        expect(() => createSelection('角色', '角色')).toThrow('范围为空');
        expect(() => createSelection('', '角色/截图')).toThrow('--skip');
    });
});
