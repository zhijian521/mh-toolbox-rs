import type { EquipmentName } from '../../../services/game-data';
import { ocrFrame } from '../../../services/ocr';
import type { GearSlotName, GearStat } from '../gear';
import { fixedGearBaseLabels, gearStatGroup } from '../gear-properties';
import type { OcrLine } from './attr-panel';
import { gearExtraFrame, gearExtraRegions, restoreGearExtras } from './gear-extra-image';
import { parseGearPanel, type GearPanelResult } from './gear-panel';
import { gearAmbushFrame, gearBaseFrame, gearFrame } from './gear-image';
import { jadePanels } from './jade-panels';
import { base64Of, swapToBgra } from './pixels';

/** 耐久上方是基础属性；按浮片文字列裁掉背包列表，防止同一基线合并成一行。 */
function baseRegionLines(primary: readonly OcrLine[], raw: readonly OcrLine[]) {
    const durability = primary.find((line) => /^耐久/.test(line.text.trim()));
    if (!durability) return raw;
    const level = primary
        .filter((line) => /^等级/.test(line.text.trim()) && line.y < durability.y)
        .sort((a, b) => b.y - a.y)[0];
    const top = level ? level.y + level.height / 2 : durability.y - durability.height * 2;
    const left = durability.x - durability.height / 2;
    return raw.filter(
        (line) =>
            line.x >= left &&
            line.y + line.height / 2 >= top &&
            line.y + line.height / 2 < durability.y,
    );
}

/** 缺失的灵饰 / 玉魄绿字按实际行补读；已读出的同名属性与括号值保持原样。 */
async function recognizeExtras(
    lines: readonly OcrLine[],
    image: ImageData,
    names: readonly EquipmentName[],
    slot: GearSlotName,
) {
    const context = lines.filter((line) => /^(?:耐久|精炼等级|灵尘等级)/.test(line.text.trim()));
    const rowLines = (source: { x: number; y: number; height: number }, rows: readonly OcrLine[]) =>
        rows.filter((line) => {
            const cy = line.y + line.height / 2;
            return line.x >= source.x && cy >= source.y && cy < source.y + source.height;
        });
    const hasStat = (rows: readonly OcrLine[]) =>
        parseGearPanel([...context, ...rows], [], slot).detail.stats?.some(
            (row) => gearStatGroup(row, slot) === 'extra',
        );
    const missing = gearExtraRegions(image, lines).filter(
        ({ source }) => !hasStat(rowLines(source, lines)),
    );
    if (!missing.length) return null;
    const frame = gearExtraFrame(image, missing);
    const outcome = await ocrFrame(frame.pixels, frame.width, frame.height);
    if (outcome.status !== 'ok') return null;
    const restored = restoreGearExtras(outcome.lines, missing);
    const recovered = missing.filter(({ source }) => hasStat(rowLines(source, restored)));
    if (!recovered.length) return null;
    return parseGearPanel(
        [
            ...lines.filter(
                (line) => !recovered.some(({ source }) => rowLines(source, [line]).length),
            ),
            ...restored.filter((line) =>
                recovered.some(({ source }) => rowLines(source, [line]).length),
            ),
        ],
        names,
        slot,
        image,
    );
}

/** 按部位补读漏项，保留主识别的名称、状态与效果，避免背包文字混入。 */
export async function recognizeGearPanel(
    lines: readonly OcrLine[],
    image: ImageData,
    names: readonly EquipmentName[],
    fallbackSlot?: GearSlotName,
): Promise<GearPanelResult> {
    const result = parseGearPanel(lines, names, fallbackSlot, image);
    const panels = jadePanels(lines, image);
    if (panels.length) {
        const parts: GearPanelResult[] = [];
        for (const panel of panels) {
            const frame = gearFrame(panel.image);
            const outcome = await ocrFrame(frame.pixels, frame.width, frame.height);
            if (outcome.status === 'failed') throw new Error(outcome.error);
            const part = await recognizeGearPanel(outcome.lines, panel.image, names, panel.slot);
            if (part.slot !== panel.slot || !part.hit)
                throw new Error(`没认出${panel.slot}，请截取完整的阴阳玉魄详情`);
            parts.push(part);
        }
        const primary = parts.find((part) => part.slot === fallbackSlot) ?? parts[0];
        return {
            ...primary,
            related: parts.filter((part) => part !== primary),
            ...(result.soul ? { soul: result.soul } : {}),
        };
    }
    const slot = result.slot;
    if (!slot) return result;
    if (['戒指', '耳饰', '配饰', '手镯', '玉魄·阴', '玉魄·阳'].includes(slot)) {
        const retry = await recognizeExtras(lines, image, names, slot);
        const best =
            retry && (retry.detail.stats?.length ?? 0) >= (result.detail.stats?.length ?? 0)
                ? retry
                : result;
        if (
            slot.startsWith('玉魄') &&
            best.detail.stats?.some((row) => row.label === '奇袭法术' && !row.value.includes('%'))
        ) {
            const frame = gearAmbushFrame(image, lines);
            if (frame) {
                const outcome = await ocrFrame(frame.pixels, frame.width, frame.height);
                const recovered =
                    outcome.status === 'ok'
                        ? parseGearPanel(outcome.lines, [], slot).detail.stats?.find(
                              (row) => row.label === '奇袭法术' && row.value.includes('%'),
                          )
                        : undefined;
                if (recovered) {
                    best.detail.stats = best.detail.stats.map((row) =>
                        row.label === '奇袭法术' && !row.value.includes('%') ? recovered : row,
                    );
                }
            }
        }
        return result.soul ? { ...best, soul: result.soul } : best;
    }
    const labels = fixedGearBaseLabels(slot);
    const stats = result.detail.stats ?? [];
    if (
        labels.every((label) =>
            stats.some((row) => row.label === label && gearStatGroup(row, slot) === 'base'),
        )
    )
        return result;
    const readBase = (raw: readonly OcrLine[]) => {
        const retry = parseGearPanel(baseRegionLines(lines, raw), names, slot, image);
        if (retry.slot !== slot) return [];
        return (retry.detail.stats ?? []).filter(
            (row) => labels.includes(row.label) && gearStatGroup(row, slot) === 'base',
        );
    };
    let base: GearStat[] = [];
    const frame = gearBaseFrame(image, lines);
    if (frame) {
        const local = await ocrFrame(frame.pixels, frame.width, frame.height);
        if (local.status === 'ok') {
            const recovered = readBase(
                local.lines.map((line) => ({ ...line, x: line.x + frame.x, y: line.y + frame.y })),
            );
            // 同排可能同时存在误读数值，局部补齐整排才替换；不完整则沿用整图兜底。
            if (labels.every((label) => recovered.some((row) => row.label === label)))
                base = recovered;
        }
    }
    if (!base.length) {
        const raw = await ocrFrame(base64Of(swapToBgra(image.data)), image.width, image.height);
        if (raw.status !== 'ok') return result;
        base = readBase(raw.lines);
    }
    if (!base.length) return result;
    // 同排的字和数字会一起受预处理影响；补读命中时一起替换该排的基础项。
    result.detail.stats = [
        ...stats.filter(
            (row) =>
                !base.some((one) => one.label === row.label && gearStatGroup(row, slot) === 'base'),
        ),
        ...base,
    ];
    result.hit += result.detail.stats.length - stats.length;
    result.total = result.hit;
    return result;
}
