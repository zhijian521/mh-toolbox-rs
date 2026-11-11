import { describe, expect, it, vi } from 'vitest';
import type { CharacterData, GearDetail, GearSlotName, Pet } from '../character';
import { briefText, gearBrief } from '../gear';
import { emptyCharacter, normalizeCharacter } from '../roster';
import { applyGear, applyPet, applyQuick, quickPanel } from './quick-target';

/* `emptyCharacter()` 会调 `schoolSkills()` 填七项门派技能，而那个函数读的是
 * `fetch` 回来的真表——vitest 里没有启动流程，读到的永远是空表。换掉它：
 * 这一份测的是「快速修改怎么改」，与「哪个门派有哪七项」无关。 */
vi.mock('../schools', () => ({ schoolSkills: () => [] }));

/** 造一个能改的角色。属性随手填两个，其余留空——不复制 mock 里那一大坨假数据。 */
function base(): CharacterData {
    const character = emptyCharacter();
    character.name = '归岚';
    character.level = 130;
    character.skills = [
        { name: '周易学', level: 120, cap: 180 },
        { name: '潇湘仙雨', level: 115, cap: 180 },
    ];
    character.assists = [
        { name: '强身术', level: 100, cap: 140, kind: 'life' },
        { name: '调息', level: 5, cap: 5, kind: 'story' },
    ];
    character.pets = [
        {
            name: '天狗',
            level: 136,
            joinLevel: 65,
            quality: { attack: 1800, defense: 1500, hp: 3200, mp: 2100, speed: 1450, dodge: 1200 },
            life: 4200,
            growth: '1.202',
            element: '火',
            attrs: [{ label: '气血', value: '3906' }],
            skills: ['高级必杀'],
            innerPills: [],
        },
    ];
    return character;
}

function setAttr(character: CharacterData, label: string, value: string) {
    for (const group of character.attrGroups) {
        for (const row of group.rows) if (row.label === label) row.value = value;
    }
}

function attrOf(character: CharacterData, label: string): string {
    return (
        character.attrGroups.flatMap((group) => group.rows).find((row) => row.label === label)
            ?.value ?? ''
    );
}

function fieldValue(
    character: CharacterData,
    target: Parameters<typeof quickPanel>[1],
    key: string,
) {
    const panel = quickPanel(character, target);
    if (!panel) throw new Error('没有这一项');
    const field = panel.fields.find((one) => one.key === key);
    if (!field) throw new Error(`没有 ${key} 这一格`);
    return field.value;
}

/** 给某一格换上一份详情。装备那个抽屉在 `base()` 里是十二个空位。 */
function withGear(
    character: CharacterData,
    slot: GearSlotName,
    caption: string,
    detail: GearDetail,
) {
    return {
        ...character,
        gear: character.gear.map((one) => (one.slot === slot ? { slot, caption, detail } : one)),
    };
}

describe('快速修改：读现值', () => {
    it('属性行读的是那一行现在的数', () => {
        const character = base();
        setAttr(character, '气血', '3916');
        expect(fieldValue(character, { kind: 'attr', label: '气血' }, 'value')).toBe('3916');
    });

    /* 门派技能的上限一律 180（游戏定的），弹窗里**不给这一格**：
     * 摆一格让人填，只会问出「180 还是 160」这种假问题。 */
    it('师门技能只问等级，不问上限', () => {
        const character = base();
        const panel = quickPanel(character, { kind: 'skill', name: '周易学' });
        expect(panel?.fields.map((field) => field.label)).toEqual(['等级']);
    });

    /* 辅助那一条 2026-11-07 跟着删了（用户：「辅助技能的上限输入和相关逻辑删除」）。
     * 它的上限逐项不同（强身术 140 / 调息 5），但改动它的时机是「帮派研究升了」，
     * 不是「点开某一项」——摆一格出来只会让人顺手改掉一个不该动的数。 */
    it('辅助技能也只问等级，不问上限', () => {
        const character = base();
        const panel = quickPanel(character, { kind: 'assist', name: '调息', assist: 'story' });
        expect(panel?.fields.map((field) => field.label)).toEqual(['等级']);
    });

    it('修炼快速修改也只提供等级', () => {
        const panel = quickPanel(base(), { kind: 'training', name: '攻击修炼' });
        expect(panel?.fields.map((field) => field.key)).toEqual(['level']);
    });

    /* 经验是这一屏**唯一带单位**的：两格都折成「万」，输入框里只留数字，
     * 「万」是槽里那枚固定后缀。亿先折成万——一个屏里两种单位没法加减。 */
    it('经验折成「万」的数字，单位单独给', () => {
        const character = base();
        character.experience = { value: '3968.6万', need: '1.5亿' };
        const panel = quickPanel(character, { kind: 'exp' });
        expect(panel?.fields[0]).toMatchObject({ value: '3968.6', unit: '万', numeric: true });
        expect(panel?.fields[1]).toMatchObject({ value: '15000', unit: '万', numeric: true });
    });

    /* 认不出的写法退回文本格：硬转数字会把那一格清空，而用户点开只是想改个数。
     * 这一条与「属性行空值」不同——那是「还没填」，这是「填了别的东西」。 */
    it('经验写了认不出的字样时退回文本格，原值不动', () => {
        const character = base();
        character.experience = { value: '很多', need: '' };
        const panel = quickPanel(character, { kind: 'exp' });
        expect(panel?.fields[0].numeric).toBe(false);
        expect(panel?.fields[0].value).toBe('很多');
        expect(panel?.fields[0].unit).toBe('');
    });

    it('定位不到的项返回 null（不画空窗）', () => {
        const character = base();
        expect(quickPanel(character, { kind: 'attr', label: '不存在' })).toBeNull();
        expect(quickPanel(character, { kind: 'skill', name: '不存在' })).toBeNull();
    });
});

describe('快速修改：写回', () => {
    it('属性只改那一行，其余一个字都不动', () => {
        const character = base();
        setAttr(character, '气血', '3916');
        setAttr(character, '命中', '1915');

        const next = applyQuick(character, { kind: 'attr', label: '气血' }, { value: '4010' });

        expect(attrOf(next, '气血')).toBe('4010');
        expect(attrOf(next, '命中')).toBe('1915');
        /* 原对象不动：卡片上那一份是 `roster` 里的，改不成就地改会绕过 `update()`。 */
        expect(attrOf(character, '气血')).toBe('3916');
    });

    it('属性清空就是清空（不是 0）', () => {
        const character = base();
        setAttr(character, '气血', '3916');
        const next = applyQuick(character, { kind: 'attr', label: '气血' }, { value: '  ' });
        expect(attrOf(next, '气血')).toBe('');
    });

    it('经验两个字段一起换，单位原样留着', () => {
        const character = base();
        const next = applyQuick(
            character,
            { kind: 'exp' },
            { value: '3968.6万', need: '1414.2万' },
        );
        expect(next.experience).toEqual({ value: '3968.6万', need: '1414.2万' });
    });

    it('技能：只改等级，上限原样不动', () => {
        const character = base();
        const next = applyQuick(character, { kind: 'skill', name: '周易学' }, { level: '121' });
        const row = next.skills.find((one) => one.name === '周易学');
        expect(row?.level).toBe(121);
        /* 上限不在弹窗里，也就不该被这次修改碰到——它恒为 180，
         * 改一次等级顺手把 `cap` 写成 undefined，卡上就不再标「满」了。 */
        expect(row?.cap).toBe(180);
        expect(next.skills.find((one) => one.name === '潇湘仙雨')?.level).toBe(115);
    });

    it('辅助：只改等级，上限原样不动', () => {
        const character = base();
        const next = applyQuick(
            character,
            { kind: 'assist', name: '调息', assist: 'story' },
            { level: '6' },
        );
        const row = next.assists.find((one) => one.kind === 'story');
        expect(row?.level).toBe(6);
        /* 上限那一格已经不在窗里了，**更不能顺手写成 undefined**：
         * 卡上的「满」读的就是它（`isMaxed`），丢了就永远不标满。 */
        expect(row?.cap).toBe(5);
        expect(next.assists.find((one) => one.kind === 'life')?.level).toBe(100);
    });

    it('修炼只改等级，忽略上限输入且不保留旧上限', () => {
        const character = base();
        const next = applyQuick(
            character,
            { kind: 'training', name: '攻击修炼' },
            { level: '23', cap: '20' },
        );
        const row = next.trainings
            .flatMap((group) => group.rows)
            .find((one) => one.name === '攻击修炼');
        expect(row).toEqual({ name: '攻击修炼', level: 23 });
        expect(character.trainings[0].rows[0].level).toBe(0);
    });
});

/* 装备与召唤兽**整份进、整份出**（2026-11-07 用户：「装备和宝宝比较复杂，
 * 直接展示某个装备和宝宝的所有内容进行修改」）。所以这里不再是「几格字符串」，
 * 而是一份 `GearDetail` / `Pet`。 */
describe('装备：整份进出', () => {
    const detail: GearDetail = {
        name: '霜冷九州',
        kind: '帽子',
        flavor: '雪线之上的一顶旧盔。',
        requires: ['等级 130', '女'],
        stats: [
            { label: '防御', value: '+45' },
            { label: '气血', value: '+200', gain: true },
        ],
        cond: [
            { label: '锻炼等级', value: '5' },
            { label: '镶嵌宝石', value: '太阳石' },
        ],
        lines: [{ label: '特技', value: '起死回生', tone: 'seal' }],
        foot: '制造者：欧冶子',
        note: '任务用，暂不更换',
    };

    it('整份装备字段与备注一起保存，不影响其他部位', () => {
        const character = withGear(base(), '头', '霜冷九州', detail);
        const next = applyGear(character, '头', { caption: '霜冷九州', detail });
        const slot = next.gear.find((one) => one.slot === '头');
        expect(slot?.caption).toBe('霜冷九州');
        expect(slot?.detail).toEqual(detail);
        /* 其余十一格原封不动。 */
        expect(next.gear.filter((one) => one.slot !== '头')).toEqual(
            character.gear.filter((one) => one.slot !== '头'),
        );
    });

    it('改段数之后版心摘要跟着变', () => {
        const character = withGear(base(), '头', '霜冷九州', detail);
        const edited: GearDetail = {
            ...detail,
            cond: [
                { label: '锻炼等级', value: '8' },
                { label: '镶嵌宝石', value: '太阳石' },
            ],
        };
        const next = applyGear(character, '头', { caption: '霜冷九州', detail: edited });
        const gem = gearBrief(next.gear, { special: '', suit: '' })
            .flatMap((group) => group.rows)
            .find((row) => row.key === 'gem');
        /* 摘要按「锻炼等级」这个词读段数（宝石那一行的值），写死一处不认另一处就会
         * 「摘要与格子各说一套」。头那一格从 0 变成 8。 */
        expect(briefText(gem!)).toBe('头8 · 项0 · 武0 · 衣0 · 带0 · 鞋0');
    });

    it('修改和清空装备备注只影响目标草稿，保存时去掉首尾空白', () => {
        const character = withGear(base(), '头', '霜冷九州', detail);
        const edited = applyGear(character, '头', {
            caption: '霜冷九州',
            detail: { ...detail, note: '  自用\n下次换装  ' },
        });
        expect(edited.gear.find((one) => one.slot === '头')?.detail?.note).toBe('自用\n下次换装');
        const cleared = applyGear(edited, '头', {
            caption: '霜冷九州',
            detail: { ...detail, note: '' },
        });
        expect(cleared.gear.find((one) => one.slot === '头')?.detail?.note).toBeUndefined();
        expect(character.gear.find((one) => one.slot === '头')?.detail?.note).toBe(detail.note);
    });

    /* 空行判据必须与 `normalizeGearDetail` 一致：那边重载时会丢，这边保存时若不丢，
     * 就会出现「刚保存时浮片上多两行空白、重载后它们又不见了」。 */
    it('标签空的行清掉（属性 / 状态 / 特殊三处）', () => {
        const character = withGear(base(), '头', '霜冷九州', detail);
        const next = applyGear(character, '头', {
            caption: '霜冷九州',
            detail: {
                ...detail,
                stats: [...detail.stats, { label: '  ', value: '+1' }],
                cond: [...(detail.cond ?? []), { label: '', value: '941' }],
                lines: [...(detail.lines ?? []), { label: '', value: '无', tone: 'seal' }],
            },
        });
        const slot = next.gear.find((one) => one.slot === '头');
        expect(slot?.detail?.stats).toHaveLength(2);
        expect(slot?.detail?.cond).toHaveLength(2);
        expect(slot?.detail?.lines).toHaveLength(1);
    });

    it('详情全空 → 这一格回到空位', () => {
        const character = withGear(base(), '头', '霜冷九州', detail);
        const next = applyGear(character, '头', {
            caption: '',
            detail: { name: '', kind: '', stats: [] },
        });
        /* 空位**占格**：十二个部位是游戏定的，清空只能变空，不能少一行。 */
        expect(next.gear.find((one) => one.slot === '头')).toEqual({ slot: '头' });
        expect(next.gear).toHaveLength(12);
    });

    /* `caption` 是卡上那个短名，与 `detail` 分开存：老数据里有一批「只有简称」的形状，
     * `normalizeCharacter` 会保留它，这里不能把它连同详情一起清掉。 */
    it('只填了装备名也算穿了', () => {
        const next = applyGear(base(), '头', { caption: '霜冷九州' });
        expect(next.gear.find((one) => one.slot === '头')).toEqual({
            slot: '头',
            caption: '霜冷九州',
        });
    });

    /* 空格装备上加了两条状态、却只在「装备名」那一格写了字——此时 `detail.name` 是空的。
     * 若按「名称与类型都空 = 没录」整份丢掉，那两条状态就白填了（真踩到过）。
     * 判据因此先拿卡上那个短名兜底：两处填的是同一件事。 */
    it('只填了装备名时，全名兜底成它，状态不丢', () => {
        const next = applyGear(base(), '头', {
            caption: '霜冷九州',
            detail: { name: '', kind: '', stats: [], cond: [{ label: '锻炼等级', value: '5' }] },
        });
        const slot = next.gear.find((one) => one.slot === '头');
        expect(slot?.detail?.name).toBe('霜冷九州');
        expect(slot?.detail?.cond).toEqual([{ label: '锻炼等级', value: '5' }]);
    });

    /* 兜底：只填类型、没填名字的装备，`name` 落成 `kind`（与 `normalizeGearDetail` 同一条）。 */
    it('只填类型时全名兜底成类型', () => {
        const next = applyGear(base(), '头', {
            caption: '',
            detail: { name: '', kind: '帽子', stats: [] },
        });
        const slot = next.gear.find((one) => one.slot === '头');
        expect(slot?.caption).toBe('帽子');
        expect(slot?.detail?.name).toBe('帽子');
    });
});

describe('召唤兽：整份进出', () => {
    const pet = (): Pet => ({
        name: '天狗',
        portrait: '',
        points: [],
        level: 136,
        joinLevel: 65,
        quality: { attack: 1800, defense: 1500, hp: 3200, mp: 2100, speed: 1450, dodge: 1200 },
        life: 4200,
        growth: '1.202',
        element: '火',
        attrs: [{ label: '气血', value: '3906' }],
        skills: ['高级必杀', '连击'],
        innerPills: ['狂怒'],
        spirit: 30,
    });

    it('身份、资质、属性、技能、内丹一起贴回去', () => {
        const character = base();
        const next = applyPet(character, 0, pet());
        expect(next.pets[0]).toEqual(pet());
        expect(next.pets).toHaveLength(1);
    });

    it('按下标改，其余各只不动', () => {
        const character = base();
        character.pets.push({ ...character.pets[0], name: '小龙女' });
        const edited = { ...pet(), name: '小龙女', level: 140 };
        const next = applyPet(character, 1, edited);
        expect(next.pets[1].level).toBe(140);
        expect(next.pets[0]).toEqual(character.pets[0]);
    });

    /* 名字必填不是因为表单好看：`normalizePet` 会丢掉没有名字的兽，允许存空等于
     * 「点保存它就不见了」。弹窗的保存按钮也据此禁用，这里是第二道。 */
    it('名字空着，整份原样返回', () => {
        const character = base();
        expect(applyPet(character, 0, { ...pet(), name: '  ' })).toBe(character);
        expect(applyPet(character, 9, pet())).toBe(character);
    });

    it('属性里标签空的行、技能里的空串都清掉', () => {
        const character = base();
        const next = applyPet(character, 0, {
            ...pet(),
            attrs: [
                { label: '气血', value: '3906' },
                { label: ' ', value: '1773' },
            ],
            skills: ['高级必杀', '', '  '],
            innerPills: ['', '狂怒'],
        });
        expect(next.pets[0].attrs).toEqual([{ label: '气血', value: '3906' }]);
        expect(next.pets[0].skills).toEqual(['高级必杀']);
        expect(next.pets[0].innerPills).toEqual(['狂怒']);
    });
});

it('快捷编辑后的装备与召唤兽经过序列化和读取，形状与内容不再变化', () => {
    const character = base();
    const geared = applyGear(character, '头', {
        caption: '  测试头盔  ',
        detail: {
            name: '',
            kind: '',
            stats: [
                { label: ' 防御 ', value: ' 80 ' },
                { label: ' ', value: '1' },
            ],
            cond: [],
        },
    });
    const saved = applyPet(geared, 0, {
        ...character.pets[0],
        name: ' 天狗 ',
        attrs: [{ label: ' 气血 ', value: ' 3906 ' }],
        skills: [' 高级必杀 ', ' '],
    });
    const reloaded = normalizeCharacter(JSON.parse(JSON.stringify(saved)));
    expect(JSON.parse(JSON.stringify(reloaded.gear))).toEqual(
        JSON.parse(JSON.stringify(saved.gear)),
    );
    expect(JSON.parse(JSON.stringify(reloaded.pets))).toEqual(
        JSON.parse(JSON.stringify(saved.pets)),
    );
});
