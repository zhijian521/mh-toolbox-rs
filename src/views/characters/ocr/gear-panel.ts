import type { EquipmentName } from '../../../services/game-data';
import type { CharacterData } from '../character';
import type { GearDetail, GearSlot, GearSlotName, GearStat } from '../gear';
import type { OcrLine } from './attr-panel';

/** 一次识别一件，缺失字段不猜值；应用时按部位整件替换。 */
export interface GearPanelResult {
    slot: GearSlotName | null;
    detail: Partial<GearDetail>;
    hit: number;
    total: number;
}

const GROUP_SLOTS: Record<string, GearSlotName> = {
    toukui: '头',
    fachai: '头',
    kaijia: '衣服',
    nvyi: '衣服',
    xianglian: '项链',
    yaodai: '腰带',
    xiezi: '鞋子',
    jiezhi: '戒指',
    ershi: '耳饰',
    peishi: '配饰',
    shouzhuo: '手镯',
};
const GROUP_KINDS: Record<string, string> = {
    toukui: '头盔',
    fachai: '发钗',
    kaijia: '铠甲',
    nvyi: '女衣',
    xianglian: '项链',
    yaodai: '腰带',
    xiezi: '鞋子',
    jiezhi: '灵饰 · 戒指',
    ershi: '灵饰 · 耳饰',
    peishi: '灵饰 · 配饰',
    shouzhuo: '灵饰 · 手镯',
};
const STAT_LABELS = [
    '抵抗封印命中等级',
    '抗封印命中等级',
    '物理暴击等级',
    '法术暴击等级',
    '封印命中等级',
    '固定伤害',
    '治疗能力',
    '气血回复效果',
    '法术伤害结果',
    '法术防御',
    '法术伤害',
    '物理伤害',
    '封印命中率',
    '抗物理暴击等级',
    '抗法术暴击等级',
    '奇袭法术',
    '穿刺效果',
    '格挡值',
    '躲避',
    '命中',
    '伤害',
    '防御',
    '灵力',
    '气血',
    '魔法',
    '速度',
    '体质',
    '魔力',
    '力量',
    '耐力',
    '敏捷',
].sort((a, b) => b.length - a.length);
const STAT_PATTERN = new RegExp(
    `(${STAT_LABELS.join('|')})[:：]?([+\\-]?\\d+(?:\\.\\d+)?%?)(?:\\[([+\\-]?\\d+(?:\\.\\d+)?%?)\\])?`,
    'g',
);

function compact(text: string): string {
    return text
        .normalize('NFKC')
        .replace(/\s/g, '')
        .replace(/[【]/g, '[')
        .replace(/[】]/g, ']')
        .replace(/[−—]/g, '-')
        .replace(/佩饰/g, '配饰');
}

/** 同一基线的标签、数值与方括号先拼回一行，避免 OCR 分框影响字段配对。 */
function textRows(lines: readonly OcrLine[]): string[] {
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
    return rows.map((row) =>
        compact(
            row
                .sort((a, b) => a.x - b.x)
                .map((one) => one.text)
                .join(''),
        ),
    );
}

export function parseGearPanel(
    lines: readonly OcrLine[],
    names: readonly EquipmentName[] = [],
    fallbackSlot?: GearSlotName,
): GearPanelResult {
    const rows = textRows(lines);
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
    let enhanced = false;
    for (const row of rows) {
        const special = /^(特技|特效|套装效果|套装(?!效果)|奇袭道具|奇袭特技):?([^:].*)/.exec(row);
        if (special) {
            const label = special[1] === '套装效果' ? '套装' : special[1];
            const value = special[2] === '[空]' ? '空' : special[2];
            effects.push({ label, value, tone: label === '特技' ? 'seal' : 'ochre' });
            continue;
        }
        const maker = /^制造者:(.+)/.exec(row);
        if (maker) {
            detail.foot = `制造者：${maker[1]}`;
            continue;
        }
        const level = /(?:^|\])等级:?(\d{1,3})/.exec(row);
        if (level) requires.push(`等级 ${level[1]}`);
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
        const bell = /钟灵石:?(.+)/.exec(row);
        if (bell) cond.push({ label: '钟灵石', value: bell[1] });
        const sockets = /开运孔数:?(\d+孔\/\d+孔)/.exec(row);
        if (sockets) cond.push({ label: '开运孔数', value: sockets[1] });
        // 只吃以属性名开头的行，忽略特技说明、套装说明及背包透出的文字。
        if (!STAT_LABELS.some((label) => row.startsWith(label))) continue;
        for (const match of row.matchAll(STAT_PATTERN)) {
            const label = match[1] === '抗封印命中等级' ? '抵抗封印命中等级' : match[1];
            stats.push({
                label,
                value: match[2],
                ...(match[3] ? { extra: match[3] } : {}),
                ...(enhanced || match[3] ? { gain: true } : {}),
            });
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
        stats.length + cond.length + effects.length + requires.length + (detail.name ? 1 : 0);
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

export function applyGearPanel(character: CharacterData, result: GearPanelResult): CharacterData {
    return { ...character, gear: character.gear.map((slot) => mergeGearPanel(slot, result)) };
}
