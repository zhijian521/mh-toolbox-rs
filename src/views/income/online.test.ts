import { describe, expect, it } from 'vitest';
import { dateText } from '../../services/format';
import {
    DEFAULT_CARD_PRICE,
    POINTS_PER_HOUR,
    cardCostOf,
    clockText,
    factsOfSession,
    minutesByDay,
    minutesText,
    normalizeSession,
    normalizeSettings,
    onlineTotalsOf,
    ownersOf,
    parseSessions,
    sessionCost,
    sessionMinutes,
    sessionSlices,
    shareOfSlice,
    sliceCost,
    type OnlineSession,
} from './online';

/**
 * 上线计时与点卡口径。只测纯函数——store 那一层要 `localStorage` / `invoke`，
 * 留给真机点测（与 `income.test.ts` 同一条分工）。
 *
 * 共同点与收益那组一样：**盯的都是「数悄悄错掉」**。点卡是乘法与分摊，
 * 差一分的表现不是报错，而是「卡片上扣了 3 万、账号里只有 2.9999 万」。
 */

/** 本机时区的某一天某一刻，测试里一律这样造时间，避免写死时间戳。 */
function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
    return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function session(patch: Partial<OnlineSession> = {}): OnlineSession {
    return {
        id: 'onl-1',
        date: '2026-11-11',
        startAt: at(2026, 11, 11, 20, 0),
        endAt: at(2026, 11, 11, 22, 0),
        characterId: 'c1',
        roster: [],
        cardPrice: DEFAULT_CARD_PRICE,
        note: '',
        createdAt: 1,
        ...patch,
    };
}

describe('上线：谁在线', () => {
    it('单开时名单为空，回落到主体角色', () => {
        expect(ownersOf(session())).toEqual(['c1']);
    });

    it('多开时用名单，且去空去重', () => {
        expect(ownersOf(session({ roster: ['c1', 'c2', ''] }))).toEqual(['c1', 'c2']);
        // 面板不该给出重复项，但账本不能因为面板的 bug 多扣一份点卡
        expect(ownersOf(session({ roster: ['c1', 'c1', 'c2'] }))).toEqual(['c1', 'c2']);
    });

    it('既没名单也没主体角色：算 0 个人，成本为 0 而不是 Infinity', () => {
        const empty = session({ characterId: '', roster: [] });
        expect(ownersOf(empty)).toEqual([]);
        expect(sessionCost(empty)).toBe(0);
    });
});

describe('上线：按天切开', () => {
    it('不跨天：一片，日期是开始那天', () => {
        const slices = sessionSlices(session());
        expect(slices).toHaveLength(1);
        expect(slices[0].date).toBe('2026-11-11');
        expect(slices[0].minutes).toBe(120);
    });

    it('跨零点：切成两片，前一天 90 分钟、后一天 30 分钟', () => {
        /* 这一段就是「按 24 小时硬切」会算错的那种：22:30 到 00:30，
         * 实际跨越两天，而用户看到的日期只有两个。 */
        const slices = sessionSlices(
            session({ startAt: at(2026, 11, 11, 22, 30), endAt: at(2026, 11, 12, 0, 30) }),
        );
        expect(slices.map((one) => one.date)).toEqual(['2026-11-11', '2026-11-12']);
        expect(slices.map((one) => one.minutes)).toEqual([90, 30]);
    });

    it('跨两天多：三片', () => {
        const slices = sessionSlices(
            session({ startAt: at(2026, 11, 11, 23, 0), endAt: at(2026, 11, 13, 1, 0) }),
        );
        expect(slices.map((one) => one.date)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
        expect(slices.reduce((sum, one) => sum + one.minutes, 0)).toBe(26 * 60);
    });

    it('还在计时：用 now 当终点', () => {
        const live = session({ endAt: null, startAt: at(2026, 11, 11, 20, 0) });
        expect(sessionMinutes(live, at(2026, 11, 11, 21, 0))).toBe(60);
        expect(sessionSlices(live, at(2026, 11, 11, 21, 0))).toHaveLength(1);
    });

    it('终点早于起点：一片都不给（不是负时长）', () => {
        expect(sessionSlices(session({ endAt: at(2026, 11, 11, 19, 0) }))).toEqual([]);
    });
});

describe('上线：点卡成本', () => {
    it('一小时单开 = 6 点 × 单价', () => {
        expect(POINTS_PER_HOUR).toBe(6);
        expect(sliceCost(60, 1, 15000)).toBe(90000);
    });

    it('多开按号数翻倍', () => {
        expect(sliceCost(60, 3, 15000)).toBe(270000);
    });

    it('单价非正时回落到默认，不是免费', () => {
        expect(sliceCost(60, 1, 0)).toBe(90000);
        expect(sliceCost(60, 1, Number.NaN)).toBe(90000);
    });

    it('两小时双开：4 万/点也要算对', () => {
        const two = session({
            startAt: at(2026, 11, 11, 20, 0),
            endAt: at(2026, 11, 11, 22, 0),
            roster: ['c1', 'c2'],
            cardPrice: 40000,
        });
        expect(sessionCost(two)).toBe(2 * 6 * 2 * 40000);
    });

    it('跨天那两片各自按自己的分钟数算，加起来等于整段', () => {
        const across = session({
            startAt: at(2026, 11, 11, 22, 30),
            endAt: at(2026, 11, 12, 0, 30),
        });
        const whole = Math.round((120 / 60) * POINTS_PER_HOUR * 15000);
        expect(sessionCost(across)).toBe(whole);
    });
});

describe('上线：分摊一分不差', () => {
    it('除不尽时余数补给前面的人，总和严格相等', () => {
        const parts = shareOfSlice(100, 3);
        expect(parts).toEqual([34, 33, 33]);
        expect(parts.reduce((sum, one) => sum + one, 0)).toBe(100);
    });

    it('一个人时原样一条', () => {
        expect(shareOfSlice(7, 1)).toEqual([7]);
        expect(shareOfSlice(7, 0)).toEqual([7]);
    });

    it('按角色取成本与总成本对得上', () => {
        /* 这条盯的是「统计扣 1 万、流水只有 9999」那个老毛病：
         * 按角色取那条路径必须与 `sessionCost` 是同一个分摊函数。 */
        const three = session({ roster: ['c1', 'c2', 'c3'] });
        const total = sessionCost(three);
        const parts = ['c1', 'c2', 'c3'].map((id) =>
            cardCostOf([three], '2026-11-11', '2026-11-11', id),
        );
        expect(parts.reduce((sum, one) => sum + one, 0)).toBe(total);
    });

    it('不指定角色时给整段总成本', () => {
        const three = session({ roster: ['c1', 'c2', 'c3'] });
        expect(cardCostOf([three], '2026-11-11', '2026-11-11')).toBe(sessionCost(three));
    });

    it('这个号不在这段里：0', () => {
        expect(cardCostOf([session()], '2026-11-11', '2026-11-11', 'c9')).toBe(0);
    });

    it('区间之外：0', () => {
        expect(cardCostOf([session()], '2026-11-12', '2026-11-12')).toBe(0);
    });
});

describe('上线：按天按号摊时长', () => {
    it('一人一条：各自得整段', () => {
        const one = session({ id: 'a', characterId: 'c1', roster: [] });
        const two = session({ id: 'b', characterId: 'c2', roster: [] });
        const map = minutesByDay([one, two]);
        expect(map.get('2026-11-11|c1')).toBe(120);
        expect(map.get('2026-11-11|c2')).toBe(120);
    });

    it('老数据里一组人共用一段：每人各得全额，不摊', () => {
        /* 时长与成本的口径不同：三个人真的都在线，各自都挂了 2 小时；
         * 只有**点卡**是「一个号一份」要分摊。图上看的是「这个号挂机多久」，
         * 所以这里必须全额，摊了会让每根线都短成三分之一。 */
        const three = session({ roster: ['c1', 'c2', 'c3'] });
        const map = minutesByDay([three]);
        expect(map.get('2026-11-11|c1')).toBe(120);
        expect(map.get('2026-11-11|c3')).toBe(120);
    });

    it('跨零点的那段两天各记自己那半', () => {
        const night = session({
            characterId: 'c1',
            roster: [],
            startAt: at(2026, 11, 11, 23, 0),
            endAt: at(2026, 11, 12, 1, 0),
        });
        const map = minutesByDay([night]);
        expect(map.get('2026-11-11|c1')).toBe(60);
        expect(map.get('2026-11-12|c1')).toBe(60);
    });

    it('还在计时：算到 now，不是算到 0', () => {
        const live = session({
            characterId: 'c1',
            roster: [],
            startAt: at(2026, 11, 11, 20, 0),
            endAt: null,
        });
        const map = minutesByDay([live], at(2026, 11, 11, 21, 30));
        expect(map.get('2026-11-11|c1')).toBe(90);
    });
});

describe('上线：区间统计', () => {
    it('时长、成本、段数', () => {
        const two = [
            session(),
            session({
                id: 'onl-2',
                startAt: at(2026, 11, 11, 8, 0),
                endAt: at(2026, 11, 11, 9, 30),
            }),
        ];
        const totals = onlineTotalsOf(two, '2026-11-11', '2026-11-11');
        expect(totals.minutes).toBe(210);
        expect(totals.count).toBe(2);
        expect(totals.running).toBe(0);
        expect(totals.cost).toBe(Math.round((210 / 60) * 6 * 15000));
    });

    it('进行中的那一段单独计数', () => {
        const live = session({ endAt: null, startAt: at(2026, 11, 11, 20, 0) });
        const totals = onlineTotalsOf([live], '2026-11-11', '2026-11-11', at(2026, 11, 11, 21, 0));
        expect(totals.running).toBe(1);
        expect(totals.count).toBe(0);
        expect(totals.minutes).toBe(60);
    });

    it('区间外的段不进统计，也不计数', () => {
        const totals = onlineTotalsOf([session()], '2026-11-12', '2026-11-12');
        expect(totals).toEqual({ minutes: 0, cost: 0, count: 0, running: 0 });
    });
});

describe('上线：读数写法', () => {
    it('时长', () => {
        expect(minutesText(200)).toBe('3 小时 20 分');
        expect(minutesText(120)).toBe('2 小时');
        expect(minutesText(48)).toBe('48 分');
        expect(minutesText(0)).toBe('—');
    });

    it('记录列表里的短写法', () => {
        expect(clockText(200)).toBe('03:20');
        expect(clockText(5)).toBe('00:05');
    });

    it('一行摘要', () => {
        const facts = factsOfSession(session({ roster: ['c1', 'c2'] }));
        expect(facts).toEqual({ minutes: 120, cost: 2 * 6 * 2 * 15000, owners: 2, running: false });
    });
});

describe('上线：归一', () => {
    it('认得出完整的一条', () => {
        const one = normalizeSession({
            id: 'o1',
            date: '2026-11-11',
            startAt: 1000,
            endAt: 2000,
            characterId: 'c1',
            roster: ['c1', 'c2'],
            cardPrice: 16500,
            note: '双开',
            createdAt: 3,
        });
        expect(one).toMatchObject({
            id: 'o1',
            date: dateText(1000),
            roster: ['c1', 'c2'],
            cardCost: true,
        });
    });

    it('没有 startAt 就丢掉（不知道从几点开始，算不出任何东西）', () => {
        expect(normalizeSession({ id: 'o1', date: '2026-11-11' })).toBeNull();
        expect(normalizeSession({ startAt: -1 })).toBeNull();
    });

    it('终点早于起点就丢掉，不显示成「在线 −2 小时」', () => {
        expect(normalizeSession({ startAt: 2000, endAt: 1000 })).toBeNull();
        expect(normalizeSession({ startAt: 2000, endAt: 2000 })).toBeNull();
    });

    it('还在计时：endAt 缺失 / 非数都是 null', () => {
        expect(normalizeSession({ startAt: 1000 })?.endAt).toBeNull();
        expect(normalizeSession({ startAt: 1000, endAt: 'x' })?.endAt).toBeNull();
    });

    it('日期不合法时回落到开始那天', () => {
        const one = normalizeSession({ startAt: at(2026, 11, 11, 9, 0), date: '11-11' });
        expect(one?.date).toBe('2026-11-11');
    });

    it('单价为 0 时回落到默认：不然那段时长白算，看着像「没扣点卡」', () => {
        expect(normalizeSession({ startAt: 1000, cardPrice: 0 })?.cardPrice).toBe(
            DEFAULT_CARD_PRICE,
        );
    });

    it('名单里的非字符串剔掉', () => {
        expect(normalizeSession({ startAt: 1000, roster: ['c1', 2, '', 'c2'] })?.roster).toEqual([
            'c1',
            'c2',
        ]);
    });

    it('没有 id 时用开始时刻拼一个（不再是空串，重复也看得见）', () => {
        expect(normalizeSession({ startAt: 1000 })?.id).toBe('onl-rs');
    });

    it('解析一串：坏条目单条丢掉，按开始时刻倒排', () => {
        const list = parseSessions([
            { id: 'a', startAt: 1000, endAt: 2000 },
            { id: 'b' },
            { id: 'c', startAt: 5000, endAt: 6000 },
        ]);
        expect(list.map((one) => one.id)).toEqual(['c', 'a']);
    });

    it('不是数组就给空表', () => {
        expect(parseSessions(null)).toEqual([]);
        expect(parseSessions({})).toEqual([]);
    });
});

describe('上线：点卡口径', () => {
    it('缺字段时默认 1.5 万/点、计入成本', () => {
        expect(normalizeSettings(null)).toEqual({
            cardPrice: DEFAULT_CARD_PRICE,
            cardCost: true,
        });
    });

    it('只认 false 是「关」——缺字段、null、"false" 都当开启', () => {
        /* 关掉的代价是账少算一笔，而用户会以为「今天没扣点卡」；
         * 读不懂时偏向「开着」是更安全的错法。 */
        expect(normalizeSettings({ cardCost: false }).cardCost).toBe(false);
        expect(normalizeSettings({ cardCost: null }).cardCost).toBe(true);
        expect(normalizeSettings({ cardCost: 'false' }).cardCost).toBe(true);
        expect(normalizeSettings({}).cardCost).toBe(true);
    });

    it('单价非正时回落到默认', () => {
        expect(normalizeSettings({ cardPrice: 0 }).cardPrice).toBe(DEFAULT_CARD_PRICE);
        expect(normalizeSettings({ cardPrice: 16500 }).cardPrice).toBe(16500);
    });
});

describe('上线：单角色筛选口径', () => {
    it('旧多人段筛选一个号，只计该号分摊的点卡，在线时长不分摊', () => {
        const one = session({ roster: ['c1', 'c2'] });
        const all = onlineTotalsOf([one], '2026-11-11', '2026-11-11');
        const single = onlineTotalsOf([one], '2026-11-11', '2026-11-11', Date.now(), 'c1');
        expect(single.minutes).toBe(120);
        expect(single.cost * 2).toBe(all.cost);
        expect(onlineTotalsOf([one], '2026-11-11', '2026-11-11', Date.now(), 'c9').cost).toBe(0);
    });

    it('归一时修正与开始时间不符的日期，并保留不计入快照', () => {
        const one = normalizeSession(session({ date: '2000-01-01', cardCost: false }));
        expect(one?.date).toBe('2026-11-11');
        expect(one?.cardCost).toBe(false);
    });
});
