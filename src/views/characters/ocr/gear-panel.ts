import type { EquipmentName } from '../../../services/game-data';
import {
    GEAR_JADE_EFFECTS,
    GEAR_TRAITS,
    type GearDetail,
    type GearSlot,
    type GearSlotName,
    type GearStat,
} from '../gear';
import type { OcrLine } from './attr-panel';
import {
    GEAR_GROUP_SLOTS as GROUP_SLOTS,
    GEAR_GROUP_KINDS as GROUP_KINDS,
    GEAR_STAT_LABELS as STAT_LABELS,
    GEAR_SUIT_ALIASES,
    STAR_GAINS,
    JADE_GAIN_FACTOR,
} from '../../../services/game-rules';

/** 一次识别一件，仅按明确的强化等级补括号值；应用时按部位整件替换。 */
export interface GearPanelResult {
    slot: GearSlotName | null;
    detail: Partial<GearDetail>;
    hit: number;
    total: number;
}

type GearImage = Pick<ImageData, 'data' | 'width' | 'height'>;

/** 只数亮色文字，排除棕色底图；黄字宝石总量不能因排在耐久之后就变成绿字。 */
function greenText(image: GearImage, line: OcrLine): boolean {
    let green = 0;
    let bright = 0;
    const bottom = Math.min(image.height, line.y + line.height);
    const right = Math.min(image.width, line.x + line.width);
    for (let y = Math.max(0, Math.floor(line.y)); y < bottom; y++) {
        for (let x = Math.max(0, Math.floor(line.x)); x < right; x++) {
            const i = (y * image.width + x) * 4;
            const [r, g, b, a] = image.data.subarray(i, i + 4);
            if (!a || Math.max(r, g, b) < 170) continue;
            if (g > r * 1.3 && g > b * 1.2) green++;
            if (Math.min(r, g, b) >= 145 || (r >= 170 && g >= 170) || g > r * 1.3) bright++;
        }
    }
    return green > 0 && green / bright > 0.35;
}

function compact(text: string): string {
    return text
        .normalize('NFKC')
        .replace(/\s/g, '')
        .replace(/[【]/g, '[')
        .replace(/[】]/g, ']')
        .replace(/[−—]/g, '-')
        .replace(/佩饰/g, '配饰');
}

/** 熔炼可写「+1魔力」或「魔力+1」；只接收完整属性行，避免说明里的数字混入。 */
function meltStats(text: string): GearStat[] {
    if (!STAT_LABELS.length) return [];
    const content = text.replace(/^熔炼效果:?/, '').replace(/[,、;]/g, '');
    const labels = statLabelsPattern();
    const MELT_PATTERN = new RegExp(
        `([+\\-]?\\d+(?:\\.\\d+)?)(${labels})|(${labels})[:：]?([+\\-]?\\d+(?:\\.\\d+)?)`,
        'g',
    );
    const matches = [...content.matchAll(MELT_PATTERN)];
    if (!content || matches.map((match) => match[0]).join('') !== content) return [];
    return matches.map((match) => ({
        label: match[2] ?? match[3],
        value: match[1] ?? match[4],
        group: 'melt',
        gain: true,
    }));
}

function statLabelsPattern(): string {
    return STAT_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

/** 同一基线的标签、数值与方括号先拼回一行，避免 OCR 分框影响字段配对。 */
function textRows(lines: readonly OcrLine[], image?: GearImage) {
    const rows: OcrLine[][] = [];
    for (const line of [...lines].filter((one) => one.text.trim()).sort((a, b) => a.y - b.y)) {
        const band = rows.find((row) => {
            const anchor = row[0];
            return (
                Math.abs(anchor.y + anchor.height / 2 - line.y - line.height / 2) <=
                Math.min(anchor.height, line.height) * 0.45
            );
        });
        if (band) band.push(line);
        else rows.push([line]);
    }
    return rows.map((row) => ({
        text: compact(
            row
                .sort((a, b) => a.x - b.x)
                .map((one) => one.text)
                .join(''),
        ),
        green: image ? row.some((line) => greenText(image, line)) : undefined,
        x: Math.min(...row.map((line) => line.x)),
        y: Math.min(...row.map((line) => line.y)),
        height: Math.max(...row.map((line) => line.height)),
    }));
}

/** 套装尾字可能单独换行；只接紧邻同列的名称短行，遇到其他字段立即停止。 */
function suitRows(bands: ReturnType<typeof textRows>) {
    const merged: typeof bands = [];
    for (let index = 0; index < bands.length; index++) {
        const row = { ...bands[index] };
        const suit = /^套装(?:效果)?:?(.*)$/.exec(row.text);
        if (suit) {
            let value = suit[1];
            let previous = row;
            while (index + 1 < bands.length) {
                const next = bands[index + 1];
                if (
                    next.y <= previous.y ||
                    next.y - previous.y > Math.max(previous.height, next.height) * 2 ||
                    Math.abs(next.x - row.x) > row.height * 1.5 ||
                    !/^[\u4e00-\u9fffA-Za-z()·]+$/.test(next.text) ||
                    (value && (next.text.length > 8 || value.endsWith(')'))) ||
                    /^(?:特技|特效|套装|奇袭|钟灵石|开运|符石|星位|星相|制造者|熔炼|耐久|锻炼|精炼|灵尘|等级|五行|装备)/.test(
                        next.text,
                    ) ||
                    STAT_LABELS.some((label) => next.text.startsWith(label))
                )
                    break;
                value += next.text;
                previous = next;
                index++;
            }
            row.text = `套装效果:${GEAR_SUIT_ALIASES[value] ?? value}`;
        }
        merged.push(row);
    }
    return merged;
}

export function parseGearPanel(
    lines: readonly OcrLine[],
    names: readonly EquipmentName[] = [],
    fallbackSlot?: GearSlotName,
    image?: GearImage,
): GearPanelResult {
    const STAT_PATTERN = new RegExp(
        `(${statLabelsPattern()})[:：]?([+\\-]?\\d+(?:\\.\\d+)?%?)(?:\\[([+\\-]?\\d+(?:\\.\\d+)?%?)\\])?`,
        'g',
    );
    const bands = suitRows(textRows(lines, image));
    const rows = bands.map((row) => row.text);
    const text = rows.join('\n');
    const detail: Partial<GearDetail> = {};
    let slot: GearSlotName | null = null;
    // 只在装备条件之前找名称，说明正文和底下背包里的名字不能决定部位。
    const heading = rows.slice(0, rows.findIndex((row) => /装备条件|灵饰类型/.test(row)) + 1);
    const titleRows = heading.length ? heading : rows.slice(0, 2);
    let named = titleRows
        .flatMap((row, index) =>
            names
                .filter((entry) => row.includes(compact(entry.name)))
                .map((entry) => ({ ...entry, index })),
        )
        .sort((a, b) => a.index - b.index || b.name.length - a.name.length)[0];
    if (!named) {
        // 字数一致且只差一字时必须唯一命中；不在描述段里模糊搜装备名。
        for (const row of titleRows.slice(0, 2)) {
            const title = row.replace(/[^\u4e00-\u9fff]/g, '');
            const candidates = names.filter(
                (entry) =>
                    entry.name.length >= 3 &&
                    entry.name.length === title.length &&
                    [...entry.name].filter((char, i) => char !== title[i]).length === 1,
            );
            if (candidates.length !== 1) continue;
            named = { ...candidates[0], index: 0 };
            break;
        }
    }
    if (named) {
        slot = named.family === 'weapon' ? '武器' : (GROUP_SLOTS[named.group] ?? null);
        detail.name = named.name;
        detail.kind = GROUP_KINDS[named.group] ?? named.group;
    }
    const jade = /上古玉[魄魂][·・.。]?([阴阳])/.exec(text);
    const spirit = /灵饰类型\]?:?(戒指|耳饰|配饰|手镯)/.exec(text);
    if (jade) {
        slot = jade[1] === '阴' ? '玉魄·阴' : '玉魄·阳';
        detail.name = `上古玉魄·${jade[1]}`;
        detail.kind = detail.name;
    } else if (spirit) {
        slot = spirit[1] as GearSlotName;
        detail.kind = `灵饰 · ${slot}`;
    }

    const stats: GearStat[] = [];
    const cond: GearStat[] = [];
    const effects: NonNullable<GearDetail['lines']> = [];
    const requires: string[] = [];
    const selectedSlot = slot ?? fallbackSlot;
    const isJade = selectedSlot?.startsWith('玉魄') ?? false;
    const isSpirit = ['戒指', '耳饰', '配饰', '手镯'].includes(selectedSlot ?? '');
    // 连续符石常被 OCR 合成纵向「符符符」「石石石」，按区域排除，不能只跳过带前缀的行。
    const runeTop = Math.min(
        ...lines
            .filter((line) => /^(?:符石|符{2,}|石{2,}|星位|星相互合)/.test(line.text.trim()))
            .map((line) => line.y),
    );
    let enhanced = false;
    let readingStats = true;
    let readingMelt = false;
    for (const { text: row, green, y } of bands) {
        if (!isSpirit && !isJade && y >= runeTop) readingStats = false;
        if (/^熔炼效果/.test(row)) readingMelt = true;
        if (readingMelt) {
            stats.push(...meltStats(row));
            continue;
        }
        const rune = /^符石组合:?([^:].*)/.exec(row);
        if (rune) {
            effects.push({ label: '符石组合', value: rune[1], tone: 'ochre' });
            continue;
        }
        const special = /^(特技|特效|套装效果|套装(?!效果)|奇袭道具|奇袭特技):?([^:].*)/.exec(row);
        if (special) {
            const label = special[1] === '套装效果' ? '套装' : special[1];
            const value = special[2] === '[空]' ? '空' : special[2];
            if (isSpirit && label === '特效' && /\(\d+级\)/.test(value)) {
                cond.push({ label: '钟灵石', value });
                readingStats = false;
                continue;
            }
            effects.push({ label, value, tone: label === '特技' ? 'seal' : 'ochre' });
            continue;
        }
        const maker = /^制造者:(.+)/.exec(row);
        if (maker) {
            detail.foot = `制造者：${maker[1]}`;
            continue;
        }
        // 等级进自己的数字格（用户 2026-11-11：「等级条件，修改为等级，我们只记录等级即可」）；
        // 五行与装备角色不是等级，仍留在条件里，浮片照旧能读到。
        const level = /(?:^|\])等级:?(\d{1,3})/.exec(row);
        if (level) detail.level = Number(level[1]);
        const element = /五行:?([金木水火土])/.exec(row);
        if (element) requires.push(`五行 ${element[1]}`);
        const role = /装备角色\]?:?(.+)/.exec(row);
        if (role) requires.push(role[1]);
        for (const match of row.matchAll(
            /(耐久度?|锻炼等级|精炼等级|灵尘等级|修理失败):?(\d+)(?:次)?/g,
        )) {
            cond.push({
                label: match[1].startsWith('耐久') ? '耐久度' : match[1],
                value: match[2],
            });
            enhanced = true;
        }
        const gem = /镶嵌宝石:?(.+?)(?=特技:|特效:|套装|$)/.exec(row);
        if (gem) cond.push({ label: '镶嵌宝石', value: gem[1] });
        const bell = /^钟灵石:?(.+)/.exec(row);
        if (bell) {
            cond.push({ label: '钟灵石', value: bell[1] });
            readingStats = false;
        }
        const sockets = /开运孔数:?(\d+孔\/\d+孔)/.exec(row);
        if (sockets) {
            cond.push({ label: '开运孔数', value: sockets[1] });
            if (!isSpirit && !isJade) readingStats = false;
        }
        // 只吃以属性名开头的行，忽略特技说明、套装说明及背包透出的文字。
        if (!readingStats || !STAT_LABELS.some((label) => row.startsWith(label))) continue;
        for (const match of row.matchAll(STAT_PATTERN)) {
            const label = ['抗封印命中等级', '抵抗封印等级'].includes(match[1])
                ? '抵抗封印命中等级'
                : match[1];
            const ambush = label === '奇袭法术';
            const trait = isJade
                ? !ambush && GEAR_JADE_EFFECTS.some((one) => one === label)
                : !isSpirit && GEAR_TRAITS.some((one) => one === label);
            const gain =
                trait || ambush
                    ? false
                    : isSpirit || isJade
                      ? enhanced || !!match[3]
                      : (green ?? enhanced);
            stats.push({
                label,
                value: match[2],
                ...(match[3] && !ambush && !trait ? { extra: match[3] } : {}),
                ...(gain || (match[3] && !ambush && !trait) ? { gain: true } : {}),
                ...(trait
                    ? { group: 'trait' as const }
                    : !isSpirit && !isJade && green === false
                      ? { group: 'base' as const }
                      : {}),
            });
        }
    }
    const upgrade = cond.find((row) => row.label === (isJade ? '灵尘等级' : '精炼等级'));
    const rank = Number(upgrade?.value);
    if ((isSpirit || isJade) && Number.isInteger(rank) && rank > 0) {
        for (const stat of stats) {
            const perRank = STAR_GAINS[stat.label];
            if (
                stat.group === 'melt' ||
                stat.group === 'trait' ||
                !stat.gain ||
                stat.extra ||
                !perRank ||
                stat.value.includes('%')
            )
                continue;
            stat.extra = `+${rank * perRank * (isJade ? JADE_GAIN_FACTOR : 1)}`;
        }
    }
    if (stats.length) detail.stats = stats;
    if (cond.length) detail.cond = cond;
    if (effects.length) detail.lines = effects;
    if (requires.length) detail.requires = [...new Set(requires)];
    // 名字未读出时，只用无歧义的属性组合；衣服与腰带都有气血防御，不能互猜。
    if (!slot && stats.some((stat) => stat.label === '灵力')) slot = '项链';
    if (
        !slot &&
        stats.some((stat) => stat.label === '命中') &&
        stats.some((stat) => stat.label === '伤害')
    )
        slot = '武器';
    if (!slot && stats.length) slot = fallbackSlot ?? null;
    const hit =
        stats.length +
        cond.length +
        effects.length +
        requires.length +
        (detail.level ? 1 : 0) +
        (detail.name ? 1 : 0);
    return { slot, detail, hit, total: hit };
}

/** 同部位整件覆盖，仅保留自用备注；多条同名属性仍按截图原样记录。 */
export function mergeGearPanel(original: GearSlot, result: GearPanelResult): GearSlot {
    if (!result.slot || result.slot !== original.slot || !result.hit) return original;
    const patch = result.detail;
    const detail: GearDetail = {
        name: '',
        kind: '',
        stats: [],
        ...patch,
    };
    detail.stats = (patch.stats ?? []).map((row) => ({ ...row }));
    if (patch.cond) detail.cond = patch.cond.map((row) => ({ ...row }));
    if (patch.lines) detail.lines = patch.lines.map((row) => ({ ...row }));
    if (patch.requires) detail.requires = [...patch.requires];
    if (original.detail?.note !== undefined) detail.note = original.detail.note;
    return { ...original, caption: detail.name, detail };
}
