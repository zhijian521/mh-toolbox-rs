import { describe, expect, it } from 'vitest';
import type { OcrLine } from './attr-panel';
import { assistLevelRegions, restoreAssistLevels } from './assist-image';
import type { IconHit } from './matcher';

const icon = (name: string, x: number, y: number): IconHit => ({
    name,
    score: 0.99,
    box: { x, y, width: 40, height: 40 },
});
const line = (text: string, x: number, y: number, width = 12, height = 10): OcrLine => ({
    text,
    x,
    y,
    width,
    height,
    score: 0.99,
});

describe('辅助等级裁切', () => {
    it('同排与跨排等级只裁浅底内部，避开圆角边线、剧情点和页码', () => {
        const regions = assistLevelRegions({ width: 316, height: 424 }, [
            icon('强身术', 54, 94),
            icon('冥想', 117, 94),
            icon('淬灵之术', 54, 170),
        ]);
        expect(regions.map(({ source }) => source)).toEqual([
            { x: 58, y: 142, width: 32, height: 14 },
            { x: 121, y: 142, width: 32, height: 14 },
            { x: 58, y: 218, width: 32, height: 14 },
        ]);
        expect(regions.map(({ target }) => target.y)).toEqual([12, 50, 88]);
        expect(
            restoreAssistLevels(
                [line('98', 20, 12, 16, 13), line('40', 20, 50, 16, 13), line('1', 25, 90, 6)],
                regions,
            ),
        ).toEqual([
            line('98', 66, 142, 16, 13),
            line('40', 129, 142, 16, 13),
            line('1', 71, 220, 6),
        ]);
    });

    it('不靠字符数量拆合并数字，越界文字与无效等级不写回', () => {
        const regions = assistLevelRegions({ width: 315, height: 415 }, [
            icon('变化之术', 54, 97),
            icon('打坐', 117, 97),
        ]);
        expect(
            restoreAssistLevels(
                [
                    line('65', 12, 20, 100),
                    line('6', 30, 15, 6, 64),
                    line('4', 30, 0),
                    line('1', 30, 90),
                    line('201', 30, 17),
                    line('5级', 25, 52),
                    line('0', 25, 52, 6),
                ],
                regions,
            ),
        ).toEqual([line('0', 134, 147, 6)]);
    });

    it('随图标尺寸同比裁切等级内部', () => {
        const regions = assistLevelRegions({ width: 632, height: 848 }, [
            { ...icon('强身术', 108, 188), box: { x: 108, y: 188, width: 80, height: 80 } },
        ]);
        expect(regions[0]?.source).toEqual({ x: 116, y: 284, width: 64, height: 28 });
    });

    it('裁切范围夹在截图内，缺失等级区域直接跳过', () => {
        const regions = assistLevelRegions({ width: 80, height: 160 }, [
            icon('强身术', 0, 100),
            icon('冥想', 54, 120),
        ]);
        expect(regions.map(({ source }) => source)).toEqual([
            { x: 4, y: 148, width: 32, height: 12 },
        ]);
    });
});
