import { describe, expect, it } from 'vitest';
import type { AccountEntry } from '../accounts/accounts';
import type { CharacterData } from '../characters/character';
import type { IncomeEntry } from '../income/income';
import { sessionMinutes, type OnlineSession } from '../income/online';
import { teamActivity } from './team-activity';

function character(id: string): CharacterData {
    return {
        id,
        name: id,
        level: 109,
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
    };
}
function income(patch: Partial<IncomeEntry> = {}): IncomeEntry {
    return {
        id: 'i',
        characterId: 'c1',
        date: '2026-11-14',
        kind: 'income',
        amount: 50000,
        item: '兽决',
        note: '',
        createdAt: 1,
        ...patch,
    };
}
function account(patch: Partial<AccountEntry> = {}): AccountEntry {
    return {
        id: 'a',
        characterId: 'c1',
        date: '2026-11-14',
        kind: 'income',
        amount: 50,
        currency: 'rmb',
        category: '装备交易',
        channel: '藏宝阁',
        source: '',
        note: '',
        createdAt: 1,
        ...patch,
    };
}
function session(patch: Partial<OnlineSession> = {}): OnlineSession {
    return {
        id: 's',
        characterId: 'c1',
        roster: [],
        date: '2026-11-13',
        startAt: new Date(2026, 10, 13, 23).getTime(),
        endAt: null,
        cardPrice: 15000,
        cardCost: true,
        note: '',
        createdAt: 1,
        ...patch,
    };
}

describe('队伍最近记录', () => {
    it('收益按发生日期取最近一条，同日按创建时间；补记旧账不抢最新位置', () => {
        const newest = income({ id: 'newest', createdAt: 3, kind: 'expense', amount: 0 });
        const entries = [
            income({ createdAt: 2 }),
            newest,
            income({ date: '2026-11-13', createdAt: 100 }),
            income({ characterId: '', createdAt: 200 }),
            income({ characterId: 'other', createdAt: 300 }),
        ];
        const before = JSON.stringify(entries);
        const result = teamActivity([character('c1'), character('c2')], entries, [], []);
        expect(result.map((one) => one.character.id)).toEqual(['c1', 'c2']);
        expect(result[0].income).toBe(newest);
        expect(result[1].income).toBeNull();
        expect(JSON.stringify(entries)).toBe(before);
    });

    it('账号收入、支出独立取最新，保留原币种与金额，不与收益合计', () => {
        const latestIncome = account({
            id: 'cash',
            createdAt: 2,
            currency: 'cash',
            amount: 1800000,
        });
        const latestExpense = account({
            id: 'expense',
            date: '2026-11-12',
            kind: 'expense',
            amount: 60,
        });
        const accounts = [
            account(),
            latestIncome,
            latestExpense,
            account({ kind: 'expense', date: '2026-11-11', createdAt: 100 }),
            account({ characterId: '', createdAt: 200 }),
        ];
        const before = JSON.stringify(accounts);
        const [result] = teamActivity([character('c1')], [income()], [], accounts);
        expect(result.accountIncome).toBe(latestIncome);
        expect(result.accountExpense).toBe(latestExpense);
        expect(result.income?.amount).toBe(50000);
        expect(JSON.stringify(accounts)).toBe(before);
    });

    it('上线按实际开始时间取最近一段，兼容历史多人段并保留持续计时', () => {
        const now = new Date(2026, 10, 14, 2).getTime();
        const shared = session({ roster: ['c1', 'c2', 'c2'] });
        const newer = session({ id: 'newer', characterId: 'c2', startAt: now - 60000, endAt: now });
        const sessions = [
            shared,
            session({ startAt: shared.startAt - 60000, createdAt: 100 }),
            newer,
        ];
        const before = JSON.stringify(sessions);
        const results = teamActivity([character('c1'), character('c2')], [], sessions, []);
        expect(results[0].session).toBe(shared);
        expect(results[1].session).toBe(newer);
        expect(sessionMinutes(results[0].session!, now)).toBe(180);
        expect(sessionMinutes(results[0].session!, now + 60000)).toBe(181);
        expect(sessionMinutes(results[1].session!, now + 60000)).toBe(1);
        expect(JSON.stringify(sessions)).toBe(before);
    });

    it('新角色记录保持缺失，不以零或其他角色记录冒充', () => {
        const role = character('empty');
        expect(teamActivity([role], [income()], [session()], [account()])).toEqual([
            {
                character: role,
                session: null,
                income: null,
                accountIncome: null,
                accountExpense: null,
            },
        ]);
        expect(teamActivity([], [income()], [session()], [account()])).toEqual([]);
    });
});
