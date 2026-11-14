import { commands, type QuickPrice } from './bindings';
import { hasDesktop } from './desktop';
import { flushPendingWrites } from './persist';

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
    | {
          status: 'ok';
          detail: string;
          warning?: string;
          truncation?: { points: number; items: number };
      }
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
    if (!hasDesktop()) return NO_HOST;
    if (!(await flushPendingWrites())) return failure('仍有数据未保存，请先重试保存再导出');
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
    if (!hasDesktop()) return NO_HOST;
    if (!(await flushPendingWrites())) return failure('仍有数据未保存，请先重试保存');
    try {
        const summary = await commands.dataImport();
        if (summary === null) return { status: 'canceled' };
        return {
            status: 'ok',
            detail:
                `已导入 ${summary.characters} 个角色、${summary.prices} 件物价、` +
                `${summary.entries} 笔收益流水、${summary.accounts} 笔账号记录、` +
                `${summary.online} 条上线记录、${summary.goals} 个目标。速记单价已一并替换。替换前的数据备份在 ${summary.backupPath}`,
            truncation: { points: summary.truncated, items: summary.truncatedItems },
        };
    } catch (error) {
        return failure(error);
    }
}

/** 专用旧版入口只读取选中文件，预览阶段不写库。 */
export async function legacyDataRead(): Promise<
    { status: 'ok'; raw: string } | { status: 'canceled' } | { status: 'failed'; error: string }
> {
    if (!hasDesktop()) return NO_HOST;
    try {
        const raw = await commands.legacyDataRead();
        return raw === null ? { status: 'canceled' } : { status: 'ok', raw };
    } catch (error) {
        return failure(error);
    }
}

/** 提交预览对应的两份内容；后端先留存原件，再备份当前账本并事务替换。 */
export async function legacyDataImport(original: string, converted: string): Promise<DataOutcome> {
    if (!hasDesktop()) return NO_HOST;
    if (!(await flushPendingWrites())) return failure('仍有数据未保存，请先重试保存');
    try {
        const { summary, originalPath } = await commands.legacyDataImport(original, converted);
        return {
            status: 'ok',
            detail: `已导入 ${summary.characters} 个角色、${summary.prices} 件物价、${summary.entries} 笔收益、${summary.accounts} 笔账号记录、${summary.online} 条上线记录和 ${summary.goals} 个目标。当前账本备份在 ${summary.backupPath}；旧版原件在 ${originalPath}`,
            truncation: { points: summary.truncated, items: summary.truncatedItems },
        };
    } catch (error) {
        return failure(error);
    }
}

/** 清空全部账本数据。报出数量，用户才分得清「清掉了一份账」和「本来就是空的」。 */
export async function dataClear(): Promise<DataOutcome> {
    if (!hasDesktop()) return NO_HOST;
    if (!(await flushPendingWrites())) return failure('仍有数据未保存，请先重试保存');
    try {
        const summary = await commands.dataClear();
        return {
            status: 'ok',
            detail:
                `已清空 ${summary.characters} 个角色、${summary.prices} 件物价、` +
                `${summary.entries} 笔收益流水、${summary.accounts} 笔账号记录、${summary.online} 条上线记录、` +
                `${summary.goals} 个目标，速记单价已清空`,
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
    if (!hasDesktop()) return NO_HOST;
    if (!(await flushPendingWrites())) return failure('仍有数据未保存，请先重试保存');
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
    if (!hasDesktop()) return NO_HOST;
    if (!(await flushPendingWrites())) return failure('仍有数据未保存，请先重试保存');
    try {
        const prices = await commands.quickPricesImport();
        if (prices === null) return { status: 'canceled' };
        return { status: 'ok', prices };
    } catch (error) {
        return failure(error);
    }
}
