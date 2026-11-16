import type { GearSlotName } from '../gear';
import { GEAR_RULES, GEAR_STAT_LABELS } from '../../../services/game-rules';
import type { OcrLine } from './attr-panel';

/** 「魄」会漏读或误识别；只兼容实图出现的形近字，同时要求完整前缀与阴阳。 */
export const JADE_TITLE_PATTERN = /上古玉[魄魂朗魏晚]?[·・.。:：]?([阴阳])/;

const compact = (text: string) => text.normalize('NFKC').replace(/\s/g, '');

function jadeTitles(lines: readonly OcrLine[]) {
    // 灵尘或完整玉魄标题确认面板类型，普通装备的气血、伤害不能据此改成玉魄。
    if (
        !lines.some((line) => /灵尘/.test(line.text) || JADE_TITLE_PATTERN.test(compact(line.text)))
    )
        return [];
    return lines
        .flatMap((line) => {
            const text = compact(line.text);
            const matches = text.matchAll(/上古玉[\u4e00-\u9fff]?[·・.。:：]?[阴阳]?/g);
            return [...matches].map((match) => ({
                text: match[0],
                x: line.x + (line.width * match.index) / text.length,
                width: (line.width * match[0].length) / text.length,
                y: line.y,
                height: line.height,
            }));
        })
        .sort((a, b) => a.x - b.x);
}

/** 独有属性优先于标题，共有属性不投票；同列混入阴阳属性时交给用户核对。 */
export function jadeIdentity(lines: readonly OcrLine[]) {
    const titles = jadeTitles(lines);
    const top = titles.length ? Math.min(...titles.map((title) => title.y)) : undefined;
    const context = titles.length > 0 || lines.some((line) => /灵尘/.test(line.text));
    if (!context) return { slot: null, top, conflict: false };
    const slots = ['玉魄·阴', '玉魄·阳'] as const;
    const labels = [...GEAR_STAT_LABELS].sort((a, b) => b.length - a.length);
    const evidence = new Set<GearSlotName>();
    for (const line of lines) {
        if (top !== undefined && line.y < top) continue;
        const text = compact(line.text);
        const matched = labels.find((label) => text.startsWith(label));
        // 标签可能与数字分框，但「气血」不能匹配到以它开头的说明句。
        const stat = matched && /^(?:[:：]?[+-]?\d|$)/.test(text.slice(matched.length));
        const label = ['抗封印命中等级', '抵抗封印等级'].includes(matched ?? '')
            ? '抵抗封印命中等级'
            : matched;
        const owners = slots.filter((slot) => {
            const rule = GEAR_RULES[slot];
            return (
                rule &&
                ((stat && label && [...rule.base, ...rule.extra].includes(label)) ||
                    rule.effects.some((effect) => text.startsWith(effect)))
            );
        });
        if (owners.length === 1) evidence.add(owners[0]);
    }
    const title = lines
        .map((line) => compact(line.text))
        .join('\n')
        .match(JADE_TITLE_PATTERN);
    const slot =
        evidence.size === 1
            ? [...evidence][0]
            : evidence.size === 0 && title
              ? (`玉魄·${title[1]}` as GearSlotName)
              : null;
    return { slot, top, conflict: evidence.size > 1 };
}

/** 两列先按标题位置裁分，再由各自属性判断阴阳，标题误字不影响分列。 */
export function jadePanels(lines: readonly OcrLine[], image: ImageData) {
    const titles = jadeTitles(lines);
    const left = titles[0];
    const right = titles.find(
        (one) =>
            left &&
            one.x - left.x > Math.max(one.height, left.height) * 2 &&
            Math.abs(one.y - left.y) <= Math.max(one.height, left.height),
    );
    if (!left || !right) return [];
    const top = Math.max(
        0,
        Math.floor(Math.min(left.y, right.y) - Math.max(left.height, right.height) / 2),
    );
    const split = Math.floor(right.x - right.height / 2);
    const start = Math.max(0, Math.floor(left.x - left.height / 2));
    if (split <= start || split >= image.width || top >= image.height) return [];
    const columns = [
        { x: start, end: split },
        { x: split, end: image.width },
    ].map(({ x, end }) => {
        const identity = jadeIdentity([
            ...lines.filter((line) => line.x >= x && line.x < end && line.y >= top),
            ...titles
                .filter((title) => title.x >= x && title.x < end)
                .map((title) => ({ ...title, score: 1 })),
        ]);
        if (identity.conflict || !identity.slot)
            throw new Error('阴阳玉魄属性归属不明确，请截取完整的两列详情');
        return { slot: identity.slot, x, end };
    });
    if (columns[0].slot === columns[1].slot)
        throw new Error('阴阳玉魄属性归属不明确，请截取完整的两列详情');
    return columns.map(({ slot, x, end }) => {
        const width = end - x;
        const height = image.height - top;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            const offset = ((top + y) * image.width + x) * 4;
            data.set(image.data.subarray(offset, offset + width * 4), y * width * 4);
        }
        return { slot, image: { data, width, height, colorSpace: image.colorSpace } as ImageData };
    });
}
