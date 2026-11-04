/**
 * 物品名 → 图标地址。给**只看得到名字**的地方用（今日速记、历史收益）。
 *
 * 为什么不直接存 id：`IncomeEntry.item` 存的是用户看得见的那串字（见 `income.ts` 的
 * `IncomeEntry` 注释），账本里存字比存 id 更抗改——改了物品清单，旧账仍然读得懂，
 * 只是可能没图。所以显示时要用名字**反查**一次表。
 *
 * 为什么不各自建一份：`TodayDump` 与 `IncomeHistoryDialog` 都要这张反向表，各建一份
 * 等于每次打开历史都把 59 项扫一遍，而且两张表迟早会有一张忘了跟着物品清单改
 * （表现是「今天有图、历史里没图」，最难查的那种）。
 *
 * 表是**懒建**的：`quickItems()` 要等 `main.ts` 的 `loadGameData()` 装完才有内容，
 * 模块顶层直接建会拿到一张空表——而空表不报错，只让所有图标静默变成空白。
 * 组件都是装完之后才挂载，所以第一次调用时建就够。
 */
import { quickItems } from '../../services/game-data';
import { quickItemIcon } from '../../services/game-icons';

let table: Map<string, string> | null = null;

/** 查不到就返回空串，调用方退回文字（图可以缺，账不能看不出是什么）。 */
export function itemIconOf(name: string): string {
    if (!table) {
        table = new Map();
        const all = quickItems();
        for (const one of [...all.fixed, ...all.variable]) {
            table.set(one.name, quickItemIcon(one.file));
        }
    }
    return table.get(name) ?? '';
}
