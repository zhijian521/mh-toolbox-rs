/** 概览与历史共用双币种读数，金额单位、方向色和标题提示只在这里生成。 */
import { ledgerDirectionTone, ledgerMoneyTone } from '../../services/format';
import type { StatItem } from '../../components/StatStrip.vue';
import { accountStatsByCurrency, type AccountEntry } from './accounts';
import { BOOK_OPTIONS, accountValueText } from './account-analysis';

export function accountSummaryBooks(entries: readonly AccountEntry[]) {
    const stats = accountStatsByCurrency(entries);
    return BOOK_OPTIONS.map(({ value: currency, label: heading }) => {
        const book = stats[currency];
        return {
            currency,
            heading,
            hint: book.count + ' 笔',
            items: [
                {
                    id: currency + '-income',
                    cap: '收入',
                    value: accountValueText(book.income, currency),
                    tone: ledgerDirectionTone('income'),
                },
                {
                    id: currency + '-expense',
                    cap: '支出',
                    value: accountValueText(book.expense, currency),
                    tone: ledgerDirectionTone('expense'),
                },
                {
                    id: currency + '-net',
                    cap: '差额',
                    value: accountValueText(book.net, currency),
                    tone: ledgerMoneyTone(book.net, 'net', currency),
                },
            ] satisfies StatItem[],
        };
    });
}
