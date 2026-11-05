import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../characters/character';
import {
    applyMetric,
    autoTitle,
    daysLeft,
    deadlineText,
    goalSummary,
    goalTitle,
    metricKeys,
    metricValue,
    orderGoals,
    parseGoal,
    parseGoals,
    scopeText,
    signedText,
    type Goal,
} from './goals';

/**
 * 目标页的纯函数。
 *
 * 断的是**新版自己的期望**（`ARCHITECTURE.md` §5：旧仓是参考读物，不做差分比对）。
 * 日期一律注入，不读真实时钟——否则跨午夜跑会随机红一条。
 */

const TODAY = '2026-11-05';

/** 只造这一批用例真正读到的字段。整份 `CharacterData` 有十几个分区，
 * 造全了反而看不出哪几个字段在起作用。 */
function character(id: string, name: string, patch: Partial<CharacterData> = {}): CharacterData {
    return {
        id,
        name,
        level: 0,
        school: '大唐官府',
        server: '',
        guild: '',
        attrGroups: [],
        experience: { value: '', need: '' },
        skills: [],
        assists: [],
        trainings: [],
        gear: [],
        gearMeta: { special: '', suit: '' },
        pets: [],
        ...patch,
    } as CharacterData;
}

function goal(patch: Partial<Goal> = {}): Goal {
    return {
        id: 'g1',
        kind: 'money',
        title: '攒钱',
        members: [{ id: 'c1', name: '归ω岚' }],
        target: 100,
        unit: '万',
        tracking: null,
        deadline: '',
        note: '',
        logs: [],
        createdAt: 1,
        ...patch,
    };
}

function log(delta: number, date = TODAY, id = `l${Math.abs(delta)}-${date}`) {
    return { id, date, delta, note: '', createdAt: 1 };
}

describe('目标：指标取值', () => {
    const withData = character('c1', '甲', {
        skills: [
            { name: '周易学', level: 120, cap: 180 },
            { name: '乾坤袖', level: 0, off: true },
        ],
        assists: [{ name: '强身术', level: 100, kind: 'life' }],
        trainings: [
            {
                title: '任务修炼',
                rows: [{ name: '攻击修炼', level: 21, cap: 25 }],
            },
        ],
        attrGroups: [
            {
                title: '战斗',
                rows: [
                    { label: '命中', value: '3,906' },
                    { label: '伤害', value: '' },
                ],
            },
        ],
    });

    it('门派技能读等级，未学算 0 级而不是「没填」', () => {
        expect(metricValue(withData, { category: 'skill', key: '周易学' })).toBe(120);
        expect(metricValue(withData, { category: 'skill', key: '乾坤袖' })).toBe(0);
        expect(metricValue(withData, { category: 'skill', key: '没有这项' })).toBeNull();
    });

    it('辅助技能与修炼按名字找', () => {
        expect(metricValue(withData, { category: 'assist', key: '强身术' })).toBe(100);
        expect(metricValue(withData, { category: 'training', key: '攻击修炼' })).toBe(21);
        expect(metricValue(withData, { category: 'training', key: '防御修炼' })).toBeNull();
    });

    it('属性值带千分位也要认得出，空的返回 null', () => {
        expect(metricValue(withData, { category: 'attr', key: '命中' })).toBe(3906);
        expect(metricValue(withData, { category: 'attr', key: '伤害' })).toBeNull();
    });

    it('固定清单来自角色契约，技能取成员并集', () => {
        expect(metricKeys('training', []).length).toBe(10);
        expect(metricKeys('attr', [])).toContain('命中');
        const other = character('c2', '乙', { skills: [{ name: '潇湘仙雨', level: 1 }] });
        expect(metricKeys('skill', [withData, other])).toEqual(['周易学', '乾坤袖', '潇湘仙雨']);
    });

    it('写回只改那一项，不动别处', () => {
        const next = applyMetric(withData, { category: 'skill', key: '周易学' }, 150);
        expect(metricValue(next, { category: 'skill', key: '周易学' })).toBe(150);
        expect(metricValue(next, { category: 'skill', key: '乾坤袖' })).toBe(0);
        expect(withData.skills[0].level).toBe(120);

        const training = applyMetric(withData, { category: 'training', key: '攻击修炼' }, 25);
        expect(metricValue(training, { category: 'training', key: '攻击修炼' })).toBe(25);
    });
});

describe('目标：手动累计', () => {
    it('进度是流水之和，最低到 0', () => {
        const one = goal({ target: 100, logs: [log(30), log(-50)] });
        expect(goalSummary(one, []).current).toBe(0);
        expect(goalSummary(one, []).pct).toBe(0);
    });

    it('攒够就是达成，记下第一次到线的那天', () => {
        const one = goal({
            target: 100,
            logs: [log(40, '2026-11-01'), log(70, '2026-11-03'), log(10, '2026-11-04')],
        });
        const summary = goalSummary(one, []);
        expect(summary.current).toBe(120);
        expect(summary.done).toBe(true);
        expect(summary.pct).toBe(100);
        expect(summary.doneDate).toBe('2026-11-03');
    });

    it('没攒够最多 99%，条形与数字说同一句话', () => {
        const summary = goalSummary(goal({ target: 100, logs: [log(99)] }), []);
        expect(summary.done).toBe(false);
        expect(summary.pct).toBe(99);
    });
});

describe('目标：养成（跟随档案）', () => {
    const tracking = { category: 'training' as const, key: '攻击修炼' };
    const roster = [
        character('c1', '甲', {
            trainings: [{ title: '任务修炼', rows: [{ name: '攻击修炼', level: 25, cap: 25 }] }],
        }),
        character('c2', '乙', {
            trainings: [{ title: '任务修炼', rows: [{ name: '攻击修炼', level: 10, cap: 25 }] }],
        }),
        character('c3', '丙', { trainings: [] }),
    ];
    const one = goal({
        kind: 'growth',
        tracking,
        target: 25,
        unit: '级',
        members: [
            { id: 'c1', name: '甲' },
            { id: 'c2', name: '乙' },
            { id: 'c3', name: '丙' },
        ],
    });

    it('全员达标才算达成，未记录的计分母也计「待补录」', () => {
        const summary = goalSummary(one, roster);
        expect(summary.totalMembers).toBe(3);
        expect(summary.achieved).toBe(1);
        expect(summary.unknown).toBe(1);
        expect(summary.done).toBe(false);
        expect(summary.current).toBe(35);
        expect(summary.total).toBe(75);
    });

    it('超额封顶：一个号练到 40 不能替另一个号的 10 抵账', () => {
        const boosted = [
            character('c1', '甲', {
                trainings: [
                    { title: '任务修炼', rows: [{ name: '攻击修炼', level: 40, cap: 40 }] },
                ],
            }),
            roster[1],
        ];
        const two = goal({ ...one, members: one.members.slice(0, 2) });
        const summary = goalSummary(two, boosted);
        expect(summary.current).toBe(25 + 10);
    });

    it('未达成最多 99%：99.95% 也只能是 99', () => {
        const big = goal({ ...one, target: 1000, members: one.members.slice(0, 2) });
        const near = [
            character('c1', '甲', {
                trainings: [
                    { title: '任务修炼', rows: [{ name: '攻击修炼', level: 1000, cap: 1000 }] },
                ],
            }),
            character('c2', '乙', {
                trainings: [
                    { title: '任务修炼', rows: [{ name: '攻击修炼', level: 999, cap: 1000 }] },
                ],
            }),
        ];
        const summary = goalSummary(big, near);
        expect(summary.pct).toBe(99);
        expect(summary.done).toBe(false);
    });

    it('角色删掉之后行还在，但不计入分母', () => {
        const summary = goalSummary(one, [roster[0], roster[1]]);
        expect(summary.totalMembers).toBe(2);
        expect(summary.rows.length).toBe(3);
        expect(summary.rows.find((row) => row.id === 'c3')?.exists).toBe(false);
        expect(summary.done).toBe(false);
    });

    it('达成给出 100 与达成人数', () => {
        const full = goalSummary(one, [
            roster[0],
            character('c2', '乙', {
                trainings: [
                    { title: '任务修炼', rows: [{ name: '攻击修炼', level: 25, cap: 25 }] },
                ],
            }),
            character('c3', '丙', {
                trainings: [
                    { title: '任务修炼', rows: [{ name: '攻击修炼', level: 25, cap: 25 }] },
                ],
            }),
        ]);
        expect(full.done).toBe(true);
        expect(full.achieved).toBe(3);
        expect(full.pct).toBe(100);
    });
});

describe('目标：展示与排序', () => {
    it('范围按快照人数说，不说「全部角色」', () => {
        expect(scopeText(goal())).toBe('归ω岚');
        expect(
            scopeText(
                goal({
                    members: [
                        { id: 'a', name: '甲' },
                        { id: 'b', name: '乙' },
                    ],
                }),
            ),
        ).toBe('2 个角色');
    });

    it('自动标题：谁 + 什么 + 到多少', () => {
        expect(
            autoTitle({
                id: 'g',
                kind: 'growth',
                members: [{ id: 'c1', name: '甲' }],
                target: 25,
                unit: '级',
                tracking: { category: 'training', key: '攻击修炼' },
                deadline: '',
                note: '',
                logs: [],
                createdAt: 1,
            }),
        ).toBe('甲 · 攻击修炼 到 25级');
        expect(
            goalTitle({ ...goal({ kind: 'gear', target: 3, unit: '件' }), title: '  ' }),
        ).toContain('买满 3 件');
    });

    it('期限：还剩几天 / 今天到期 / 逾期', () => {
        expect(daysLeft('2026-11-08', TODAY)).toBe(3);
        expect(daysLeft('', TODAY)).toBeNull();
        expect(deadlineText('2026-11-08', TODAY, false)).toBe('剩 3 天');
        expect(deadlineText(TODAY, TODAY, false)).toBe('今天到期');
        expect(deadlineText('2026-11-02', TODAY, false)).toBe('已逾期 3 天');
        expect(deadlineText('2026-11-02', TODAY, true)).toBe('');
    });

    it('排序：进行中在前，同组按期限由近及远，都没期限按建的先后', () => {
        const entries = [
            { goal: goal({ id: 'done', deadline: '' }), summary: { done: true } as never },
            {
                goal: goal({ id: 'far', deadline: '2026-12-31' }),
                summary: { done: false } as never,
            },
            {
                goal: goal({ id: 'soon', deadline: '2026-11-07' }),
                summary: { done: false } as never,
            },
            {
                goal: goal({ id: 'none', deadline: '', createdAt: 2 }),
                summary: { done: false } as never,
            },
        ];
        expect(orderGoals(entries).map((entry) => entry.goal.id)).toEqual([
            'soon',
            'far',
            'none',
            'done',
        ]);
    });

    it('增量带符号', () => {
        expect(signedText(30, '万')).toBe('+30 万');
        expect(signedText(-2, '')).toBe('−2');
    });
});

describe('目标：归一', () => {
    it('一条读不懂的目标整条丢掉', () => {
        expect(parseGoal(null)).toBeNull();
        expect(parseGoal({ id: 'x', kind: 'nope', target: 1, members: [{ id: 'c1' }] })).toBeNull();
        expect(
            parseGoal({ id: 'x', kind: 'money', target: 0, members: [{ id: 'c1' }] }),
        ).toBeNull();
        expect(parseGoal({ id: 'x', kind: 'money', target: 10, members: [] })).toBeNull();
        /* 养成目标没有追踪项就无从算起。 */
        expect(
            parseGoal({ id: 'x', kind: 'growth', target: 10, members: [{ id: 'c1' }] }),
        ).toBeNull();
    });

    it('好数据留下，坏流水丢弃，标题补成自动标题', () => {
        const parsed = parseGoals([
            {
                id: 'g1',
                kind: 'gear',
                target: 3,
                members: [{ id: 'c1', name: '甲' }],
                logs: [
                    { id: 'l1', date: '2026-11-04', delta: 1, createdAt: 1 },
                    { id: 'l2', date: '不是日期', delta: 1, createdAt: 1 },
                    { id: 'l3', date: '2026-11-04', delta: 0, createdAt: 1 },
                ],
            },
        ]);
        expect(parsed.length).toBe(1);
        expect(parsed[0].logs.length).toBe(1);
        expect(parsed[0].unit).toBe('件');
        expect(parsed[0].title).toContain('买满 3 件');
    });
});
