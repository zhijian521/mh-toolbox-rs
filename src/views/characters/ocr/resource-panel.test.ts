import { describe, expect, it } from 'vitest';
import type { OcrLine } from './attr-panel';
import { resourcePanelLines } from './resource-panel';
import samples from '../../../../tools/e2e/fixtures/hp-panels.json';

describe('气血标签漏检补位', () => {
    it.each(samples)('$name：复用正式版真实 OCR 数字，不修改原始结果', ({ lines, hp }) => {
        const source = structuredClone(lines);
        const restored = resourcePanelLines(lines);
        expect(restored.find((line) => line.text.startsWith('气血'))?.text).toBe('气血' + hp);
        expect(restored).toHaveLength(lines.length);
        expect(lines).toEqual(source);
    });

    it.each([0.5, 1, 2])('截图缩放与裁边不影响相对定位：%s', (scale) => {
        const lines = samples[0].lines.map((line) => ({
            ...line,
            x: (line.x + 50) * scale,
            y: (line.y + 30) * scale,
            width: line.width * scale,
            height: line.height * scale,
        }));
        expect(resourcePanelLines(lines).some((line) => line.text === '气血' + samples[0].hp)).toBe(
            true,
        );
    });

    it.each(['／', '∕'])('补位时统一数字之间的斜杠：%s', (slash) => {
        const sample = samples[1];
        const lines = sample.lines.map((line) =>
            line.text === sample.hp ? { ...line, text: sample.hp.replace('/', slash) } : line,
        );
        expect(resourcePanelLines(lines).find((line) => line.text.startsWith('气血'))?.text).toBe(
            '气血' + sample.hp,
        );
    });

    it('已有明确气血标签时不替换', () => {
        const hp: OcrLine = {
            text: '气血',
            x: 58,
            y: 184,
            width: 38,
            height: 21,
            score: 0.99,
        };
        const lines = [...samples[0].lines, hp];
        expect(resourcePanelLines(lines)).toEqual(lines);
    });

    it('没有魔法读数、没有战斗属性或只有孤立数字时不补', () => {
        for (const lines of [
            samples[0].lines.filter((line) => line.text !== '745/905'),
            samples[0].lines.filter((line) => !/^(命中|伤害|防御|速度|法伤|法防)/.test(line.text)),
            samples[0].lines.map((line) =>
                line.text === samples[0].hp ? { ...line, text: '3050' } : line,
            ),
        ]) {
            expect(resourcePanelLines(lines)).toEqual(lines);
        }
    });

    it('气血数字缺失、离列、距离过远或低置信度时不补，不能拿经验与其他比例代替', () => {
        for (const change of [{ text: '' }, { x: 280 }, { y: 150 }, { score: 0.5 }]) {
            const lines = samples[0].lines.map((line) =>
                line.text === samples[0].hp ? { ...line, ...change } : line,
            );
            expect(resourcePanelLines(lines)).toEqual(lines);
        }
    });

    it('同一位置存在两个候选时不猜', () => {
        const hp = samples[0].lines.find((line) => line.text === samples[0].hp)!;
        const lines = [...samples[0].lines, { ...hp, text: '100/999' }];
        expect(resourcePanelLines(lines)).toEqual(lines);
    });
});
