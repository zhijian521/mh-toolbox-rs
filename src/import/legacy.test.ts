import { describe, expect, it } from 'vitest';
import '../services/game-data.fixture';
import { convertLegacyData } from './legacy';
import { sessionCost, sessionMinutes, sessionSlices } from '../views/income/online';

const NOW = new Date('2026-11-14T12:00:00+08:00').getTime();
function fixture() {
    return {
        schemaVersion: 10,
        characters: [
            {
                id: 'c1',
                name: '测试角色',
                level: 109,
                school: '五庄观',
                progress: {
                    schoolSkills: [{ name: '周易学', level: 120 }],
                    auxiliarySkills: [{ name: '强身术', level: 100 }],
                    training: { attack: 12 },
                    petTraining: { magic: 8 },
                    qianyuanPills: 3,
                    potentialFruits: 10,
                },
                equipmentSets: [{ name: '任务', slots: { 头盔: 'e1', 佩饰: 'e2' } }],
                viewedEquipmentSet: 0,
            },
        ],
        equipment: [
            {
                id: 'e1',
                characterId: 'c1',
                slot: '头盔',
                name: '测试头盔',
                level: 80,
                details: {
                    version: 1,
                    base: [
                        { key: 'defense', value: 50, boost: null },
                        { key: 'mp', value: 100, boost: null },
                    ],
                    extra: [],
                    bonus: [],
                    melt: [],
                    technique: '水清诀',
                    effects: [],
                    gems: [{ type: '月亮石', level: 5 }],
                    forge: 5,
                },
                note: '保留备注',
            },
            {
                id: 'e2',
                characterId: 'c1',
                slot: '佩饰',
                name: '测试配饰',
                level: 80,
                details: {
                    version: 1,
                    base: [{ key: 'speed', value: 20, boost: null }],
                    extra: [{ key: 'hp', value: 60, boost: 100 }],
                    bonus: [],
                    melt: [],
                },
            },
        ],
        transactions: [
            {
                id: 't1',
                ledger: 'earnings',
                recordType: 'money',
                kind: 'income',
                currency: 'cash',
                amount: 30,
                characterId: 'c1',
                date: '2026-11-13',
            },
            {
                id: 't2',
                ledger: 'account',
                kind: 'income',
                currency: 'rmb',
                amount: 100,
                fee: 5,
                characterId: 'c1',
                date: '2026-11-13',
            },
            {
                id: 't3',
                ledger: 'account',
                source: 'settle',
                kind: 'income',
                currency: 'cash',
                amount: 30,
                characterId: 'c1',
                date: '2026-11-13',
            },
        ],
        prices: [
            {
                id: 'p1',
                name: '测试物品',
                category: '杂物',
                logs: [{ id: 'pl1', date: '2026-11-13', price: 50000 }],
            },
        ],
        goals: [
            {
                id: 'g1',
                type: 'progress',
                title: '攻击修炼',
                characterId: 'all',
                target: 15,
                tracking: { category: 'training', key: 'attack' },
            },
        ],
        sessions: [],
        quickSettings: { cardPrice: 15000, cardCost: true },
        itemPrices: { 1: 50000 },
    };
}

describe('旧版独立转换', () => {
    it('旧版成长记录保留零值和修改前后值', () => {
        const raw = fixture();
        const { backup } = convertLegacyData(
            JSON.stringify({
                ...raw,
                characters: [
                    {
                        ...raw.characters[0],
                        growthHistory: [
                            {
                                id: 'history1',
                                date: '2026-11-13',
                                createdAt: NOW,
                                changes: [
                                    {
                                        group: '人物修炼',
                                        label: '攻击修炼',
                                        from: 0,
                                        to: 12,
                                        unit: '级',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }),
            NOW,
        );
        expect(backup.characters[0].growthHistory?.[0]).toMatchObject({
            source: 'legacy',
            changes: [{ group: '人物修炼', label: '攻击修炼', from: '0', to: '12' }],
        });
    });
    it('物品按当前参考价固定估值，历史点卡成本保持一致并重建账号流水', () => {
        const source = fixture();
        const raw = {
            ...source,
            transactions: [
                {
                    id: 'item1',
                    ledger: 'earnings',
                    recordType: 'item',
                    kind: 'income',
                    currency: 'cash',
                    itemId: 1,
                    quantity: 2,
                    amount: 3,
                    unitPrice: 1.5,
                    date: '2026-11-13',
                    characterId: 'c1',
                },
            ],
            sessions: [
                {
                    id: 'online1',
                    mode: 'range',
                    date: '2026-11-13',
                    characterId: 'c1',
                    startAt: NOW - 86400000,
                    endAt: NOW - 86400000 + 3600000,
                    cost: 9,
                    cardPrice: 15000,
                    accounts: 1,
                },
            ],
        };
        const { backup } = convertLegacyData(JSON.stringify(raw), NOW);
        expect(backup.income[0].amount).toBe(100000);
        expect(sessionCost(backup.online[0])).toBe(90000);
        expect(
            backup.accounts
                .filter((one) => one.source === 'auto')
                .map((one) => [one.kind, one.amount]),
        ).toEqual([
            ['income', 100000],
            ['expense', 90000],
        ]);
    });
    it('换算游戏币、人民币手续费并移除待重新生成的旧结算', () => {
        const { backup } = convertLegacyData(JSON.stringify(fixture()), NOW);
        expect(backup.income[0].amount).toBe(300000);
        expect(backup.accounts.filter((one) => one.source !== 'auto')).toHaveLength(1);
        expect(backup.accounts[0]).toMatchObject({ currency: 'rmb', amount: 95, source: '' });
        expect(backup.accounts.find((one) => one.source === 'auto')).toMatchObject({
            currency: 'cash',
            amount: 300000,
            category: '游戏收益',
        });
        expect(backup.prices[0].points[0].price).toBe(50000);
    });
    it('保持装备基础、强化属性、备注和部位映射', () => {
        const { backup } = convertLegacyData(JSON.stringify(fixture()), NOW);
        const gear = backup.characters[0].gear;
        expect(gear.find((one) => one.slot === '头')?.detail).toMatchObject({
            note: '保留备注',
            stats: [
                { label: '防御', value: '50', group: 'base' },
                { label: '魔法', value: '100', group: 'base' },
            ],
        });
        expect(gear.find((one) => one.slot === '配饰')?.detail?.stats[1]).toMatchObject({
            label: '气血',
            value: '60',
            extra: '100',
            group: 'extra',
        });
    });
    it('修炼与目标关联转换到新字段，全部角色变为快照', () => {
        const { backup } = convertLegacyData(JSON.stringify(fixture()), NOW);
        expect(backup.goals[0]).toMatchObject({
            kind: 'growth',
            tracking: { category: 'training', key: '攻击修炼' },
            members: [{ id: 'c1', name: '测试角色' }],
        });
        expect(
            backup.characters[0].trainings
                .flatMap((group) => group.rows)
                .find((one) => one.name === '攻击修炼')?.level,
        ).toBe(12);
    });
    it('拒绝未知版本、重复身份、无效日期和断开的装备引用', () => {
        const old = fixture();
        expect(() => convertLegacyData(JSON.stringify({ ...old, schemaVersion: 11 }), NOW)).toThrow(
            'v10',
        );
        expect(() =>
            convertLegacyData(
                JSON.stringify({ ...old, characters: [...old.characters, old.characters[0]] }),
                NOW,
            ),
        ).toThrow('ID');
        old.transactions[0].date = '2026-02-30';
        expect(() => convertLegacyData(JSON.stringify(old), NOW)).toThrow('日期');
        const broken = fixture();
        broken.characters[0].equipmentSets[0].slots.头盔 = 'missing';
        expect(() => convertLegacyData(JSON.stringify(broken), NOW)).toThrow('引用');
    });
    it('保留手动目标初始进度并接受 BOM，不改变输入对象', () => {
        const old = fixture();
        const raw = JSON.stringify({
            ...old,
            goals: [
                {
                    id: 'money1',
                    type: 'money',
                    title: '存钱',
                    target: 100,
                    current: 45,
                    baseProgress: 20,
                    logs: [{ id: 'log1', date: '2026-11-13', delta: 25 }],
                    characterId: 'all',
                },
            ],
        });
        const converted = convertLegacyData('\uFEFF' + raw, NOW);
        expect(converted.backup.goals[0].logs.map((one) => one.delta)).toEqual([20, 25]);
        expect(JSON.stringify(old)).toBe(JSON.stringify(fixture()));
    });

    it('缺少初始进度的目标由当前进度减流水恢复', () => {
        const { backup } = convertLegacyData(
            JSON.stringify({
                ...fixture(),
                goals: [
                    {
                        id: 'manual1',
                        type: 'progress',
                        target: 100,
                        current: 45,
                        characterId: 'all',
                        logs: [{ id: 'log1', date: '2026-11-13', delta: 25 }],
                    },
                ],
            }),
            NOW,
        );
        expect(backup.goals[0].logs.map((one) => one.delta)).toEqual([20, 25]);
    });

    it('已关联补记的 quick 点卡费用不重复导入收益', () => {
        const { backup } = convertLegacyData(
            JSON.stringify({
                ...fixture(),
                transactions: [
                    {
                        id: 'card1',
                        ledger: 'earnings',
                        kind: 'expense',
                        category: '点卡',
                        source: 'quick',
                        sessionId: 'legacy-card1',
                        currency: 'cash',
                        amount: 9,
                        characterId: 'c1',
                        date: '2026-11-13',
                    },
                ],
                sessions: [
                    {
                        id: 'legacy-card1',
                        mode: 'legacy',
                        minutes: 60,
                        cost: 9,
                        characterId: 'c1',
                        date: '2026-11-13',
                        startAt: NOW,
                        endAt: NOW + 60000,
                    },
                ],
            }),
            NOW,
        );
        expect(backup.income).toEqual([]);
        expect(backup.accounts.map((one) => [one.category, one.amount])).toEqual([
            ['点卡消耗', 90000],
        ]);
        expect(sessionSlices(backup.online[0])).toEqual([{ date: '2026-11-13', minutes: 60 }]);
    });

    it('跨天费用沿用老版百分之一万的累计舍入', () => {
        const startAt = new Date('2026-11-12T23:59:00').getTime();
        const { backup } = convertLegacyData(
            JSON.stringify({
                ...fixture(),
                transactions: [],
                sessions: [
                    {
                        id: 'range1',
                        mode: 'range',
                        startAt,
                        endAt: startAt + 180000,
                        cost: 0.04,
                        characterId: 'c1',
                        date: '2026-11-12',
                    },
                ],
            }),
            NOW,
        );
        expect(backup.online.map((session) => sessionCost(session))).toEqual([100, 300]);
        expect(backup.accounts.map((one) => [one.date, one.amount])).toEqual([
            ['2026-11-12', 100],
            ['2026-11-13', 300],
        ]);
    });

    it('长时补记保留原日期、总时长与总费用，拆分身份冲突拒绝导入', () => {
        const raw = {
            ...fixture(),
            transactions: [],
            sessions: [
                {
                    id: 'long1',
                    mode: 'legacy',
                    date: '2026-11-13',
                    minutes: 1800,
                    cost: 270,
                    characterId: 'c1',
                },
            ],
        };
        const { backup } = convertLegacyData(JSON.stringify(raw), NOW);
        expect(backup.online.map((one) => one.date)).toEqual(['2026-11-13', '2026-11-13']);
        expect(backup.online.reduce((sum, one) => sum + sessionMinutes(one), 0)).toBe(1800);
        expect(backup.online.reduce((sum, one) => sum + sessionCost(one), 0)).toBe(2700000);
        expect(() =>
            convertLegacyData(
                JSON.stringify({
                    ...raw,
                    sessions: [...raw.sessions, { ...raw.sessions[0], id: 'long1-legacy-1' }],
                }),
                NOW,
            ),
        ).toThrow('冲突');
    });

    it('物品估值按老版两位万舍入，收益手续费不改变旧收益口径', () => {
        const raw = fixture();
        const { backup, warnings } = convertLegacyData(
            JSON.stringify({
                ...raw,
                itemPrices: { 1: 12345 },
                transactions: [
                    { ...raw.transactions[0], fee: 2 },
                    {
                        ...raw.transactions[0],
                        id: 'item1',
                        recordType: 'item',
                        itemId: 1,
                        quantity: 3,
                    },
                    { ...raw.transactions[1], amount: 5, fee: 5 },
                ],
            }),
            NOW,
        );
        expect(backup.income.map((one) => one.amount)).toEqual([300000, 37000]);
        expect(backup.accounts.filter((one) => one.source !== 'auto')).toEqual([]);
        expect(warnings.some((one) => one.includes('净额为零'))).toBe(true);
    });

    it('结构化玉魄与钟灵石映射到当前展示字段', () => {
        const raw = fixture();
        const { backup } = convertLegacyData(
            JSON.stringify({
                ...raw,
                characters: [
                    {
                        ...raw.characters[0],
                        equipmentSets: [{ slots: { '玉魄·阳': 'j1', 佩饰: 'e2' } }],
                    },
                ],
                equipment: [
                    {
                        id: 'j1',
                        characterId: 'c1',
                        slot: '玉魄·阳',
                        name: '玉魄',
                        details: {
                            version: 1,
                            base: [{ key: 'resistSeal', value: 10, boost: 20 }],
                            jade: {
                                dust: 7,
                                holes: 2,
                                assault: '奇袭法术',
                                chance: 3,
                                enchantments: ['法伤化劲+2.1%'],
                            },
                            runes: '测试组合',
                        },
                    },
                    {
                        ...raw.equipment[1],
                        details: {
                            ...raw.equipment[1].details,
                            clock: { name: '健步如飞', level: 4 },
                        },
                    },
                ],
            }),
            NOW,
        );
        const jade = backup.characters[0].gear.find((one) => one.slot === '玉魄·阳')?.detail;
        expect(jade?.stats).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ label: '抵抗封印命中等级', value: '10', extra: '20' }),
                expect.objectContaining({ label: '奇袭法术', value: '3%' }),
                expect.objectContaining({ label: '法伤化劲', value: '+2.1%', group: 'trait' }),
            ]),
        );
        expect(jade?.cond).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ label: '灵尘等级', value: '7' }),
                expect.objectContaining({ label: '开运孔数', value: '2' }),
            ]),
        );
        expect(
            backup.characters[0].gear.find((one) => one.slot === '配饰')?.detail?.cond,
        ).toContainEqual(expect.objectContaining({ label: '钟灵石', value: '健步如飞 (4级)' }));
    });

    it('已出售装备不能作为当前方案导入，单条旧计时给出提示', () => {
        const raw = fixture();
        expect(() =>
            convertLegacyData(
                JSON.stringify({
                    ...raw,
                    equipment: raw.equipment.map((one) => ({ ...one, status: 'sold' })),
                }),
                NOW,
            ),
        ).toThrow('引用');
        expect(
            convertLegacyData(
                JSON.stringify({ ...raw, activeSession: { id: 'running1' } }),
                NOW,
            ).warnings.some((one) => one.includes('正在计时')),
        ).toBe(true);
    });
});
