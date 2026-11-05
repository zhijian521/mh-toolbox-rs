import { getCurrentWindow } from '@tauri-apps/api/window';
import {
    commands,
    type AccountEntry,
    type AppInfo,
    type IncomePayload,
    type PriceItem,
    type QuickPrice,
    type Value as JsonValue,
} from './bindings';

/**
 * 渲染层唯一允许直接碰系统的地方。
 *
 * 旧版把这条边界写成一条测试（`renderer-boundary.test.mjs`）：组件里不许出现
 * `window.mhV2` / `invoke` / `node:`。这里先立住同样的形状——页面只经本文件拿能力，
 * 换实现时只改这一处。
 *
 * 这条不只是注释：`eslint.config.js` 的 `no-restricted-imports` 拦 `@tauri-apps/*`
 * 出现在 `components/`、`views/`、`composables/` 里。原先只拦了
 * `@tauri-apps/api/core`，`TitleBar.vue` 便直接引了 `@tauri-apps/api/window` 管窗口按钮
 * ——规矩写着「只有 services 能碰系统」，检查却只管一个入口。窗口那一族现在也在本文件。
 *
 * ---- 命令名与参数类型从哪来 ----
 *
 * `bindings.ts` 是 `tauri-specta` 从 Rust 命令签名**生成**的，本文件只调不管。
 * 第 121 批之前这里逐个手写 `invoke<T>('prices_load')`，名字对不上只有运行时才炸；
 * 现在改名会让 `npm run typecheck` 直接红，而生成物每次 debug 启动都会重写一遍。
 * **不要手改 `bindings.ts`**——它头顶那行就是这句。
 */

/** 有没有 Tauri 宿主。浏览器里跑（`npm run dev` 但没有窗口）时为 false。 */
const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function hasDesktop(): boolean {
    return hasTauri;
}

/* `AppInfo` 的定义在生成物里（字段与 `lib.rs` 的 struct 一一对应），这里转出去，
 * 免得调用方两个地方各引一次。 */
export type { AppInfo };

/** 浏览器里跑（`npm run dev` 但没起 Tauri）时 invoke 会抛错，降级成 null 而不是炸掉页面。 */
export async function appInfo(): Promise<AppInfo | null> {
    try {
        return await commands.appInfo();
    } catch {
        return null;
    }
}

/**
 * 用系统默认浏览器打开外部链接。
 *
 * 为什么不用 `<a target="_blank">`：WebView2 里那会走 Tauri 的新窗口请求，
 * 默认被拦下来，点了没反应。所以外链统一交给这条通道。
 * 浏览器里跑（没有 Tauri）时退回 `window.open`，至少预览时能点开。
 */
export async function openExternal(url: string): Promise<boolean> {
    try {
        await commands.openExternal(url);
        return true;
    } catch {
        if (typeof window !== 'undefined') {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
        return false;
    }
}

/* ---------- 窗口 ----------
 * 自绘标题栏要的三件事：读最大化状态、跟着窗口变化同步、三个按钮。
 * 全部返回**无操作**而不是抛错：浏览器预览里没有窗口，标题栏仍要画得出来。
 *
 * `getCurrentWindow()` 必须写在函数体里而不是模块顶层——它在没有 Tauri 的页面上
 * 一调用就抛，而模块顶层会连预览按钮一起炸掉。
 */
export function windowMaximized(): Promise<boolean> {
    return hasTauri ? getCurrentWindow().isMaximized() : Promise.resolve(false);
}

/** 窗口尺寸变化时回调（最大化/还原）。返回取消订阅的函数，组件卸载时调它。 */
export async function onWindowResized(handler: () => void): Promise<() => void> {
    if (!hasTauri) return () => undefined;
    return getCurrentWindow().onResized(() => handler());
}

export function minimizeWindow(): void {
    if (hasTauri) void getCurrentWindow().minimize();
}

export function toggleMaximizeWindow(): void {
    if (hasTauri) void getCurrentWindow().toggleMaximize();
}

export function closeWindow(): void {
    if (hasTauri) void getCurrentWindow().close();
}

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
    if (!hasTauri) return null;
    try {
        return await commands.pricesLoad();
    } catch (error) {
        console.error('读取物价表失败', error);
        return null;
    }
}

/** 整份写回。返回 false 表示没写进去——调用方要能看见，不能静默吞掉。 */
export async function pricesSave(items: PriceItem[]): Promise<boolean> {
    if (!hasTauri) return false;
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
    if (!hasTauri) return null;
    try {
        return await commands.incomeLoad();
    } catch (error) {
        console.error('读取收益账失败', error);
        return null;
    }
}

/** 整份写回。返回 false 表示没写进去——速记的每一次点击都走这里，不能静默吞掉。 */
export async function incomeSave(payload: IncomePayload): Promise<boolean> {
    if (!hasTauri) return false;
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
    if (!hasTauri) return null;
    try {
        return await commands.accountLoad();
    } catch (error) {
        console.error('读取账号账本失败', error);
        return null;
    }
}

/** 整份写回。返回 false 表示没写进去——记一笔的每一次提交都走这里。 */
export async function accountSave(entries: AccountEntry[]): Promise<boolean> {
    if (!hasTauri) return false;
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
    if (!hasTauri) return null;
    try {
        return await commands.goalsLoad();
    } catch (error) {
        console.error('读取目标失败', error);
        return null;
    }
}

export async function goalSave(goals: JsonValue[]): Promise<boolean> {
    if (!hasTauri) return false;
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
    if (!hasTauri) return null;
    try {
        return await commands.charactersLoad();
    } catch (error) {
        console.error('读取角色名册失败', error);
        return null;
    }
}

export async function charactersSave(items: JsonValue[]): Promise<boolean> {
    if (!hasTauri) return false;
    try {
        await commands.charactersSave(items);
        return true;
    } catch (error) {
        console.error('写入角色名册失败', error);
        return false;
    }
}

/* ---------- 账本备份：导出 / 导入 / 清除 ----------
 * 对应 `src-tauri/src/backup.rs`。三个操作都落在「设置 → 数据」那张卡上。
 *
 * **这里不复用上面那两组的 `null` / `false` 口径**，因为它们的结局不是两种而是三种：
 * 做成了 / 用户自己取消 / 真的出错。压成布尔之后「取消」只能被读成「失败」，
 * 而那会在界面上留一句红字——用户点开另存为看了看就关掉，不该被指责一次。
 *
 * 文件位置、对话框、线程怎么处理全在 Rust 侧；这里只过 `invoke`，
 * 与「一个能力一个文件」那条不冲突——它同属「应用外壳」，和版本信息、窗口三键是同一层。
 *
 * ---- `truncation`：成功但有代价 ----
 * 只有导入会给这两个数。Rust 侧不裁剪（它负责如实搬进来，并把「会丢多少」数出来），
 * 裁剪是前端保存时的规矩（`prices.ts` 的 `POINT_LIMIT`）。于是导入一份 300 条点位的备份，
 * 界面上先看到 300 条、下次一存只剩 200 条——不提前说就是一次无声的数据丢失。
 *
 * **这里只递数字，不递句子**：上限（200）是 `prices.ts` 的规矩，`services/` 反过来去引
 * 一个页面模块就破了边界（`AGENTS.md` 红线 3）；在这边再写一遍 200 又成了第三份副本
 * （`src-tauri/src/backup.rs` 已经镜像了一份）。所以句子由用它的页面拼，数字从这边拿。
 */
export type DataOutcome =
    | { status: 'ok'; detail: string; truncation?: { points: number; items: number } }
    | { status: 'canceled' }
    | { status: 'failed'; error: string };

/** Rust 侧的 `Err(String)` 到这里就是一个字符串。`String(error)` 会把它裹成 `Error: …`，
 * 而那句话是要原样给用户看的（「第 3 条角色没有 id」之类），不能加前缀。
 *
 * 返回**失败分支本身**而不是 `DataOutcome`：账本与单价文件两套结局集共用这一种形状，
 * 收窄成具体分支后两边都能直接 `return`，不必各写一次 `as`（写了就没人再检查）。 */
function failure(error: unknown): { status: 'failed'; error: string } {
    const text =
        typeof error === 'string' ? error : error instanceof Error ? error.message : String(error);
    return { status: 'failed', error: text };
}

/** 浏览器预览里没有数据层。三个函数共用这一句，免得三处各写一遍再各自漂移。 */
const NO_HOST: { status: 'failed'; error: string } = {
    status: 'failed',
    error: '浏览器预览里没有数据层',
};

/** 导出到用户自己选的位置。`detail` 带上落盘路径，用户要去那个目录拿文件。 */
export async function dataExport(): Promise<DataOutcome> {
    if (!hasTauri) return NO_HOST;
    try {
        const path = await commands.dataExport();
        if (path === null) return { status: 'canceled' };
        return { status: 'ok', detail: `已导出到 ${path}` };
    } catch (error) {
        return failure(error);
    }
}

/**
 * 整份替换现有数据。`detail` 必须带备份路径——那是用户唯一能退回去的地方。
 *
 * 截断数原样递出去（见 `DataOutcome` 的注释）：一条都不丢时 `points` 是 0，
 * 调用方据此决定要不要多那一句。
 */
export async function dataImport(): Promise<DataOutcome> {
    if (!hasTauri) return NO_HOST;
    try {
        const summary = await commands.dataImport();
        if (summary === null) return { status: 'canceled' };
        return {
            status: 'ok',
            detail:
                `已导入 ${summary.characters} 个角色、${summary.prices} 件物价、` +
                `${summary.goals} 个目标。替换前的数据备份在 ${summary.backupPath}`,
            truncation: { points: summary.truncated, items: summary.truncatedItems },
        };
    } catch (error) {
        return failure(error);
    }
}

/** 清空角色与物价。报出数量，用户才分得清「清掉了一份账」和「本来就是空的」。 */
export async function dataClear(): Promise<DataOutcome> {
    if (!hasTauri) return NO_HOST;
    try {
        const summary = await commands.dataClear();
        return {
            status: 'ok',
            detail: `已清空 ${summary.characters} 个角色、${summary.prices} 件物价、${summary.goals} 个目标`,
        };
    } catch (error) {
        return failure(error);
    }
}

/* ---------- 速记单价的导入 / 导出（第 123 批） ----------
 * 与上面那三个「整本账」的命令不是一回事：那是换机器、整份恢复，这是单独把速记格里的
 * 价目表搬出去/搬回来。文件信封同名（`format` / `app` / `exportedAt` / `quickPrices`），
 * 所以它同时是账本备份的**子集**——一份整本备份也能当单价文件导。
 *
 * 分工与账本那组一致：Rust 只做对话框与文件，合并与写盘在前端（`income-store` 的
 * `mergePrices`）。于是「导入」这条路上没有「库里改了、内存没改」的中间态。
 *
 * 结局仍是三态（成功 / 用户取消 / 出错），理由与 `DataOutcome` 完全相同。
 */
export type PriceExportOutcome =
    { status: 'ok'; path: string } | { status: 'canceled' } | { status: 'failed'; error: string };

export type PriceImportOutcome =
    | { status: 'ok'; prices: QuickPrice[] }
    | { status: 'canceled' }
    | { status: 'failed'; error: string };

/**
 * 把当前单价写成一份文件。`prices` 由调用方从内存里递进来——那里就是当下的真值
 * （每次改价都已整份落盘），再读一次库只会给「导出到的是哪一版」多开一种解释。
 */
export async function priceFileExport(prices: QuickPrice[]): Promise<PriceExportOutcome> {
    if (!hasTauri) return NO_HOST;
    try {
        const path = await commands.quickPricesExport(prices);
        if (path === null) return { status: 'canceled' };
        return { status: 'ok', path };
    } catch (error) {
        return failure(error);
    }
}

/** 选一份文件、把里面的单价交回来。合并与落盘由 `income-store.mergePrices` 做。 */
export async function priceFileImport(): Promise<PriceImportOutcome> {
    if (!hasTauri) return NO_HOST;
    try {
        const prices = await commands.quickPricesImport();
        if (prices === null) return { status: 'canceled' };
        return { status: 'ok', prices };
    } catch (error) {
        return failure(error);
    }
}
