/**
 * 账号账本的**持有者**：模块级单例 + 写入即落盘。
 *
 * 与 `income-store.ts` / `prices-store.ts` / `roster.ts` 同一套写法：规则在
 * `accounts.ts`（纯函数、可单测），这里只做四件事——读、改、写、把「改不成」的原因交回去。
 * 「怎么安全地写下去」那一整套（读失败拒写 / 浏览器写本地 / 桌面异步写库 / 写队列）
 * 在 `services/persist.ts`，四个数据层共用一份。
 *
 * ---- 为什么整份读写 ----
 * 一次记一笔 = 内存里加一条 + 整份写回。一年几百条的量级，这点开销换来的是
 * 「永远不会出现界面有、库里没有」。分条写要处理「插入失败但界面已经加了」的补偿，
 * 而那套补偿本身就是新的 bug 来源。
 */
import { ref } from 'vue';
import { hasDesktop, accountLoad, accountSave } from '../../services/desktop';
import { createPersist } from '../../services/persist';
import { makeId } from '../../services/shape';
import { parseAccounts, type AccountEntry, type AccountKind, type Currency } from './accounts';

/** 浏览器预览（探针 / `npm run dev`）那一版存在这里；桌面版走 SQLite，两者各自独立。 */
const STORAGE_KEY = 'mh-accounts';

const entries = ref<AccountEntry[]>([]);

/** 最近一次落盘失败的原因。写着「已记上」但其实是空的，比报错更糟。 */
const writeError = ref('');

/** 读档失败的原因。空串 = 读到了（含「库里本来就没有」）。 */
const loadError = ref('');

/**
 * 一次写入的结果。
 *
 * 成功时把**落库那条**带回去：回执里要说「已记 ¥30」或「已记 4.6 万」，而调用方手里
 * 只有输入框里的数（万），换算成原值的那一步在这里。让它自己再乘一次 10000，
 * 就是把这个换算写两遍，迟早有一处忘了改。
 */
export type AccountWrite = { ok: true; entry: AccountEntry } | { ok: false; error: string };

/** 落盘。浏览器写本地、桌面版异步写库，连续写排队——细节见 `services/persist.ts`。 */
const persist = createPersist({
    label: '账号账本',
    loadError,
    writeError,
    writeLocal: () => {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value));
        } catch (error) {
            console.error('账号账本写不进 localStorage', error);
            writeError.value = '这一笔没存下来，检查一下浏览器存储空间';
        }
    },
    writeRemote: () => accountSave(entries.value),
});

/**
 * 读档。**只能调一次，且在 mount 之前**（与 `loadIncome()` 同一个位置，见 `main.ts`）。
 *
 * 账号页是第 112 批才有的功能，没有更早的 `localStorage` 版本要搬——不做 legacy 迁移。
 */
export async function loadAccounts(): Promise<void> {
    if (!hasDesktop()) {
        if (typeof localStorage === 'undefined') return;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        try {
            entries.value = parseAccounts(JSON.parse(raw));
        } catch {
            console.error('浏览器里的账号账本读不懂，保留空表');
        }
        return;
    }

    const stored = await accountLoad<unknown>();
    /* 读失败**不是空账**。先拿原始结果再分支，就是为了让 `null` 这个信号走到错误位；
     * 写成 `stored ?? []` 就把它抹掉了，而后果是「用户随手记一笔，旧账被清空」。 */
    if (stored === null) {
        loadError.value = '读不出账号账本，已暂停写入以免覆盖原有数据';
        entries.value = [];
        return;
    }
    loadError.value = '';
    entries.value = parseAccounts(stored);
}

/* ---------- 改 ---------- */

export interface EntryInput {
    date: string;
    characterId: string;
    kind: AccountKind;
    currency: Currency;
    category: string;
    channel: string;
    /** 输入框里的数：人民币按元、梦幻币按万。这里负责换算成原值。 */
    amount: number;
    note?: string;
}

/**
 * 输入金额 → 落库金额。
 *
 * 梦幻币的输入框写「万」，库里存**原值**（× 10000），与收益页、物价同一个口径：
 * 存「4.6」再配一个单位列，等于每处读取都要记得乘回去，而漏乘一次的表现是
 * 「账目少了一万倍」——这种错不会报错，只会让总数悄悄不对。
 *
 * 人民币不收万：一笔记几十几百元，多一层换算只会让「30 元」要写成「0.003 万」。
 */
function toStored(amount: number, currency: Currency): number {
    if (currency === 'cash') return Math.round(amount * 10000);
    return Math.round(amount * 100) / 100;
}

/**
 * 校验一笔输入。**先换算、再判正**——
 * 反过来会让 `0.00001` 万过关、落成 `0`，而 `0` 在 `normalizeEntry` 里是「丢掉」：
 * 用户点了保存、提示说记上了、重启后那条不见了。
 */
function check(input: EntryInput): { ok: true; amount: number } | { ok: false; error: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: '日期不对' };
    if (!input.category) return { ok: false, error: '选一个分类' };
    const amount = toStored(input.amount, input.currency);
    if (!Number.isFinite(amount) || amount <= 0) {
        return {
            ok: false,
            error: input.currency === 'cash' ? '金额要大于 0 万' : '金额要大于 0 元',
        };
    }
    return { ok: true, amount };
}

function compose(input: EntryInput, amount: number, id: string, createdAt: number): AccountEntry {
    return {
        id,
        date: input.date,
        characterId: input.characterId,
        kind: input.kind,
        currency: input.currency,
        category: input.category,
        channel: input.channel,
        amount,
        note: (input.note ?? '').trim(),
        createdAt,
    };
}

/** 记一笔（新建）。 */
export function addEntry(input: EntryInput): AccountWrite {
    if (loadError.value) return { ok: false, error: '账号账本读取失败，先修好再来记' };
    const checked = check(input);
    if (!checked.ok) return checked;
    const entry = compose(input, checked.amount, makeId('acc'), Date.now());
    entries.value = [...entries.value, entry];
    persist();
    return { ok: true, entry };
}

/**
 * 改一条。只让改「这笔账本身」：日期 / 角色 / 分类 / 方向 / 币种 / 渠道 / 金额 / 备注。
 *
 * 改的时候 `createdAt` 保留原值——它是「这条是哪一刻记下的」，不是「最后一次改动」。
 * 换掉它会让同一天的两条记录在「新的在上」里重新排队，用户会以为记录跳了位置。
 */
export function updateEntry(id: string, input: EntryInput): AccountWrite {
    if (loadError.value) return { ok: false, error: '账号账本读取失败，先修好再来改' };
    const before = entries.value.find((one) => one.id === id);
    if (!before) return { ok: false, error: '这条记录已经不在了' };
    const checked = check(input);
    if (!checked.ok) return checked;
    const entry = compose(input, checked.amount, id, before.createdAt);
    /* 换整个数组而不是改对象字段：`entries` 是 `ref`，改内部字段不触发依赖，
     * 界面会「保存了但没动」。 */
    entries.value = entries.value.map((one) => (one.id === id ? entry : one));
    persist();
    return { ok: true, entry };
}

/** 删一条。撤回是**真删**——账本里没有「隐藏」。 */
export function removeEntry(id: string): void {
    if (loadError.value) return;
    const before = entries.value.length;
    entries.value = entries.value.filter((one) => one.id !== id);
    if (entries.value.length !== before) persist();
}

/* ---------- 给页面 ---------- */

export function useAccounts() {
    return {
        entries,
        loadError,
        writeError,
        addEntry,
        updateEntry,
        removeEntry,
    };
}
