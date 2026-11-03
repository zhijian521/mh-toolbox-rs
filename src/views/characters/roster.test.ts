import { describe, expect, it } from 'vitest';
import '../../services/game-data.fixture';
import { schoolNames, schoolSkillCap } from '../../services/game-data';
import { GEAR_SLOTS } from './character';
import { CHARACTERS } from './mock';
import { expPercent, isMaxed, skillTicks, tickLevel } from './character';
import { emptyCharacter, normalizeCharacter, parseRoster, serializeRoster } from './roster';
import { schoolSkillNames } from './schools';

/**
 * 名册的解析与兜底。
 *
 * 这一层的失败方式很特别：它**只在重启后才出错**。写进去的是干净对象，
 * 读回来的是上一版字段、手工改坏的 JSON、或 OCR 导入的半成品——那时页面已经
 * 挂载完了，一行 `undefined is not iterable` 就是整页白屏。
 * 所以断言全在「坏输入进来会怎样」，而不是「好数据能不能过」。
 */
describe('名册解析', () => {
    it('没存过 / 不是 JSON / 不是数组，一律交还 null', () => {
        expect(parseRoster(null)).toBeNull();
        expect(parseRoster('')).toBeNull();
        expect(parseRoster('{ 这不是 JSON')).toBeNull();
        expect(parseRoster('{"id":"a"}')).toBeNull();
        expect(parseRoster('null')).toBeNull();
    });

    it('单条坏掉不牵连整份名册', () => {
        const parsed = parseRoster(
            JSON.stringify([null, '字符串', { id: 'a', name: '甲' }, { name: '乙' }]),
        );
        expect(parsed?.map((item) => item.name)).toEqual(['甲', '乙']);
    });

    it('缺字段的记录补成可渲染的形状，不抛错', () => {
        const character = normalizeCharacter({ name: '只有名字' });
        expect(character.name).toBe('只有名字');
        expect(character.level).toBe(0);
        // 属性与修炼是游戏面板里的固定行，缺了要补回骨架，否则那两个页签是空白。
        // 顺序 = 网格顺序（两行两列，行优先）：上排资源 / 名望，下排战斗 / 加点，
        // 最后是通栏的「潜能」（乾元丹 / 潜能果，2026-11-02 加）。
        expect(character.attrGroups.map((group) => group.title)).toEqual([
            '资源',
            '名望',
            '战斗',
            '加点',
            '潜能',
        ]);
        expect(character.experience).toEqual({ value: '', need: '' });
        /* 通栏标记也要从清单跟着来：卡片与编辑弹窗靠 `wide` 把「潜能」跨两列、
         * 内部切两格。丢了它，两格会退回左半格、右边空半行（读成漏填）。 */
        expect(character.attrGroups.filter((group) => group.wide)).toHaveLength(1);
        expect(character.attrGroups.find((group) => group.wide)?.title).toBe('潜能');
        expect(character.trainings.flatMap((group) => group.rows)).toHaveLength(10);
        expect(character.gear).toHaveLength(GEAR_SLOTS.length);
        expect(character.pets).toEqual([]);
    });

    it('id 丢了要补一个新的——重复 id 会让两张卡的页签互相串', () => {
        const first = normalizeCharacter({ name: '甲' });
        const second = normalizeCharacter({ name: '乙' });
        expect(first.id).toBeTruthy();
        expect(first.id).not.toBe(second.id);
    });
});

describe('装备格对齐', () => {
    it('乱序、缺格都还原成十二格的标准顺序', () => {
        const character = normalizeCharacter({
            gear: [
                { slot: '武器', caption: '飞龙在天' },
                { slot: '头', caption: '黑魔冠' },
                { slot: '不存在的部位', caption: '假的' },
            ],
        });
        expect(character.gear.map((slot) => slot.slot)).toEqual([...GEAR_SLOTS]);
        expect(character.gear[0].caption).toBe('黑魔冠');
        expect(character.gear[2].caption).toBe('飞龙在天');
        // 没填的那十格要占位：空位与「没这一格」是两件事。
        expect(character.gear[1]).toEqual({ slot: '项链', caption: undefined });
    });

    it('名称与类型都空的详情不留空壳', () => {
        const character = normalizeCharacter({
            gear: [
                {
                    slot: '头',
                    caption: '黑魔冠',
                    detail: { stats: [{ label: '防御', value: '+1' }] },
                },
            ],
        });
        // 空壳会让浮片浮出一张空白纸，比什么都不弹更像坏了。
        expect(character.gear[0].detail).toBeUndefined();
        expect(character.gear[0].caption).toBe('黑魔冠');
    });

    it('装备名只填了 detail.name 时，格内短名跟着它走', () => {
        const character = normalizeCharacter({
            gear: [{ slot: '头', detail: { name: '黑魔冠', kind: '帽子' } }],
        });
        expect(character.gear[0].caption).toBe('黑魔冠');
        expect(character.gear[0].detail?.kind).toBe('帽子');
    });
});

describe('技能与修炼', () => {
    it('没有名字的行丢掉，不画空白分隔线', () => {
        const character = normalizeCharacter({
            skills: [{ name: '周易学', level: 120 }, { level: 60 }, null],
        });
        expect(character.skills).toHaveLength(1);
        expect(character.skills[0].name).toBe('周易学');
    });

    it('上限缺席与上限为 0 都读作「不知道」', () => {
        const [absent, zero] = normalizeCharacter({
            skills: [
                { name: '周易学', level: 120 },
                { name: '潇湘仙雨', level: 0, cap: 0 },
            ],
        }).skills;
        /* 上限是正整数，0 只可能是「这一格空着」。留着 0 会让卡上画出 `0/0`
         * 并盖一枚「满」的签——那是把「没填」读成了「练满了」。 */
        expect(absent.cap).toBeUndefined();
        expect(zero.cap).toBeUndefined();
    });

    it('修炼按固定清单重建：组名归位、清单外的项丢掉、等级按项名对回去', () => {
        /* 上一版的编辑器能改组名、能加行、能调上限（2026-11-03 用户要求「不可编辑」）。
         * 现在结构由 `TRAINING_GROUPS` 定，数据只留等级——老存档里那些改动要归位，
         * 但**已练的等级不能跟着组名一起被抹掉**，所以按项名对回去。
         *
         * 上限若被落成 0 后果比技能更重：卡上是 `row.level >= row.cap` 判「练满」，
         * 进度条还算 `level / cap`——十项会全部标成已完成，宽度是 NaN%。 */
        const [own, beast] = normalizeCharacter({
            trainings: [
                { title: '角色自身修炼', rows: [{ name: '攻击修炼', level: 11 }] },
                {
                    title: '召唤兽控制修炼',
                    rows: [
                        { name: '育兽术', level: 7 },
                        { name: '自造的项', level: 3 },
                    ],
                },
            ],
        }).trainings;

        expect(own.title).toBe('任务修炼');
        expect(beast.title).toBe('宠物修炼');
        // 清单十项一项不少，且清单外的「自造的项」不出现。
        expect(own.rows).toHaveLength(5);
        expect(beast.rows.map((row) => row.name)).toEqual([
            '攻击控制力',
            '防御控制力',
            '法术控制力',
            '抗法控制力',
            '育兽术',
        ]);
        // 等级按名字对回去；上限一律照常量（育兽术 35，其余 20）。
        expect(own.rows.find((row) => row.name === '攻击修炼')?.level).toBe(11);
        expect(beast.rows.find((row) => row.name === '育兽术')).toMatchObject({
            level: 7,
            cap: 35,
        });
        expect(beast.rows.every((row) => row.cap === (row.name === '育兽术' ? 35 : 20))).toBe(true);
    });

    it('同类同名的辅助技能只留第一条——卡片的 key 靠「类 + 名字」', () => {
        /* 名字现在从名录里选，重复很容易发生（选了一遍又加一行再选同一个）。
         * 重复的后果不是「多一格」这么轻：卡内 `v-for` 用 `kind + name` 当 key，
         * 重复 key 会让 Vue 复用错元素，改一行另一行跟着变（2026-11-03 实测过）。
         * 不同类的同名要留着——那本来就是两个技能。 */
        const character = normalizeCharacter({
            assists: [
                { name: '强身术', level: 100, kind: 'life' },
                { name: '强身术', level: 33, kind: 'life' },
                { name: '强身术', level: 5, kind: 'story' },
            ],
        });
        expect(character.assists.map((row) => `${row.kind}-${row.name}-${row.level}`)).toEqual([
            'life-强身术-100',
            'story-强身术-5',
        ]);
    });
});

describe('属性五组按固定清单重建', () => {
    /** 按「组名 + 标签」取值——不能按下标，因为下标由清单定，不由数据定。 */
    const valueOf = (
        character: ReturnType<typeof normalizeCharacter>,
        title: string,
        label: string,
    ) =>
        character.attrGroups
            .find((group) => group.title === title)!
            .rows.find((row) => row.label === label)!.value;

    it('顺序乱的四组按清单排回来，值跟着标签走，缺的通栏组补空', () => {
        const character = normalizeCharacter({
            attrGroups: [
                { title: '加点', rows: [{ label: '体质', value: '1' }] },
                { title: '战斗', rows: [{ label: '命中', value: '2' }] },
                { title: '名望', rows: [{ label: '人气', value: '3' }] },
                { title: '资源', rows: [{ label: '气血', value: '4' }] },
            ],
        });
        expect(character.attrGroups.map((group) => group.title)).toEqual([
            '资源',
            '名望',
            '战斗',
            '加点',
            '潜能',
        ]);
        expect(valueOf(character, '资源', '气血')).toBe('4');
        expect(valueOf(character, '战斗', '命中')).toBe('2');
    });

    it('清单外的行丢掉，清单里的行缺了就补空', () => {
        /* 用户 2026-11-02 把属性表定死：资源去掉「愤怒」、加点去掉「潜力」。
         * 老数据里这两行还在，重建时丢掉；清单里有而数据里没有的，补一个空值行。 */
        const character = normalizeCharacter({
            attrGroups: [
                {
                    title: '资源',
                    rows: [
                        { label: '气血', value: '3916' },
                        { label: '愤怒', value: '150' },
                        { label: '魔法', value: '1440' },
                    ],
                },
                { title: '加点', rows: [{ label: '潜力', value: '0' }] },
            ],
        });
        const resource = character.attrGroups.find((group) => group.title === '资源')!;
        expect(resource.rows.map((row) => row.label)).toEqual(['气血', '魔法', '活力', '体力']);
        expect(resource.rows[3].value).toBe('');
        // 「潜力」整行不见，但「加点」这一组还在，只是全空。
        const points = character.attrGroups.find((group) => group.title === '加点')!;
        expect(points.rows.map((row) => row.label)).toEqual([
            '体质',
            '魔力',
            '力量',
            '耐力',
            '敏捷',
        ]);
        expect(points.rows.every((row) => row.value === '')).toBe(true);
    });

    it('上一版的两列结构（[[组,组],[组,组]]）还能读回来', () => {
        /* 用户可能已经在 localStorage 里存过两列结构。展开成一维再按标签取值，
         * 改版式不该让已录的号变成一张空表。 */
        const character = normalizeCharacter({
            attrColumns: [
                [
                    { title: '资源', rows: [{ label: '气血', value: '3916' }] },
                    { title: '加点', rows: [{ label: '体质', value: '229' }] },
                ],
                [
                    { title: '战斗', rows: [{ label: '伤害', value: '1591' }] },
                    { title: '名望', rows: [{ label: '人气', value: '755' }] },
                ],
            ],
        });
        expect(character.attrGroups.map((group) => group.title)).toEqual([
            '资源',
            '名望',
            '战斗',
            '加点',
            '潜能',
        ]);
        // 值跟着标签走：战斗组第一行是「命中」，但「伤害」的 1591 仍在它自己那一行。
        expect(valueOf(character, '资源', '气血')).toBe('3916');
        expect(valueOf(character, '战斗', '伤害')).toBe('1591');
        expect(valueOf(character, '加点', '体质')).toBe('229');
    });
});

describe('经验百分比', () => {
    it('千分位与「万 / 亿」都认', () => {
        expect(expPercent('3,777.2万', '4,200万')).toBeCloseTo(89.93, 1);
        expect(expPercent('1.2亿', '2亿')).toBe(60);
        // 没写单位按「万」算——属性页历来只记「万」。
        expect(expPercent('3777.2', '4200')).toBeCloseTo(89.93, 1);
    });

    it('算不出来就返回 null，而不是 0', () => {
        // 「不知道」与本就是 0% 是两件事：前者该画出空轨道，后者是真的一格都没走。
        expect(expPercent('3,777.2万', '')).toBeNull();
        expect(expPercent('', '4,200万')).toBeNull();
        expect(expPercent('满', '4,200万')).toBeNull();
        expect(expPercent('100', '0')).toBeNull();
    });

    it('超过所需按 100 封顶，不溢出轨道', () => {
        expect(expPercent('5,000万', '4,200万')).toBe(100);
    });
});

describe('门派技能刻度', () => {
    /*
     * 这一页是「数格子」而不是「看长度」：180 分九格、120 就是六格满。
     * 卡与编辑弹窗**共用**这个函数，所以这里错一位，两处会一起错、且看不出来——
     * 就是「存完回卡上短了一截」那类没人查得出的差异。
     */
    it('一格 20 级：180 九格、120 六格', () => {
        expect(skillTicks(180, 180)).toHaveLength(9);
        expect(skillTicks(120, 120)).toHaveLength(6);
        expect(skillTicks(60, 180).every((fill) => fill === 0 || fill === 100)).toBe(true);
    });

    it('满格就是整格，半程的那格按比例填', () => {
        // 120 / 180：前六格满、后三格空。
        expect(skillTicks(120, 180)).toEqual([100, 100, 100, 100, 100, 100, 0, 0, 0]);
        // 90 / 180：四格满 + 第五格一半。
        expect(skillTicks(90, 180)).toEqual([100, 100, 100, 100, 50, 0, 0, 0, 0]);
        // 115：五格满 + 第六格 75%——非整十的等级也读得出「五格多一点」。
        expect(skillTicks(115, 180)[5]).toBe(75);
    });

    it('0 级是九格全空，不是九格全黑', () => {
        expect(skillTicks(0, 180)).toEqual(new Array(9).fill(0));
    });

    it('没有上限就不画刻度', () => {
        // 没有分母的百分比是编出来的：辅助技能的上限可以留空（见 `SkillRow.cap`）。
        expect(skillTicks(60, undefined)).toEqual([]);
        expect(skillTicks(60, 0)).toEqual([]);
    });
});

describe('练满了没有', () => {
    it('要看得到上限才算得出来', () => {
        expect(isMaxed({ level: 180, cap: 180 })).toBe(true);
        expect(isMaxed({ level: 179, cap: 180 })).toBe(false);
        // 写超上限仍算满（手填 200 是「记为满」，不是「没满」）。
        expect(isMaxed({ level: 200, cap: 180 })).toBe(true);
        expect(isMaxed({ level: 200 })).toBe(false);
    });
});

describe('空白角色', () => {
    it('该有的格子都在，该空的都空着', () => {
        const character = emptyCharacter();
        expect(character.name).toBe('');
        expect(character.pets).toEqual([]);
        expect(character.gear).toHaveLength(GEAR_SLOTS.length);
        expect(character.gear.every((slot) => slot.caption === undefined)).toBe(true);
        const trainings = character.trainings.flatMap((group) => group.rows);
        expect(trainings).toHaveLength(10);
        expect(trainings.find((row) => row.name === '育兽术')?.cap).toBe(35);
    });

    it('门派有默认值，七项技能跟着一起带进来', () => {
        /* 下拉里没有「未选」（2026-11-03 用户要求），所以新角色不能是一张空门派的纸：
         * 默认第一家，七项名字直接来自那张表，用户只剩填等级。 */
        const character = emptyCharacter();
        expect(character.school).toBe(schoolNames()[0]);
        expect(character.skills.map((row) => row.name)).toEqual(schoolSkillNames(character.school));
        expect(character.skills.every((row) => row.level === 0)).toBe(true);
        expect(character.skills.every((row) => row.cap === schoolSkillCap())).toBe(true);
    });
});

describe('刻度的档位', () => {
    it('点第 N 格得到的就是前 N 格全满的那个等级', () => {
        // 上限 180 → 九格，每格 20：点第六格是 120。
        expect(tickLevel(5, 180)).toBe(120);
        expect(tickLevel(0, 180)).toBe(20);
        // 最后一格正好是上限，不会因为取整差一级。
        expect(tickLevel(8, 180)).toBe(180);
        // 上限不是整 20 的倍数时按格数反算：90 → 五格，一格 18，点第三格是 54。
        expect(tickLevel(2, 90)).toBe(54);
        // 没有上限就没有档位可点。
        expect(tickLevel(3, undefined)).toBe(0);
    });

    it('点完之后那几格正好是满的（与 skillTicks 同一套算术）', () => {
        for (let index = 0; index < 9; index += 1) {
            const level = tickLevel(index, 180);
            const ticks = skillTicks(level, 180);
            expect(ticks.filter((fill) => fill === 100)).toHaveLength(index + 1);
        }
    });
});

describe('往返', () => {
    it('存下去再读回来，结构与 id 都不变', () => {
        const parsed = parseRoster(serializeRoster(CHARACTERS));
        expect(parsed).toHaveLength(CHARACTERS.length);
        expect(parsed?.map((item) => item.id)).toEqual(CHARACTERS.map((item) => item.id));
        // 演示数据里的装备详情要完整活过一轮序列化。
        expect(parsed?.[0].gear[0].detail?.lines?.[0].value).toBe('起死回生');
        expect(parsed?.[0].pets[0].quality.attack).toBe(CHARACTERS[0].pets[0].quality.attack);
    });
});
