import type { AccountEntry } from '../accounts/accounts';
import type { CharacterData } from '../characters/character';
import type { IncomeEntry } from '../income/income';
import { ownersOf, type OnlineSession } from '../income/online';

export interface TeamActivity {
    character: CharacterData;
    session: OnlineSession | null;
    income: IncomeEntry | null;
    accountIncome: AccountEntry | null;
    accountExpense: AccountEntry | null;
}

/** 按业务日期取最近记录；同日按创建时间，不把补记时间误作发生日期。 */
function latestByCharacter<T extends { characterId: string; date: string; createdAt: number }>(
    entries: readonly T[],
): Map<string, T> {
    const latest = new Map<string, T>();
    for (const one of entries) {
        if (!one.characterId) continue;
        const previous = latest.get(one.characterId);
        if (
            !previous ||
            one.date > previous.date ||
            (one.date === previous.date && one.createdAt > previous.createdAt)
        ) {
            latest.set(one.characterId, one);
        }
    }
    return latest;
}

/** 各账本只索引一次，队伍顺序沿用名册，不混算双币种或两本账。 */
export function teamActivity(
    roster: readonly CharacterData[],
    entries: readonly IncomeEntry[],
    sessions: readonly OnlineSession[],
    accounts: readonly AccountEntry[],
): TeamActivity[] {
    const income = latestByCharacter(entries);
    const accountIncome = latestByCharacter(accounts.filter((one) => one.kind === 'income'));
    const accountExpense = latestByCharacter(accounts.filter((one) => one.kind === 'expense'));
    const online = new Map<string, OnlineSession>();
    for (const session of sessions) {
        for (const id of ownersOf(session)) {
            const previous = online.get(id);
            if (
                !previous ||
                session.startAt > previous.startAt ||
                (session.startAt === previous.startAt && session.createdAt > previous.createdAt)
            ) {
                online.set(id, session);
            }
        }
    }
    return roster.map((character) => ({
        character,
        session: online.get(character.id) ?? null,
        income: income.get(character.id) ?? null,
        accountIncome: accountIncome.get(character.id) ?? null,
        accountExpense: accountExpense.get(character.id) ?? null,
    }));
}
