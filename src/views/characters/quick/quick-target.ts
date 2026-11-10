import { normalizeGearDetail, normalizePet } from '../details';
/** 快速修改按行名、装备部位或召唤兽下标定位，返回新角色，存储由名册处理。 */
import {
    expWanValue,
    trainingDefaultCap,
    type AssistKind,
    type CharacterData,
    type GearDetail,
    type GearSlot,
    type GearSlotName,
    type Pet,
} from '../character';

/**
 * 一次快速修改指向什么。
 *
 * 六类各自用**自己那一页的定位键**：
 *   · 属性行、技能、辅助、修炼用名字；辅助多带一个 `kind`（生活 / 剧情各有一套名字，
 *     同名虽然今天不会出现，但 `normalizeAssists` 的查重键就是 `kind + name`，
 *     这里跟着它走，两边对同一件事只认一个键）；
 *   · 装备用部位（十二格住址固定，部位就是身份）；
 *   · 召唤兽用下标——`Pet` 没有 id，名字也可能重（两只「天狗」），下标是唯一稳的。
 */
export type QuickTarget =
    | { kind: 'attr'; label: string }
    | { kind: 'exp' }
    | { kind: 'skill'; name: string }
    | { kind: 'assist'; name: string; assist: AssistKind }
    | { kind: 'training'; name: string }
    | { kind: 'gear'; slot: GearSlotName }
    | { kind: 'pet'; index: number };

/**
 * 只改**一个数**的那五类。窄窗、字段表驱动，`quickPanel` / `applyQuick` 管它们。
 *
 * 装备与召唤兽不在这条路上（见文件头最后一段）：它们是整份对象，走
 * `applyGear` / `applyPet` 与各自的宽窗。
 */
export type QuickScalarTarget = Exclude<QuickTarget, { kind: 'gear' } | { kind: 'pet' }>;

/** `QuickTarget` 是不是五类单值项。分发器（`QuickEdit`）用它收窄类型。 */
export function isScalarTarget(target: QuickTarget): target is QuickScalarTarget {
    return target.kind !== 'gear' && target.kind !== 'pet';
}

/**
 * 弹窗里的一格。`value` 一律是字符串，数字在 `applyQuick` 里才转——见那边的说明。
 *
 * 值是**最终形态**（含单位）：经验那一格是 `3968.6万`，不是 `3968.6`。
 * 单位由 `unit` 单独写一份，给的是「输入格里显示时剥掉哪个后缀」——两处都写
 * 是因为 `applyQuick` 只会拿到 `value`，它必须能原样存下去。
 */
export interface QuickField {
    key: string;
    label: string;
    value: string;
    /** 数字格（`CounterField`：大号数字 + 两侧加减）。 */
    numeric?: boolean;
    /** 数字格的小数位。0（缺省）= 整数，输入时就把小数点清掉。 */
    precision?: number;
    /**
     * 加减一次的量；`'auto'` 按当前值的量级（1 / 10 / 100 / 1000）。
     *
     * 缺省 1：等级这类「一次一级」的字段不该被放大。
     * 气血、寿命这种四位数用 `'auto'`，否则点一次只动 1 点，等于没有加减。
     */
    step?: number | 'auto';
    /**
     * 后缀单位。**默认没有**——别照抄价格格的「万」。
     *
     * 这一屏只有经验需要它（那两格的值历来以万记），其余全是「级 / 段 / 个」这类
     * 不上单位的读数；给它们加一个「万」，读起来就像价格。
     */
    unit?: string;
}

export interface QuickPanel {
    title: string;
    fields: QuickField[];
}

/* ======================================================================
 * 读：卡片上那一项现在是什么
 * ==================================================================== */

function attrValue(character: CharacterData, label: string): string | undefined {
    return character.attrGroups.flatMap((group) => group.rows).find((row) => row.label === label)
        ?.value;
}

/**
 * 经验那一格要摆的数字：折成「万」，最多一位小数（`3968.6`）。
 *
 * 空值给空串（「还没记」是合法状态，不该硬塞一个 0）；**认不出来给 `null`**——
 * 那时调用方退回文本格，原样显示。不能给空串：那等于把用户手写的内容吞掉，
 * 而他点开只是想改个数。
 */
function expDigits(raw: string): string | null {
    const text = raw.trim();
    if (!text) return '';
    const value = expWanValue(text);
    if (value === null) return null;
    /* `toFixed(1)` 之后再 `Number`：整数不留 `.0`（`1414.2` 保留，`4200` 还是 `4200`）。 */
    return String(Number(value.toFixed(1)));
}

/**
 * 弹窗要画什么。找不到对应的项（数据在开窗与点击之间被改了、或者传错了名字）
 * 返回 `null`，调用方据此不开窗——画一个空窗比不画更让人以为坏了。
 *
 * 只服务五类单值项：装备与召唤兽是整份表单，见 `applyGear` / `applyPet`。
 */
export function quickPanel(character: CharacterData, target: QuickScalarTarget): QuickPanel | null {
    switch (target.kind) {
        case 'attr': {
            const value = attrValue(character, target.label);
            if (value === undefined) return null;
            return {
                title: `快速修改 · ${target.label}`,
                fields: [
                    {
                        key: 'value',
                        label: target.label,
                        value,
                        /* 四位数（气血 3916、寿命 4200）用 `'auto'`：一次 ±100 才顺手，
                         * 固定 1 那种加减等于让人点四百次。百位数落到 ±10，一位数 ±1。 */
                        numeric: true,
                        step: 'auto',
                    },
                ],
            };
        }

        case 'exp': {
            /* 这两格是这一屏**唯一带单位**的：经验历来以万记。
             * 值先规整成「万」的数字（`1.5亿` → `15000`），再加后缀——所以输入框里
             * 只有数字，单位是一枚固定的「万」；加减一次 1 万。
             *
             * 认不出来的写法（手打的乱码）**退回文本格**：硬转数字会把那一格清空，
             * 而用户点开只是想改个数，不是想丢掉它。 */
            const current = expDigits(character.experience.value);
            const need = expDigits(character.experience.need);
            return {
                title: '快速修改 · 经验',
                fields: [
                    {
                        key: 'value',
                        label: '当前经验',
                        value: current === null ? character.experience.value : current,
                        numeric: current !== null,
                        unit: current === null ? '' : '万',
                        precision: 1,
                        /* 四千多万的读数，一次 ±1 万要点四千下；按量级走，一次 ±100 万。 */
                        step: 'auto',
                    },
                    {
                        key: 'need',
                        label: '升级所需',
                        value: need === null ? character.experience.need : need,
                        numeric: need !== null,
                        unit: need === null ? '' : '万',
                        precision: 1,
                        step: 'auto',
                    },
                ],
            };
        }

        case 'skill': {
            const row = character.skills.find((one) => one.name === target.name);
            if (!row) return null;
            return {
                title: `快速修改 · ${target.name}`,
                /* **不给「上限」这一格**（2026-11-07 用户）：门派技能的上限一律 180，
                 * 是游戏定的，没有逐项不同的可能。摆一格让人填，只会问出一堆
                 * 「180 还是 160」的假问题，还得替每条数据记一个其实恒等的数。
                 * 数据里的 `cap` 一个字都不动——卡上判「满」读的仍是它。 */
                fields: [{ key: 'level', label: '等级', value: String(row.level), numeric: true }],
            };
        }

        case 'assist': {
            const row = character.assists.find(
                (one) => one.name === target.name && one.kind === target.assist,
            );
            if (!row) return null;
            return {
                title: `快速修改 · ${target.name}`,
                /* **不问上限**（2026-11-07 用户：「辅助技能的上限输入和相关逻辑删除」）。
                 *
                 * 与师门技能那一条同一个理由，只是它更绕一点：技能的上限恒为 180，
                 * 摆一格只会问出假问题；辅助的上限**真的逐项不同**（强身术 140、
                 * 调息 5），但它同样不在这扇窗里改——日常发生的事是「又点了两级」，
                 * 而上限跟着帮派与研究走，随手改掉一个其实不该动的数，卡上的「满」
                 * 就会错，且错得看不出来（`isMaxed` 只比大小）。
                 * 数据里的 `cap` 一个字都不动。 */
                fields: [{ key: 'level', label: '等级', value: String(row.level), numeric: true }],
            };
        }

        case 'training': {
            const row = character.trainings
                .flatMap((group) => group.rows)
                .find((one) => one.name === target.name);
            if (!row) return null;
            return {
                title: `快速修改 · ${target.name}`,
                fields: [{ key: 'level', label: '等级', value: String(row.level), numeric: true }],
            };
        }
    }
}

/* ======================================================================
 * 写：把这几格贴回整份角色
 * ==================================================================== */

/** 数字格 → 非负整数。空、非数字、负数一律 0，与 `NumberField` 同一条口径。 */
function num(raw: string | undefined): number {
    const parsed = Number((raw ?? '').trim());
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
}

/** 编辑草稿先 trim，读取边界则保留用户原文；两者共用详情形状和判空规则。 */
function trimText(value: unknown): unknown {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(trimText);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, trimText(one)]));
    }
    return value;
}

/**
 * 把弹窗里那几格贴回整份角色，返回**新的** `CharacterData`。
 *
 * 只替换被点的那一项，其余字段原样带过去（引用不变）：`update()` 是整条替换，
 * 所以这里必须给出一份完整对象，但没必要深拷贝——没改的部分共享引用不影响正确性，
 * 还让「哪一页因为这次改动重渲染」这件事更准确。
 *
 * 值一律按**字符串**传进来（弹窗里就是字符串）。数字在这里才转，理由与 `NumberField`
 * 相同：输入过程中的 `12` 不该先被规范化成 `1` 再写回光标位置。
 *
 * 只服务五类单值项：装备与召唤兽走 `applyGear` / `applyPet`（整份对象进出）。
 */
export function applyQuick(
    character: CharacterData,
    target: QuickScalarTarget,
    values: Record<string, string>,
): CharacterData {
    switch (target.kind) {
        case 'attr':
            return {
                ...character,
                attrGroups: character.attrGroups.map((group) =>
                    group.rows.some((row) => row.label === target.label)
                        ? {
                              ...group,
                              rows: group.rows.map((row) =>
                                  row.label === target.label
                                      ? { ...row, value: (values.value ?? '').trim() }
                                      : row,
                              ),
                          }
                        : group,
                ),
            };

        case 'exp':
            return {
                ...character,
                experience: {
                    value: (values.value ?? '').trim(),
                    need: (values.need ?? '').trim(),
                },
            };

        case 'skill':
            /* **`cap` 一个字都不动**：门派技能上限恒为 180，弹窗里也不再问
             * （见 `quickPanel` 的 skill 分支）。这里保留原值，等于「改等级不碰上限」，
             * 老数据里缺 `cap` 的那几条也不会被顺手塞一个数进来。 */
            return {
                ...character,
                skills: character.skills.map((row) =>
                    row.name === target.name ? { ...row, level: num(values.level) } : row,
                ),
            };

        case 'assist':
            /* 上限同上：辅助那一条 `cap` 不动（2026-11-07 用户要求删掉上限输入）。
             * 它虽然逐项不同（强身术 140 / 调息 5），但改动它的时机是「帮派研究升了」，
             * 不是「点开某一项」。 */
            return {
                ...character,
                assists: character.assists.map((row) =>
                    row.name === target.name && row.kind === target.assist
                        ? { ...row, level: num(values.level) }
                        : row,
                ),
            };

        case 'training':
            return {
                ...character,
                trainings: character.trainings.map((group) => ({
                    ...group,
                    rows: group.rows.map((row) =>
                        row.name === target.name
                            ? {
                                  ...row,
                                  level: num(values.level),
                                  cap:
                                      row.cap > 0
                                          ? row.cap
                                          : (trainingDefaultCap(row.name) ?? row.cap),
                              }
                            : row,
                    ),
                })),
            };
    }
}

/* ======================================================================
 * 装备与召唤兽：整份进、整份出
 * ==================================================================== */

/**
 * 装备：把**整份**贴回某一格。
 *
 * 空行与空详情统一交给 `normalizeGearDetail` 清理，与角色读档使用同一口径。
 * `caption` 为旧记录的独立短名，也可为详情全名兜底；仅填属性或备注的详情仍保留。
 */
export function applyGear(
    character: CharacterData,
    slotName: GearSlotName,
    next: { caption?: string; detail?: GearDetail },
): CharacterData {
    const caption = (next.caption ?? '').trim();
    const detail = next.detail
        ? normalizeGearDetail(
              trimText({ ...next.detail, name: next.detail.name.trim() || caption }),
          )
        : undefined;

    /* 空位也**占一格**：十二个部位是游戏定的、卡上 4×4 一格一个，
     * 清空只能把它变空，不能让它从数组里消失。 */
    const merged: GearSlot = detail
        ? { slot: slotName, caption: caption || detail.name, detail }
        : caption
          ? { slot: slotName, caption }
          : { slot: slotName };

    return {
        ...character,
        gear: character.gear.map((one) => (one.slot === slotName ? merged : one)),
    };
}

/**
 * 召唤兽：把**整份**贴回第几只。
 *
 * 与装备同一条理由（一只兽二十来格），另加两道兜底：
 *   · **名字必填**——`normalizePet` 会丢掉没有名字的兽，允许存空等于「点保存它就不见了」；
 *   · 属性里 `label` 空的行、技能与内丹里的空串一律清掉（同 `normalizePet`）。
 *
 * 按**下标**定位而不是名字：`Pet` 没有 id，两只「天狗」是正常的。
 */
export function applyPet(character: CharacterData, index: number, next: Pet): CharacterData {
    if (!character.pets[index]) return character;
    const pet = normalizePet(trimText(next));
    if (!pet) return character;
    const pets = [...character.pets];
    pets[index] = pet;
    return { ...character, pets };
}
