import type { OcrLine } from './attr-panel';

const textOf = (line: OcrLine) => line.text.replace(/\s+/g, '');
const cy = (line: OcrLine) => line.y + line.height / 2;
const ratio = /^\d{1,7}(?:[/／∕]\d{1,7}){1,2}$/;

/** 气血标签漏检时，只补魔法上一行、与魔法读数同列的完整比例值，不推测数字。 */
export function resourcePanelLines(lines: readonly OcrLine[]): OcrLine[] {
    if (lines.some((line) => textOf(line).startsWith('气血'))) return [...lines];
    const readable = lines.filter((line) => line.height > 0 && (line.score ?? 0) >= 0.6);
    const magic = readable.filter((line) => textOf(line) === '魔法');
    if (magic.length !== 1) return [...lines];
    const label = magic[0];
    const values = readable.filter(
        (line) =>
            ratio.test(textOf(line)) &&
            Math.abs(cy(line) - cy(label)) < label.height * 0.5 &&
            line.x >= label.x + label.width - label.height * 0.3 &&
            line.x - label.x - label.width < label.height * 3,
    );
    if (values.length !== 1) return [...lines];
    const value = values[0];
    // 战斗属性锚点排除技能描述等非属性区域，不用固定截图尺寸或绝对坐标。
    const combat = readable.some(
        (line) =>
            /^(?:命中|伤害|攻击|防御|速度|法伤|法防)(?:$|[：:\d])/.test(textOf(line)) &&
            Math.abs(line.x - label.x) < label.height &&
            line.y > label.y &&
            line.y - label.y < label.height * 10,
    );
    if (!combat) return [...lines];
    const candidates = readable.filter((line) => {
        const gap = cy(label) - cy(line);
        return (
            ratio.test(textOf(line)) &&
            Math.abs(line.x - value.x) < label.height * 0.75 &&
            gap > label.height * 0.75 &&
            gap < label.height * 2.25
        );
    });
    if (candidates.length !== 1) return [...lines];
    const hp = candidates[0];
    return lines.map((line) =>
        line === hp
            ? {
                  ...line,
                  text: '气血' + textOf(line).replace(/[／∕]/g, '/'),
                  x: label.x,
                  width: line.x + line.width - label.x,
                  score: Math.min(line.score ?? 0, label.score ?? 0, value.score ?? 0),
              }
            : line,
    );
}
