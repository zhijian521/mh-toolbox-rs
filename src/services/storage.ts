import {
    commands,
    type AccountEntry,
    type IncomePayload,
    type PriceItem,
    type Value as JsonValue,
} from './bindings';
import { hasDesktop } from './desktop';

/* ---------- 本地数据（SQLite） ----------
 * 数据存在 Rust 侧（`src-tauri/src/store.rs`），这里只做搬运。
 *
 * **类型来自生成物，不来自页面**：`bindings.ts` 是从 Rust 命令签名生成的，所以这里引的是
 * 契约（`PriceItem` / `IncomePayload` / `AccountEntry`），不是 `views/prices` 的某个结构
 * ——`services/` 反过来依赖页面就又破了边界。页面那边各有一份同形声明，
 * **真正把关的仍然是 `normalizePriceItem` 那几个归一函数**：库可能是上一版应用写的、
 * 也可能被人手改过，类型在那两种情形下帮不上忙。
 *
 * `characters_*` / `goals_*` 是整条 JSON 透传，生成出来是 `Value[]`
 * （对应 Rust 的 `serde_json::Value`），前端只看它「是个数组」，结构由
 * `roster.ts` / `goals.ts` 自己解析。
 *
 * **浏览器里一律返回 null / false**，不是抛错：探针（`tools/probe/cdp.mjs`）和
 * `npm run dev` 都没有 Tauri 宿主，调用方据此退回 `localStorage`。
 * 两条路径的数据是**各自独立**的，这正合适——探针塞的种子数据不该污染真档案。
 */
export async function pricesLoad(): Promise<PriceItem[] | null> {
    if (!hasDesktop()) return null;
    try {
        return await commands.pricesLoad();
    } catch (error) {
        console.error('读取物价表失败', error);
        return null;
    }
}

/** 整份写回。返回 false 表示没写进去——调用方要能看见，不能静默吞掉。 */
export async function pricesSave(items: PriceItem[]): Promise<boolean> {
    if (!hasDesktop()) return false;
    try {
        await commands.pricesSave(items);
        return true;
    } catch (error) {
        console.error('写入物价表失败', error);
        return false;
    }
}

/* ---------- 收益账（第 97 批） ----------
 * 收益记录与速记单价**一起**读写：收益页总要同时用（速记格显示单价、今日清单显示记录），
 * 分两条命令会让首屏闪一下——先画出记录、单价后到，格子里的数会跳一档。
 */
export async function incomeLoad(): Promise<IncomePayload | null> {
    if (!hasDesktop()) return null;
    try {
        return await commands.incomeLoad();
    } catch (error) {
        console.error('读取收益账失败', error);
        return null;
    }
}

/** 整份写回。返回 false 表示没写进去——速记的每一次点击都走这里，不能静默吞掉。 */
export async function incomeSave(payload: IncomePayload): Promise<boolean> {
    if (!hasDesktop()) return false;
    try {
        await commands.incomeSave(payload);
        return true;
    } catch (error) {
        console.error('写入收益账失败', error);
        return false;
    }
}

/* ---------- 账号账本（第 112 批） ----------
 * 与收益账不同，这里只有一份数据：账号页没有「配套小表」，筛选与汇总全在前端算。
 * 所以载荷就是一个数组，不必再包一层信封——多一层只会让「读到 null」有第二种解释。
 */
export async function accountLoad(): Promise<AccountEntry[] | null> {
    if (!hasDesktop()) return null;
    try {
        return await commands.accountLoad();
    } catch (error) {
        console.error('读取账号账本失败', error);
        return null;
    }
}

/** 整份写回。返回 false 表示没写进去——记一笔的每一次提交都走这里。 */
export async function accountSave(entries: AccountEntry[]): Promise<boolean> {
    if (!hasDesktop()) return false;
    try {
        await commands.accountSave(entries);
        return true;
    } catch (error) {
        console.error('写入账号账本失败', error);
        return false;
    }
}

/* ---------- 目标（第 115 批） ----------
 * 与名册同一条路子：整条 JSON 透传，结构全由前端 `goals.ts` 把关。
 * 目标页只有「整份读 / 整份写」两种动作——进度是现算的，没有按字段查询的需求。
 */
export async function goalLoad(): Promise<JsonValue[] | null> {
    if (!hasDesktop()) return null;
    try {
        return await commands.goalsLoad();
    } catch (error) {
        console.error('读取目标失败', error);
        return null;
    }
}

export async function goalSave(goals: JsonValue[]): Promise<boolean> {
    if (!hasDesktop()) return false;
    try {
        await commands.goalsSave(goals);
        return true;
    } catch (error) {
        console.error('写入目标失败', error);
        return false;
    }
}

/* ---------- 角色名册（同一套数据层，JSON 列存整条） ----------
 * 四个函数与物价那组一一对应，理由见上面那一段。返回 `null` / `false` 一律是
 * 「没有 Tauri 宿主」或「调用失败」，不在这里抛错——**怎么处置由调用方定**：
 * 可以退回 `localStorage`，也可以拒绝写入并把原因交给界面。
 * `roster.ts` / `prices-store.ts` 取的是后者：读失败时立起 `loadError`、停掉一切写，
 * 因为把「读失败」当「空库」会立刻覆盖掉用户原有的数据。
 */
export async function charactersLoad(): Promise<JsonValue[] | null> {
    if (!hasDesktop()) return null;
    try {
        return await commands.charactersLoad();
    } catch (error) {
        console.error('读取角色名册失败', error);
        return null;
    }
}

export async function charactersSave(items: JsonValue[]): Promise<boolean> {
    if (!hasDesktop()) return false;
    try {
        await commands.charactersSave(items);
        return true;
    } catch (error) {
        console.error('写入角色名册失败', error);
        return false;
    }
}
