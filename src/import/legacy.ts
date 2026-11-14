/** Electron v10 的唯一转换入口；只产出当前结构，不读写文件或修改任何 store。 */
import type {
    AccountEntry,
    IncomeEntry,
    OnlineSession,
    PriceItem,
    QuickPrice,
} from '../services/bindings';
import { storySkills } from '../services/game-data';
import { ATTR_GROUPS, GEAR_RULES, GEAR_SLOTS, TRAINING_GROUPS } from '../services/game-rules';
import { dateText, isDayText } from '../services/format';
import { isObject, text } from '../services/shape';
import { normalizeCharacter } from '../views/characters/roster';
import type { CharacterData } from '../views/characters/character';
import type { GearDetail, GearSlot, GearSlotName, GearStat } from '../views/characters/gear';
import { parseGearPanel } from '../views/characters/ocr/gear-panel';
import type { Goal, GoalTracking } from '../views/goals/goals';
import { cardCostByDay } from '../views/income/online';
import { netByDay } from '../views/income/trend-chart';
import { AUTO_CARD, AUTO_INCOME, dailyKey } from '../views/accounts/daily-sync';

type Row = Record<string, unknown>;
const WAN = 10000;
const EQUIPMENT_STATS: Record<string, string> = {
    hit: '命中',
    damage: '伤害',
    defense: '防御',
    hp: '气血',
    mp: '魔法',
    spirit: '灵力',
    dodge: '躲避',
    constitution: '体质',
    magic: '魔力',
    strength: '力量',
    endurance: '耐力',
    agility: '敏捷',
    speed: '速度',
    spellDamage: '法术伤害',
    spellDefense: '法术防御',
    fixedDamage: '固定伤害',
    healing: '治疗能力',
    seal: '封印命中等级',
    resistSeal: '抵抗封印命中等级',
    physicalCrit: '物理暴击等级',
    spellCrit: '法术暴击等级',
    rage: '狂暴等级',
    pierce: '穿刺等级',
    block: '格挡值',
    recovery: '气血回复效果',
    resistPhysicalCrit: '抗物理暴击等级',
    resistSpellCrit: '抗法术暴击等级',
    抵抗封印等级: '抵抗封印命中等级',
    气血恢复效果: '气血回复效果',
};
const TRAINING = {
    attack: '攻击修炼',
    defense: '防御修炼',
    magic: '法术修炼',
    resistance: '抗法修炼',
    hunting: '猎术修炼',
};
const PET_TRAINING = {
    attack: '攻击控制力',
    defense: '防御控制力',
    magic: '法术控制力',
    resistance: '抗法控制力',
    breeding: '育兽术',
};
const SLOT: Record<string, GearSlotName> = {
    头盔: '头',
    发钗: '头',
    衣服: '衣服',
    铠甲: '衣服',
    佩饰: '配饰',
    玉魄阳: '玉魄·阳',
    玉魄阴: '玉魄·阴',
};

export interface LegacyBackup {
    format: 1;
    app: 'mh-toolbox-rs';
    exportedAt: number;
    characters: CharacterData[];
    prices: PriceItem[];
    income: IncomeEntry[];
    accounts: AccountEntry[];
    goals: Goal[];
    online: OnlineSession[];
    quickPrices: QuickPrice[];
    cardSettings: { cardPrice: number; cardCost: boolean };
}

export interface LegacyConversion {
    backup: LegacyBackup;
    warnings: string[];
}

function object(value: unknown): Row {
    return isObject(value) ? value : {};
}

function number(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'number' && typeof value !== 'string')
        throw new Error('旧版文件含有无效数值');
    const result = Number(value);
    if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER)
        throw new Error('旧版文件含有无效或过大的数值');
    return result;
}

function list(value: unknown, label: string): Row[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some((one) => !isObject(one)))
        throw new Error(`${label}格式无效`);
    return value as Row[];
}

function records(value: unknown, label: string): Row[] {
    const result = list(value, label);
    const ids = new Set<string>();
    for (const row of result) {
        const id = text(row.id);
        if (!id || id.trim() !== id || ids.has(id)) throw new Error(`${label}存在缺失或重复的 ID`);
        ids.add(id);
    }
    return result;
}

function day(value: unknown): string {
    const result = text(value);
    if (!isDayText(result)) throw new Error('旧版文件含有无效日期');
    return result;
}

function money(value: unknown): number {
    const result = Math.round(number(value) * WAN);
    if (!Number.isSafeInteger(result)) throw new Error('旧版金额超出安全范围');
    return result;
}

function statRows(value: unknown, group: GearStat['group']): GearStat[] {
    return list(value, '装备属性')
        .map((row) => ({
            label:
                EQUIPMENT_STATS[text(row.key)] ??
                (text(row.key) || text(row.label) || text(row.name)),
            value: String(row.value ?? ''),
            extra: row.boost == null ? undefined : String(row.boost),
            group,
        }))
        .filter((row) => row.label);
}

function equipmentDetail(row: Row, slot: GearSlotName): GearDetail {
    const detail = object(row.details);
    if (row.details != null && detail.version !== 1) throw new Error('旧装备的属性版本无法识别');
    const source = [
        text(row.name),
        `等级 ${number(row.level)}`,
        text(row.attributes) ||
            ['base', 'extra1', 'extra2'].map((key) => text(object(row.jade)[key])).join('\n'),
        text(row.special),
        text(row.gems),
    ].join('\n');
    const parsed = parseGearPanel(
        source
            .split('\n')
            .map((line, i) => ({ text: line, x: 0, y: i * 24, width: 600, height: 20, score: 1 })),
        [],
        slot,
    ).detail;
    const stats =
        detail.version === 1
            ? [
                  ...statRows(detail.base, 'base'),
                  ...statRows(detail.extra, 'extra'),
                  ...statRows(detail.bonus, 'gem'),
                  ...statRows(detail.melt, 'melt'),
              ]
            : (parsed.stats ?? []);
    const lines =
        detail.version === 1
            ? [
                  ...(text(detail.technique)
                      ? [{ label: '特技', value: text(detail.technique), tone: 'ochre' as const }]
                      : []),
                  ...(Array.isArray(detail.effects)
                      ? detail.effects.map((one) => ({
                            label: '特效',
                            value: text(one),
                            tone: 'ochre' as const,
                        }))
                      : []),
                  ...(text(detail.suit)
                      ? [{ label: '套装效果', value: text(detail.suit), tone: 'moss' as const }]
                      : []),
              ]
            : (parsed.lines ?? []);
    const cond =
        detail.version === 1
            ? [
                  ...(detail.forge == null
                      ? []
                      : [
                            {
                                label:
                                    GEAR_RULES[slot]?.category === 'spirit'
                                        ? '精炼等级'
                                        : '锻炼等级',
                                value: String(detail.forge),
                            },
                        ]),
                  ...(detail.durability == null
                      ? []
                      : [{ label: '耐久度', value: String(detail.durability) }]),
                  ...(detail.repair == null
                      ? []
                      : [{ label: '修理失败', value: String(detail.repair) }]),
                  ...(Array.isArray(detail.gems) && detail.gems.length
                      ? [
                            {
                                label: '镶嵌宝石',
                                value: detail.gems
                                    .map((one) => text(object(one).type))
                                    .filter(Boolean)
                                    .join('、'),
                            },
                        ]
                      : []),
              ]
            : (parsed.cond ?? []);
    const jade = object(row.jade);
    if (jade.dustLevel != null) cond.push({ label: '灵尘等级', value: String(jade.dustLevel) });
    if (jade.holes != null) cond.push({ label: '开运孔数', value: String(jade.holes) });
    if (text(object(detail.clock).name))
        cond.push({
            label: '钟灵石',
            value: `${text(object(detail.clock).name)}${object(detail.clock).level == null ? '' : ` (${number(object(detail.clock).level)}级)`}`,
        });
    const structuredJade = object(detail.jade);
    if (detail.version === 1) {
        for (const [key, label] of [
            ['dust', '灵尘等级'],
            ['holes', '开运孔数'],
        ] as const) {
            const value = structuredJade[key];
            if (value != null) {
                const existing = cond.find((one) => one.label === label);
                if (existing) existing.value = String(value);
                else cond.push({ label, value: String(value) });
            }
        }
        if (text(detail.runes))
            lines.push({ label: '符石组合', value: text(detail.runes), tone: 'ochre' });
        if (text(structuredJade.assault)) {
            const label = text(structuredJade.assault);
            const value = structuredJade.chance == null ? '' : `${number(structuredJade.chance)}%`;
            if (label === '奇袭法术') stats.push({ label, value, group: 'trait' });
            else lines.push({ label, value, tone: 'ochre' });
        }
    } else if (jade.durability != null) {
        cond.push({ label: '耐久度', value: String(jade.durability) });
    }
    const enchantments = structuredJade.enchantments ?? jade.enchantments;
    if (Array.isArray(enchantments)) {
        for (const value of enchantments) {
            if (!text(value)) continue;
            const parsed = parseGearPanel(
                [{ text: text(value), x: 0, y: 0, width: 600, height: 20, score: 1 }],
                [],
                slot,
            ).detail.stats;
            if (parsed.length)
                stats.push(...parsed.map((one) => ({ ...one, group: 'trait' as const })));
            else lines.push({ label: '开光强化', value: text(value), tone: 'ochre' });
        }
    }
    return {
        name: text(row.name),
        kind: text(row.slot),
        level: number(row.level) || undefined,
        stats,
        lines,
        cond,
        note: text(row.note) || undefined,
        requires: text(detail.element) ? [`五行 ${text(detail.element)}`] : parsed.requires,
        foot: text(detail.maker) || undefined,
    };
}

function character(
    raw: Row,
    equipment: Row[],
    used: Set<string>,
    warnings: Set<string>,
): CharacterData {
    const progress = object(raw.progress);
    const sets = list(raw.equipmentSets, '装备方案');
    const selectedIndex = number(raw.viewedEquipmentSet);
    if (sets.length && (!Number.isInteger(selectedIndex) || !sets[selectedIndex]))
        throw new Error('当前装备方案序号无效');
    const selected = sets[selectedIndex];
    const slots = object(selected?.slots);
    const gear: GearSlot[] = [];
    for (const slot of GEAR_SLOTS) {
        const references = Object.entries(slots)
            .filter(([key]) => (SLOT[key] ?? key) === slot)
            .map(([, id]) => text(id))
            .filter(Boolean);
        if (references.length > 1) throw new Error('装备方案同一部位引用了多件装备');
        const candidates = equipment.filter(
            (one) =>
                text(one.characterId) === raw.id &&
                (SLOT[text(one.slot)] ?? text(one.slot)) === slot &&
                one.status !== 'sold',
        );
        const item = references.length
            ? equipment.find((one) => one.id === references[0])
            : selected
              ? undefined
              : candidates.length === 1
                ? candidates[0]
                : undefined;
        if (
            references.length &&
            (!item ||
                item.characterId !== raw.id ||
                item.status === 'sold' ||
                (SLOT[text(item.slot)] ?? text(item.slot)) !== slot)
        )
            throw new Error('装备方案引用无效或装备归属不符');
        if (item) {
            gear.push({ slot, caption: text(item.name), detail: equipmentDetail(item, slot) });
            used.add(text(item.id));
            if (text(object(item.details).legacy))
                warnings.add('无法结构化的装备旧文本保留在原件中，不推测为当前属性。');
        }
    }
    if (sets.length > 1)
        warnings.add('装备只导入当前选中方案；其他方案和未装备物品保留在旧版原件中。');
    if (
        list(raw.growthHistory, '成长历史').length ||
        text(progress.note) ||
        object(raw.soulJade).unlocked
    )
        warnings.add('成长历史、养成备注和魂玉解锁信息没有对应页面，保留在旧版原件中。');
    const attrGroups = ATTR_GROUPS.map((group) => ({
        title: group.title,
        wide: group.wide,
        rows: group.labels.map((label) => ({
            label,
            value:
                label === '乾元丹'
                    ? String(progress.qianyuanPills ?? '')
                    : label === '潜能果'
                      ? String(progress.potentialFruits ?? '')
                      : '',
        })),
    }));
    const training = object(progress.training),
        petTraining = object(progress.petTraining);
    const levels = new Map([
        ...Object.entries(TRAINING).map(([key, name]) => [name, number(training[key])] as const),
        ...Object.entries(PET_TRAINING).map(
            ([key, name]) => [name, number(petTraining[key])] as const,
        ),
    ]);
    return normalizeCharacter({
        id: raw.id,
        name: raw.name,
        level: number(raw.level),
        school: raw.school,
        server: raw.server,
        guild: raw.guild,
        updatedAt: number(raw.updatedAt, number(raw.createdAt)),
        attrGroups,
        skills: list(progress.schoolSkills, '师门技能').map((one) => ({
            name: one.name,
            level: number(one.level),
            cap: 180,
        })),
        assists: list(progress.auxiliarySkills, '辅助技能').map((one) => ({
            name: one.name,
            level: number(one.level),
            kind: storySkills().includes(text(one.name)) ? 'story' : 'life',
            cap: 180,
        })),
        trainings: TRAINING_GROUPS.map((group) => ({
            title: group.title,
            rows: group.rows.map((row) => ({ name: row.name, level: levels.get(row.name) ?? 0 })),
        })),
        gear,
        pets: [],
    });
}

function tracking(raw: Row): GoalTracking | null {
    const source = object(raw.tracking),
        key = text(source.key);
    switch (source.category) {
        case 'level':
            return { category: 'level', key: '角色等级' };
        case 'schoolSkills':
            return { category: 'skill', key };
        case 'auxiliarySkills':
            return { category: 'assist', key };
        case 'training':
            if (Object.hasOwn(TRAINING, key))
                return { category: 'training', key: TRAINING[key as keyof typeof TRAINING] };
            break;
        case 'petTraining':
            if (Object.hasOwn(PET_TRAINING, key))
                return {
                    category: 'training',
                    key: PET_TRAINING[key as keyof typeof PET_TRAINING],
                };
            break;
        case 'qianyuanPills':
            return { category: 'attr', key: '乾元丹' };
        case 'potentialFruits':
            return { category: 'attr', key: '潜能果' };
    }
    if (raw.tracking != null) throw new Error('旧目标含有无法对应的养成项目，未执行导入');
    return null;
}

function goal(raw: Row, characters: CharacterData[], now: number): Goal {
    const metric = tracking(raw);
    const members = characters
        .filter((one) => raw.characterId === 'all' || one.id === raw.characterId)
        .map(({ id, name }) => ({ id, name }));
    if (!members.length) throw new Error('旧目标关联的角色不存在，未执行导入');
    const logs = records(raw.logs, '目标流水').map((one) => ({
        id: text(one.id),
        date: day(one.date),
        delta: number(one.delta),
        note: text(one.note),
        createdAt: number(one.createdAt),
    }));
    const base = number(
        raw.baseProgress,
        number(raw.current) - logs.reduce((sum, one) => sum + one.delta, 0),
    );
    if (!metric && base)
        logs.unshift({
            id: `legacy-base-${text(raw.id)}`,
            date: dateText(number(raw.createdAt, now)),
            delta: base,
            note: '旧版初始进度',
            createdAt: number(raw.createdAt, now),
        });
    if (!['money', 'gear', 'progress'].includes(text(raw.type)))
        throw new Error('旧目标类型不受支持');
    const target = number(raw.target);
    if (target <= 0) throw new Error('旧目标的目标值无效');
    return {
        id: text(raw.id),
        kind: metric
            ? 'growth'
            : raw.type === 'progress'
              ? 'manual'
              : (raw.type as 'money' | 'gear'),
        title: text(raw.title) || '旧版目标',
        members,
        target,
        unit: text(raw.unit) || (metric ? '级' : '万'),
        tracking: metric,
        deadline: raw.deadline ? day(raw.deadline) : '',
        note: text(raw.note),
        logs: metric ? [] : logs,
        createdAt: number(raw.createdAt, now),
    };
}

function onlineSessions(sessions: Row[], warnings: Set<string>): OnlineSession[] {
    const result: OnlineSession[] = [];
    const ids = new Set(sessions.map((row) => text(row.id)));
    for (const row of sessions) {
        const date = day(row.date);
        const range = row.mode === 'range';
        const start = range ? number(row.startAt) : new Date(`${date}T00:00:00`).getTime();
        const duration = range
            ? number(row.endAt) - start
            : Math.round(number(row.minutes) * 60000);
        if (
            start <= 0 ||
            duration <= 0 ||
            duration > 31 * 86400000 ||
            dateText(start) !== date ||
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(duration)
        )
            throw new Error('旧上线记录的时段或日期无效');
        const roster = Array.isArray(row.roster)
            ? [...new Set(row.roster.map(text).filter(Boolean))]
            : [];
        const count = Math.max(1, roster.length);
        if (!roster.length && number(row.accounts, 1) > 1)
            throw new Error('旧上线记录只有多开人数而没有角色名单，无法安全分账');
        const cost = money(row.cost);
        if (cost < 0 || (!roster.length && !text(row.characterId)))
            throw new Error('旧上线记录的费用或角色归属无效');
        if (cost === 0)
            warnings.add('旧版未计费时段保留时长，按原单价展示参考成本，账号账本不计入。');
        let elapsed = 0,
            allocated = 0,
            index = 0;
        while (elapsed < duration) {
            const startAt = range ? start + elapsed : start;
            const at = new Date(startAt);
            const midnight = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime();
            const length = Math.min(duration - elapsed, midnight - startAt);
            elapsed += length;
            // 老版跨日以 0.01 万为单位按累计比例取整，不能改用新版整币舍入。
            const cumulative =
                elapsed === duration ? cost : Math.round(((cost / 100) * elapsed) / duration) * 100;
            const sliceCost = cumulative - allocated;
            allocated = cumulative;
            const id = index === 0 ? text(row.id) : `${text(row.id)}-legacy-${index}`;
            if (index > 0 && ids.has(id)) throw new Error('拆分旧上线记录后的 ID 与已有记录冲突');
            ids.add(id);
            result.push({
                id,
                date: dateText(startAt),
                startAt,
                endAt: startAt + length,
                characterId: text(row.characterId),
                roster,
                cardPrice:
                    sliceCost > 0
                        ? sliceCost / ((length / 3600000) * 6 * count)
                        : number(row.cardPrice, 15000),
                cardCost: sliceCost > 0,
                note: text(row.note),
                createdAt: number(row.createdAt, startAt),
            });
            index++;
        }
        if (index > 1)
            warnings.add(
                '跨天上线按旧版每日费用拆段；超过一天的早期补记拆为同日期多段，保留总时长和费用。',
            );
    }
    return result;
}

/** 只接受有明确字段契约的 v10；未知版本拒绝，避免用猜测覆盖账本。 */
export function convertLegacyData(raw: string, now = Date.now()): LegacyConversion {
    const root: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (
        !isObject(root) ||
        root.schemaVersion !== 10 ||
        !Array.isArray(root.characters) ||
        !Array.isArray(root.transactions)
    )
        throw new Error('请选择老版 v10 的完整 JSON 备份');
    if (!GEAR_SLOTS.length || !TRAINING_GROUPS.length || !ATTR_GROUPS.length)
        throw new Error('游戏规则尚未加载，请稍后重试');
    const warnings = new Set<string>();
    const equipment = records(root.equipment, '装备'),
        used = new Set<string>();
    const characters = records(root.characters, '角色')
        .sort(
            (a, b) =>
                number(a.sortOrder, Infinity) - number(b.sortOrder, Infinity) ||
                number(b.createdAt) - number(a.createdAt),
        )
        .map((one) => character(one, equipment, used, warnings));
    if (used.size < equipment.length)
        warnings.add(`${equipment.length - used.size} 件非当前方案装备保留在旧版原件中。`);
    if (list(root.gearLogs, '装备历史').length)
        warnings.add('装备交易历史保留在旧版原件中，对应账号流水照常导入。');
    const income: IncomeEntry[] = [],
        accounts: AccountEntry[] = [];
    const sessions = records(root.sessions, '上线记录');
    const sessionIds = new Set(sessions.map((one) => text(one.id)));
    const settings = object(root.quickSettings),
        itemPrices = object(root.itemPrices);
    for (const row of records(root.transactions, '账目')) {
        if (!['income', 'expense'].includes(text(row.kind)))
            throw new Error('旧账目的收支方向无效');
        const common = {
            id: text(row.id),
            date: day(row.date),
            characterId: text(row.characterId),
            kind: text(row.kind),
            note: text(row.note),
            createdAt: number(row.createdAt, now),
        };
        if (number(row.fee) < 0) throw new Error('旧账目的手续费无效');
        if (row.ledger === 'earnings') {
            if (!['cash', 'reserve'].includes(text(row.currency)))
                throw new Error('旧收益记录的币种无效');
            if (
                row.kind === 'expense' &&
                row.category === '点卡' &&
                sessionIds.has(text(row.sessionId))
            )
                continue;
            let amount = money(row.amount);
            if (row.recordType === 'item') {
                const unit = number(itemPrices[String(row.itemId)], 0) || money(row.unitPrice);
                amount = money(Math.round(number(row.quantity) * (unit / WAN) * 100) / 100);
            }
            if (number(row.fee))
                warnings.add(
                    '收益手续费沿用旧版统计口径，不扣入收益金额；原字段完整留在旧版原件。',
                );
            if (amount <= 0) throw new Error('旧收益含有零值或负值记录，请先在老版补全单价');
            income.push({ ...common, amount, item: text(row.itemName) || text(row.category) });
        } else if (row.ledger === 'account') {
            if (row.source === 'settle') {
                warnings.add('旧版自动结算由新版按收益与点卡重新生成，避免重复记账。');
                continue;
            }
            if (!['rmb', 'cash', 'reserve'].includes(text(row.currency)))
                throw new Error('旧账号记录的币种无效');
            const amount = number(row.amount) + (row.kind === 'expense' ? 1 : -1) * number(row.fee);
            if (amount < 0) throw new Error('旧账号记录扣除手续费后金额无效');
            if (amount === 0) {
                warnings.add('手续费抵扣后净额为零的账号记录不生成流水，完整记录保留在旧版原件。');
                continue;
            }
            accounts.push({
                ...common,
                note: [
                    common.note,
                    number(row.fee)
                        ? `旧版手续费 ${number(row.fee)}${row.currency === 'rmb' ? '元' : '万'}（已计入金额）`
                        : '',
                ]
                    .filter(Boolean)
                    .join('；'),
                source: '',
                amount: row.currency === 'rmb' ? Math.round(amount * 100) / 100 : money(amount),
                currency: row.currency === 'rmb' ? 'rmb' : 'cash',
                category: text(row.category),
                channel: text(row.channel) || '游戏内',
            });
        } else throw new Error('旧账目缺少有效账本归属，请先用老版重新导出');
    }
    const online = onlineSessions(sessions, warnings);
    for (const [category, sums] of [
        [AUTO_INCOME, netByDay(income)],
        [
            AUTO_CARD,
            cardCostByDay(
                online.filter((one) => one.cardCost),
                now,
            ),
        ],
    ] as const) {
        for (const [key, amount] of sums) {
            if (!amount) continue;
            const at = key.indexOf('|'),
                date = key.slice(0, at),
                characterId = key.slice(at + 1);
            accounts.push({
                id: dailyKey(date, characterId, category),
                date,
                characterId,
                source: 'auto',
                kind: category === AUTO_CARD || amount < 0 ? 'expense' : 'income',
                currency: 'cash',
                category,
                channel: '游戏内',
                amount: Math.abs(amount),
                note: category === AUTO_CARD ? '在线时长折算' : '收益页自动同步',
                createdAt: now,
            });
        }
    }
    if (
        list(root.activeSessions, '正在计时记录').length ||
        (root.activeSessions == null && isObject(root.activeSession))
    )
        warnings.add('老版正在计时的时段不恢复，保留在原件中；请在新版重新上线。');
    const prices: PriceItem[] = records(root.prices, '物价').map((row) => ({
        id: text(row.id),
        name: text(row.name),
        category: text(row.category),
        sub: text(row.sub),
        unit: text(row.unit) || '个',
        note: text(row.note),
        createdAt: number(row.createdAt, now),
        updatedAt: number(row.updatedAt, now),
        points: records(row.logs, '物价历史').map((one) => ({
            id: text(one.id),
            date: day(one.date),
            price: number(one.price),
            note: text(one.note),
            createdAt: number(one.createdAt, now),
        })),
    }));
    const quickPrices = Object.entries(itemPrices)
        .map(([id, price]) => ({ itemId: Number(id), price: number(price) }))
        .filter((one) => one.price > 0);
    if (quickPrices.some((one) => !Number.isSafeInteger(one.itemId) || one.itemId <= 0))
        throw new Error('旧速记单价的物品编号无效');
    warnings.add(
        '物品收益按导入时的参考单价固定为金额；储备金并入梦幻币，账号手续费计入对应收支。',
    );
    warnings.add('“全部角色”目标改为当前角色快照；旧版排序与外观偏好不导入。');
    return {
        backup: {
            format: 1,
            app: 'mh-toolbox-rs',
            exportedAt: now,
            characters,
            prices,
            income,
            accounts,
            online,
            goals: records(root.goals, '目标').map((one) => goal(one, characters, now)),
            quickPrices,
            cardSettings: {
                cardPrice: number(settings.cardPrice, 15000),
                cardCost: settings.cardCost !== false,
            },
        },
        warnings: [...warnings],
    };
}
