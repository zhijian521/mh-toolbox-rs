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
        expect(createSelection('角色').ocrScenarios).toEqual([
            'attributes',
            'skills',
            'assists',
            'training',
            'draft',
            'queue',
        ]);
        expect(createSelection('角色').equipmentScenarios).toEqual([
            'entry',
            'quick',
            'batch',
            'originals',
        ]);
        expect(createSelection('角色/快速修改').ocrScenarios).toEqual(
            createSelection('角色').ocrScenarios,
        );
    });

    it('截图细分只运行对应场景，并保留门派与辅助前置', () => {
        for (const [name, key] of Object.entries({
            属性: 'attributes',
            辅助: 'assists',
            修炼: 'training',
            换图: 'queue',
        })) {
            const selection = createSelection(`角色/截图/${name}`);
            expect(selection.want('角色')).toBe(true);
            expect(selection.want('账号')).toBe(false);
            expect(selection.characterSteps).toEqual(['ocr']);
            expect(selection.ocrScenarios).toEqual([key]);
        }
        expect(createSelection('角色/截图/师门').ocrScenarios).toEqual(['attributes', 'skills']);
        expect(createSelection('角色/截图/草稿').ocrScenarios).toEqual([
            'attributes',
            'assists',
            'draft',
        ]);
    });

    it('装备细分保留入口、召唤兽及批量数据前置', () => {
        for (const [name, steps] of Object.entries({
            入口: ['entry'],
            快速修改: ['entry', 'quick'],
            批量: ['entry', 'quick', 'batch'],
            原图: ['entry', 'originals'],
        })) {
            const selection = createSelection(`角色/装备/${name}`);
            expect(selection.characterSteps).toEqual(['pets', 'equipment']);
            expect(selection.equipmentScenarios).toEqual(steps);
        }
    });

    it('未知分区不能静默跳过全部测试', () => {
        expect(() => createSelection('角色/未知')).toThrow('未知');
        expect(() => createSelection('角色/截图/未知')).toThrow('未知');
        expect(() => createSelection('角色/装备/师门')).toThrow('未知');
        expect(() => createSelection('角色/基础/属性')).toThrow('未知');
        expect(() => createSelection('角色/截图/属性/多余')).toThrow('未知');
        expect(() => createSelection('未知')).toThrow('未知');
        expect(() => createSelection('角色', '角色')).toThrow('范围为空');
        expect(() => createSelection('', '角色/截图')).toThrow('--skip');
    });
});
