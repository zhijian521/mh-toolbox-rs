import { describe, expect, it, vi } from 'vitest';
import { isReadonly, readonly } from 'vue';
import type { GearDetail } from '../views/characters/gear';
import { cloneDraft } from '../views/characters/quick/clone-draft';

describe('业务状态只读边界', () => {
    it('六个领域公开只读集合，业务方法仍可更新；写入回执不泄漏可变记录', async () => {
        vi.resetModules();
        vi.doMock('./desktop', () => ({ hasDesktop: () => true }));
        vi.doMock('./storage', () => ({
            charactersLoad: async () => [],
            charactersSave: async () => true,
            pricesLoad: async () => [],
            pricesSave: async () => true,
            incomeLoad: async () => ({ entries: [], prices: [] }),
            incomeSave: async () => true,
            accountLoad: async () => [],
            accountSave: async () => true,
            goalLoad: async () => [],
            goalSave: async () => true,
            onlineLoad: async () => ({ sessions: [], settings: {} }),
            onlineSave: async () => true,
        }));
        await import('./game-data.fixture');
        const rosterModule = await import('../views/characters/roster');
        const pricesModule = await import('../views/prices/prices-store');
        const incomeModule = await import('../views/income/income-store');
        const accountsModule = await import('../views/accounts/accounts-store');
        const goalsModule = await import('../views/goals/goals-store');
        const onlineModule = await import('../views/income/online-store');
        await Promise.all([
            rosterModule.loadRoster(),
            pricesModule.loadPrices(),
            incomeModule.loadIncome(),
            accountsModule.loadAccounts(),
            goalsModule.loadGoals(),
            onlineModule.loadOnline(),
        ]);
        const roster = rosterModule.useRoster();
        const prices = pricesModule.usePrices();
        const income = incomeModule.useIncome();
        const accounts = accountsModule.useAccounts();
        const goals = goalsModule.useGoals();
        const online = onlineModule.useOnline();
        const draft = rosterModule.emptyCharacter();
        roster.add(draft);
        expect(prices.addItem({ name: '宝石', category: '宝石', sub: '', note: '' }, 1).ok).toBe(
            true,
        );
        const incomeWrite = income.recordEntry({ item: '宝石', amount: 10000 });
        const accountInput = {
            date: '2026-11-15',
            characterId: draft.id,
            kind: 'expense' as const,
            currency: 'rmb' as const,
            category: '点卡',
            channel: '官方充值',
            amount: 30,
        };
        const accountWrite = accounts.addEntry(accountInput);
        const tracking = { category: 'level' as const, key: '角色等级' };
        const goalWrite = goals.addGoal({
            kind: 'growth',
            title: '',
            members: [{ id: draft.id, name: draft.name }],
            target: 100,
            unit: '级',
            tracking,
            deadline: '',
            note: '',
        });
        const onlineWrite = online.startOnline({ characterIds: [draft.id] });
        for (const state of [
            roster.roster,
            prices.items,
            income.entries,
            accounts.entries,
            goals.goals,
            online.sessions,
        ]) {
            expect(isReadonly(state)).toBe(true);
            expect(isReadonly(state.value)).toBe(true);
            expect(state.value).toHaveLength(1);
            expect(isReadonly(state.value[0])).toBe(true);
        }
        expect(incomeWrite.ok && isReadonly(incomeWrite.entries)).toBe(true);
        expect(accountWrite.ok && isReadonly(accountWrite.entry)).toBe(true);
        if (accountWrite.ok) {
            const updated = accounts.updateEntry(accountWrite.entry.id, accountInput);
            expect(updated.ok && isReadonly(updated.entry)).toBe(true);
        }
        expect(goalWrite.ok && isReadonly(goalWrite.goal.members)).toBe(true);
        expect(onlineWrite.ok && isReadonly(onlineWrite.sessions[0].roster)).toBe(true);
        expect(isReadonly(goalsModule.goalsOfCharacter(draft.id))).toBe(true);
        expect(isReadonly(onlineModule.runningSessions()[0])).toBe(true);
        expect(isReadonly(income.target.value)).toBe(true);
        expect(isReadonly(income.prices.value)).toBe(true);
        expect(isReadonly(online.settings.value)).toBe(true);

        // 保存后继续改旧草稿，不能绕过保存入口影响已有数据。
        draft.name = '尚未保存';
        draft.attrGroups[0].rows[0].value = '99999';
        tracking.key = '尚未保存';
        expect(roster.roster.value[0].name).not.toBe(draft.name);
        expect(roster.roster.value[0].attrGroups[0].rows[0].value).not.toBe('99999');
        expect(goals.goals.value[0].tracking?.key).toBe('角色等级');

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        Reflect.set(roster.roster.value[0].attrGroups[0].rows[0], 'value', '绕过修改');
        Reflect.set(income.prices.value, '1', 99999);
        Reflect.set(online.settings.value, 'cardCost', false);
        expect(roster.roster.value[0].attrGroups[0].rows[0].value).not.toBe('绕过修改');
        expect(income.prices.value['1']).toBeUndefined();
        expect(online.settings.value.cardCost).toBe(true);
        await Promise.all([
            roster.flush(),
            prices.flush(),
            income.flush(),
            accounts.flush(),
            goals.flush(),
            online.flush(),
        ]);
    });

    it('只读装备复制为可编辑草稿，修改和清空都不影响原记录', () => {
        const original = readonly<GearDetail>({
            name: '武器',
            kind: '剑',
            stats: [{ label: '伤害', value: '500' }],
        });
        const draft = cloneDraft<GearDetail>(original);
        draft.stats[0].value = '600';
        draft.stats.splice(0, 1);
        expect(original.stats).toEqual([{ label: '伤害', value: '500' }]);
    });
});
