import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../services/game-data.fixture';
import { schoolNames, schoolSkillCap } from '../../services/game-data';
import { GEAR_SLOTS } from './character';
import { CHARACTERS } from './mock';
import { expPercent, isMaxed } from './character';
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

    it('修炼按固定清单重建：组名归位、清单外的项丢掉、等级与上限按项名对回去', () => {
        /* 上一版的编辑器能改组名、能加行（2026-11-03 用户要求「不可编辑」）。
         * 现在**结构**由 `TRAINING_GROUPS` 定——老存档里改过的组名、加过的项要归位，
         * 但**已练的等级不能跟着组名一起被抹掉**，所以按项名对回去。
         *
         * 上限反过来是**每行自己的数**（2026-11-04 用户：「修炼上限 也可以修改」）：
         * 帮派与「修炼上限提升」会把它推高，两个号的同一项可以一个 20、一个 25。
         * 存档里有正数就留着，没存过 / 存成 0 才落回清单默认——上限若被落成 0 后果比
         * 技能更重：卡上是 `row.level >= row.cap` 判「练满」，进度条还算 `level / cap`，
         * 十项会全部标成已完成，宽度是 NaN%。 */
        const [own, beast] = normalizeCharacter({
            trainings: [
                { title: '角色自身修炼', rows: [{ name: '攻击修炼', level: 11, cap: 25 }] },
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
        // 等级按名字对回去；上限存过的留 25，没存过的落清单默认（20 / 育兽术 35）。
        expect(own.rows.find((row) => row.name === '攻击修炼')).toMatchObject({
            level: 11,
            cap: 25,
        });
        expect(own.rows.find((row) => row.name === '防御修炼')?.cap).toBe(20);
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

/**
 * 读档失败时**一个字都不许写回**。
 *
 * 这一层测的不是「解析对不对」（上面 27 条已经包了），而是**解析之上那一层怎么处置
 * 失败**：`charactersLoad()` 的契约是「`null` = 没有宿主或调用失败」，早先它和
 * 「库里本来就是空的」共用一个分支，于是任何一次读失败（一行坏 JSON 就够）都会
 * 走到 `seed()` 并立刻 `charactersSave()`——用户攒的名册被两个演示角色顶掉，
 * 且已写进库，不可恢复。
 *
 * 为什么必须用 mock 而不能只读代码：这条修复的全部内容就是「某个分支里不调用某个函数」，
 * 唯一的证据是「那个函数没被调用」。断言顺序也重要——先证明读档时没写，
 * 再证明**之后任何一次增删改**也不会写（`persist()` 另外还有一道闸）。
 *
 * `vi.doMock` + `vi.resetModules()` 而不是顶层 `vi.mock`：这个文件另外 27 条用例
 * 与 `desktop` 无关，不该被牵连；动态 import 还顺带保证每次拿到的是**全新**的
 * 模块单例（`roster` / `loadError` 都是模块级的），用例之间不会互相污染。
 */
describe('读档失败：拒绝写入', () => {
    /** 装配一份「桌面版、库读不出来」的宿主。`legacyImported` 给 true 跳过搬运分支。 */
    async function loadFailingRoster() {
        vi.resetModules();
        const desktop = {
            hasDesktop: () => true,
            charactersLoad: vi.fn(async () => null),
            charactersSave: vi.fn(async () => true),
            charactersLegacyImported: vi.fn(async () => true),
            charactersMarkLegacyImported: vi.fn(async () => undefined),
        };
        vi.doMock('../../services/desktop', () => desktop);
        // `resetModules` 会连 `game-data` 一起重置，重新 import 一次把门派表填回去，
        // 否则 `emptyCharacter()` 拿不到默认门派（不影响本用例，但会让断言看着可疑）。
        await import('../../services/game-data.fixture');
        const store = await import('./roster');
        await store.loadRoster();
        return { desktop, store };
    }

    it('charactersLoad 返回 null：不塞种子、不写库、错误位立起来', async () => {
        const { desktop, store } = await loadFailingRoster();
        const { roster, loadError } = store.useRoster();

        /* 这三条是同一条链上的三个观测点。若修复退回去，`roster` 会变成
         * `mock.ts` 那两个演示角色——`length === 0` 就是最直接的判别器。 */
        expect(roster.value).toEqual([]);
        expect(loadError.value).not.toBe('');
        expect(desktop.charactersSave).not.toHaveBeenCalled();
    });

    it('读失败之后，新增角色也不会落库（persist 的闸真的生效）', async () => {
        const { desktop, store } = await loadFailingRoster();
        const { loadError, add } = store.useRoster();

        const id = add(store.emptyCharacter());
        expect(id).toBeTruthy();
        /* 内存里加进去了（界面要能响应），但一个字节都没往库里写。
         * `persist()` 是同步函数、`charactersSave` 是异步写，所以这里同步断言即可。 */
        expect(desktop.charactersSave).not.toHaveBeenCalled();
        expect(loadError.value).not.toBe('');
    });

    it('读成功（空库 + 首次启动）仍然给种子并写库——闸不能把正常路径也关掉', async () => {
        vi.resetModules();
        const desktop = {
            hasDesktop: () => true,
            charactersLoad: vi.fn(async () => []),
            charactersSave: vi.fn(async () => true),
            charactersLegacyImported: vi.fn(async () => false),
            charactersMarkLegacyImported: vi.fn(async () => undefined),
        };
        vi.doMock('../../services/desktop', () => desktop);
        await import('../../services/game-data.fixture');
        const store = await import('./roster');

        await store.loadRoster();
        const { roster, loadError } = store.useRoster();
        expect(loadError.value).toBe('');
        expect(roster.value.length).toBeGreaterThan(0);
        expect(desktop.charactersSave).toHaveBeenCalledTimes(1);
    });
});

/**
 * `charactersLegacyImported()` 返回 `null`：**问不出来，不等于没搬过**。
 *
 * 名册这边比物价多一层后果：`firstRun` 除了决定「搬不搬」，还决定「库里空的时候要不要
 * 塞种子」。把 `null` 读成 `firstRun = true`，一次调用失败就能让两个演示角色顶掉用户
 * 攒了一年的名册，而且立刻写回库。所以两条都要盯：不搬、不 seed。
 *
 * 为了不让测试空转，这里在 node 里装一个最小的 `localStorage` 并塞一份旧名册——
 * 只要迁移分支被走进去，`charactersSave` 就一定会被调到。
 */
describe('迁移标记问不出来（null）：不搬、不 seed', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /* `STORAGE_KEY` 在 `roster.ts` 里是模块内的 `const`（未导出），这里按字面量写。
     * 写错了会静默失效（桩里的旧名册读不到，迁移分支即便走进去也搬不出东西），
     * 所以下面留了一条「标记为 false 时确实会搬」的反面对照用例来验证这个字面量。 */
    const KEY = 'mh-roster';
    const LEGACY = JSON.stringify([{ id: 'legacy-1', name: '老存档里的角色' }]);

    /** 装一个够用的 localStorage，并塞进旧名册。返回底层 Map，供断言「没被改名 / 删掉」。 */
    function stubLegacyStorage() {
        const store = new Map<string, string>([[KEY, LEGACY]]);
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            removeItem: (key: string) => void store.delete(key),
        });
        return store;
    }

    /**
     * 另起一个装配函数而不是复用上面那个：那里的 `charactersLegacyImported` 固定返回布尔，
     * 而这里要的正是三态里的第三种。`resetModules` 之后必须重新 import 一次
     * `game-data.fixture`，否则 `normalizeCharacter` 拿不到门派表。
     */
    async function loadWithMarker(marker: boolean | null, load: () => Promise<unknown[] | null>) {
        vi.resetModules();
        const desktop = {
            hasDesktop: () => true,
            charactersLoad: vi.fn(load),
            charactersSave: vi.fn(async (_list: unknown[]) => true),
            charactersLegacyImported: vi.fn(async () => marker),
            charactersMarkLegacyImported: vi.fn(async (): Promise<void> => undefined),
        };
        vi.doMock('../../services/desktop', () => desktop);
        await import('../../services/game-data.fixture');
        const store = await import('./roster');
        await store.loadRoster();
        return { desktop, store };
    }

    it('不搬旧名册、不打迁移标记，照常读库并按库里内容填 roster', async () => {
        const local = stubLegacyStorage();
        const { desktop, store } = await loadWithMarker(null, async () => [
            { id: 'db-1', name: '库里的角色' },
        ]);

        /* 若实现退回 `!(await …)`，`null` 会被当成「没搬过」：这里会看到一次
         * `charactersSave`，写进去的是 `老存档里的角色`。 */
        expect(desktop.charactersLoad).toHaveBeenCalledTimes(1);
        expect(desktop.charactersSave).not.toHaveBeenCalled();
        expect(desktop.charactersMarkLegacyImported).not.toHaveBeenCalled();
        expect(store.useRoster().roster.value.map((one) => one.name)).toEqual(['库里的角色']);
        // 没搬就不该有搬家的痕迹：源数据还在，也没留下 `.migrated` 副本。
        expect(local.has(KEY)).toBe(true);
        expect(local.has(`${KEY}.migrated`)).toBe(false);
    });

    it('库也读不出来时不塞种子——`firstRun` 必须是 false', async () => {
        stubLegacyStorage();
        const { desktop, store } = await loadWithMarker(null, async () => null);
        const { roster, loadError } = store.useRoster();

        /* `roster` 为空而不是 `mock.ts` 那两个演示角色，是这条断言真正的意义：
         * 空名册至少还能在修好之后重新读到，塞进去的种子会先一步写进库。 */
        expect(roster.value).toEqual([]);
        expect(loadError.value).not.toBe('');
        expect(desktop.charactersLoad).toHaveBeenCalledTimes(1);
        expect(desktop.charactersSave).not.toHaveBeenCalled();
        expect(desktop.charactersMarkLegacyImported).not.toHaveBeenCalled();
    });

    it('反面对照：标记明确说「没搬过」（false）时确实会搬——桩没有让它空转', async () => {
        /* 这条不是为了测迁移（那是 `false` 那条老路），而是为了证明上面那个
         * `KEY` 字面量是对的：桩里的旧名册真的喂到了迁移分支。
         * 少了它，`KEY` 写成 `mh-characters` 之类也会让前两条全绿。 */
        const local = stubLegacyStorage();
        const { desktop } = await loadWithMarker(false, async () => [
            { id: 'db-1', name: '库里的角色' },
        ]);

        expect(desktop.charactersSave).toHaveBeenCalledTimes(1);
        const saved = desktop.charactersSave.mock.calls[0][0] as { name: string }[];
        expect(saved.map((one) => one.name)).toEqual(['老存档里的角色']);
        expect(desktop.charactersMarkLegacyImported).toHaveBeenCalledTimes(1);
        // 搬家成功后源数据改名留底（`removeItem` 原来的键、写入 `.migrated`）。
        expect(local.has(KEY)).toBe(false);
        expect(local.has(`${KEY}.migrated`)).toBe(true);
    });
});
