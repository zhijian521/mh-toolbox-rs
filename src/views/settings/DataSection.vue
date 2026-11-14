<script setup lang="ts">
import { onMounted, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SlotButton from '../../components/SlotButton.vue';
import BackupHistory from './BackupHistory.vue';
import { askConfirm } from '../../composables/use-confirm';
import {
    dataClear,
    dataExport,
    dataImport,
    legacyDataRead,
    legacyDataImport,
    restoreBackup,
    type BackupEntry,
    type DataOutcome,
} from '../../services/data-files';
/* 单件物品的价格点位上限，**不在这里再写一个 200**：`prices.ts` 是它的真源，
 * `src-tauri/src/backup.rs` 里那份是镜像（那边不裁剪，只用它数「会丢多少」）。
 * 设置页反过来引一个页面模块看着别扭，但它是纯数据契约、不碰 vue 也不碰 DOM；
 * 在这里抄一个数反而会和真源悄悄分家——文案里的数字没人记得改。 */
import { POINT_LIMIT } from '../prices/prices';

/**
 * 数据：把整本账搬出去、搬回来，或者清空。
 *
 * 这张卡单独一张、落在 `.stack-pair` 的第二行左列（**不通栏**：试过，实拍否掉了，
 * 见 `SettingsView.vue` 的注释与 `docs/RECORD.md` 第 87 批）。
 *
 * ---- 为什么分两段 ----
 * **账本那一行放两枚**：导出与导入是同一件事的两头（拿走一份 / 换回一份），并排着读是
 * 「进出」。分成两行时，中间那句说明会被读成两条互不相干的规则，而它们其实共享一句
 * 「导入是整份替换」。
 *
 * **清除另起一段**，上面隔一条通栏细线加 14px 留白。它不是第三种账本操作，是**不一样的
 * 后果**：前两个有备份可退（导出本身就是一份备份，导入动手前还会自动备份一份），
 * 它没有。分段靠线与留白，红留给按钮本身。
 *
 * ---- 为什么二次确认都用弹窗 ----
 * 导入与清除都是从用户手里拿走数据、且撤不回来，所以两件都要再问一次。弹窗的好处
 * 不是多一道手续，而是**问句能带上后果**（「整份替换」「不会自动备份，想留就先去导出」）；
 * 早先清除用的是「按钮就地改名 + 灌朱」，那只能换三个字，说不清后果，还得靠 4 秒自动
 * 退回防止一枚朱红按钮常驻。
 *
 * 两个窗都不在这里渲染：`await askConfirm({...})` 走全站唯一的那一枚
 * （`composables/use-confirm.ts` + `App.vue` 里的 `ConfirmHost`），问句与后果直接写在
 * 动作函数的开头。这样「问完要做什么」和「问的是什么」在同一个屏幕里，中间不隔一层
 * `pending` 状态。
 *
 * ---- 为什么三枚都是槽按钮，且清除取 `seal` ----
 * 这一页原先用 `PressButton`（凸块）。换成 `SlotButton`（凹槽）之后，「悬停落一枚朱印」
 * 本身就是「按下去会发生事」的提示，两枚账本按钮停在空槽上也足够安静。
 *
 * 清除取 `seal`（印面常驻）：两版试完，用户定稿「删除使用 seal 变体」。
 * `seal` 的文档写着「一屏只该有一枚主操作」——这里守住了：三枚里只有它常驻印面，
 * 因为只有它按下去收不回来。把红只落在字上（试过一版 `danger`）在 13px 楷体里读起来
 * 是「一个偏红的普通按钮」，不如下半格朱印来得直接。
 *
 * 只动全部账本数据。主题与字号存在 `localStorage`，换台机器本来就该不一样，
 * 混进备份里会让「账本」读起来像应用设置。这一句也写在清除那条 hint 上。
 */
const busy = ref(false);
const backupsOpen = ref(false);
async function restore(entry: BackupEntry) {
    if (busy.value) return;
    const ok = await askConfirm({
        danger: true,
        title: '恢复这份备份并替换当前账本？',
        note: `${new Date(entry.createdAt).toLocaleString('zh-CN')} 的全部账本数据将覆盖当前内容，恢复前会自动另存当前账本。`,
        confirmText: '恢复',
    });
    if (!ok) return;
    const outcome = await run(() => restoreBackup(entry.name));
    if (outcome.status === 'ok') reloadWithNotice();
}
const message = ref('');
/** 导入成功但有代价时多出来的那一句（点位被截断）。没有代价时是空串。 */
const warning = ref('');
const messageKind = ref<'error' | 'positive'>('positive');

/**
 * 「这批备份里有多少条会被裁掉」那句话；`truncation` 缺席（导出 / 清除）或一条都不丢时返回空串。
 *
 * 说**后果**而不是只报数：用户要知道的是「下次一存会少东西」，不是「有 100 条超限」。
 * 措辞与实际的时序对齐——Rust 侧如实搬进来（所以刚导入时看得到全部），
 * 前端保存时才按 `POINT_LIMIT` 裁（`prices.ts` 的 `normalizePriceItem`）。
 */
function truncationNote(truncation: { points: number; items: number } | undefined): string {
    if (!truncation || truncation.points <= 0) return '';
    const { points, items } = truncation;
    return (
        `其中 ${points} 条价格超出单件 ${POINT_LIMIT} 条的上限（涉及 ${items} 件物品）：` +
        `导入后会按每件最新的 ${POINT_LIMIT} 条保留，更早的那 ${points} 条会在下次保存时丢失。`
    );
}

/**
 * 三条操作的共同外壳：置忙 → 跑 → 收起忙 → 把三种结局翻成界面上的一句话。
 *
 * `busy` 是**一个** ref 而不是每个按钮一个：这三件事共用同一份数据。导入正在整份替换
 * 的时候点一下「导出」，导出来的是一份半新半旧的账，而那份账会被用户当成备份收着。
 * 所以忙是整卡的忙，按钮一起停。
 */
async function run(action: () => Promise<DataOutcome>): Promise<DataOutcome> {
    busy.value = true;
    try {
        const outcome = await action();
        if (outcome.status === 'ok') {
            messageKind.value = 'positive';
            message.value = outcome.detail;
            /* 两句话分开放：一句是「办成了」，一句是「不过有东西会丢」。拼成一串就只能
             * 整段用一种颜色，而这两件事不该看起来一样重。 */
            warning.value = [outcome.warning, truncationNote(outcome.truncation)]
                .filter(Boolean)
                .join(' ');
        } else if (outcome.status === 'failed') {
            messageKind.value = 'error';
            message.value = outcome.error;
            warning.value = '';
        } else {
            /* 取消：**清掉**上一句，不留着。上一句可能是上一次的「已导出到 C:\…」，
             * 留着会让刚取消了这一次的人以为那一次又发生了一遍。 */
            message.value = '';
            warning.value = '';
        }
        return outcome;
    } finally {
        /* 用 `finally` 而不是每条分支里各写一次：`action` 抛错（`invoke` 之外的原因，
         * 比如 IPC 通道断了）时按钮也必须能再按下去，否则这张卡就永久停在禁用态。 */
        busy.value = false;
    }
}

/** 导出没有二次确认：它不改变现有数据，选完位置还能在系统对话框里取消。 */
async function exportLedger() {
    await run(dataExport);
}

/** 导入先问：这一步整体顶掉现有账本，问句里必须写着「替换」。 */
async function askImport() {
    const ok = await askConfirm({
        danger: true,
        title: '用选中的备份替换现在的账本？',
        note: '全部账本数据（角色、物价、收益流水、速记单价、账号记录与目标）会被整份替换。动手前会自动备份一份，回执里写着它的位置。',
        confirmText: '替换',
    });
    if (!ok) return;
    const outcome = await run(dataImport);
    if (outcome.status === 'ok') reloadWithNotice();
}

async function importLegacy() {
    const outcome = await run(async () => {
        const source = await legacyDataRead();
        if (source.status !== 'ok') return source;
        try {
            const { convertLegacyData } = await import('../../import/legacy');
            const { backup, warnings } = convertLegacyData(source.raw);
            const counts = `${backup.characters.length} 个角色、${backup.prices.length} 件物价、${backup.income.length} 笔收益、${backup.accounts.length} 笔账号记录、${backup.online.length} 条上线记录、${backup.goals.length} 个目标`;
            const ok = await askConfirm({
                danger: true,
                title: '导入旧版并替换当前账本？',
                note: `可转换：${counts}。${warnings.join(' ')} 替换前自动备份当前账本，并完整留存旧版原件。`,
                confirmText: '导入并替换',
            });
            if (!ok) return { status: 'canceled' };
            const result = await legacyDataImport(source.raw, JSON.stringify(backup));
            return result.status === 'ok' ? { ...result, warning: warnings.join(' ') } : result;
        } catch (error) {
            return {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });
    if (outcome.status === 'ok') reloadWithNotice();
}

/**
 * 清除：确认之后才跑。
 *
 * 确认窗关掉、按钮置灰，界面在说同一件事：这一下已经按下去了。
 */
async function askClear() {
    const ok = await askConfirm({
        danger: true,
        title: '清空全部账本数据？',
        note: '角色、物价、收益流水、速记单价、上线记录与点卡口径、账号记录与目标都会清空。清除前不会自动备份，想留一份就先「导出」。主题与字号不受影响。',
        confirmText: '清除',
    });
    if (!ok) return;
    const outcome = await run(dataClear);
    if (outcome.status === 'ok') reloadWithNotice();
}

/**
 * 导入与清除成功后**必须重载页面**。
 *
 * `roster` / `prices-store` 都是模块级单例，且只在启动时读一次库；库整份换掉了、
 * 内存里还是旧数组，名册页会列出已经不存在的角色，物价图表也照旧画上一版。
 * 这两处没有任何「重新加载」的公共入口，重载页面是唯一不惊动它们内部状态的改法。
 */
function reloadWithNotice() {
    try {
        sessionStorage.setItem(NOTICE_KEY, message.value);
        /* 截断那句话也必须跟着过河。**不能走 `notify`**：浮层三秒就收，而这个页面下一行
         * 就 `location.reload()`，DOM 整个换掉——刚弹出来的提示会跟着没。
         * 何况这条要停着读完（还得对上备份路径），本来就不属于「扫一眼」那一档。 */
        sessionStorage.setItem(WARNING_KEY, warning.value);
    } catch {
        /* 存储被禁（极端隐私设置）时放弃这次交接：账已经换好了，少一句提示不算失败。 */
    }
    location.reload();
}

/** 提示在重载前后的交接键。带前缀是因为 `sessionStorage` 是整个 origin 共用的。 */
const NOTICE_KEY = 'mh-data-notice';
/** 同一轮交接里那句「有数据会被裁掉」，与 `NOTICE_KEY` 成对出现、成对取走。 */
const WARNING_KEY = 'mh-data-warning';

/**
 * 取出上一次重载前留下的那两句，**取到就删**——于是它们只活一轮，
 * 不会在下次打开设置页时冒充「刚刚发生过」。
 *
 * 单独一个函数而不是写进 `onMounted`：`try` 里赋值、`catch` 里返回的写法
 * 会让变量「可能没被赋值」（eslint 的 `no-useless-assignment` 和 TS 的确定赋值
 * 两头都不满意），而这里真正想说的是「读不到就是空字符串」，那就直说。
 */
function takeNotice(): { text: string; warning: string } {
    try {
        const text = sessionStorage.getItem(NOTICE_KEY) ?? '';
        const savedWarning = sessionStorage.getItem(WARNING_KEY) ?? '';
        sessionStorage.removeItem(NOTICE_KEY);
        sessionStorage.removeItem(WARNING_KEY);
        return { text, warning: savedWarning };
    } catch {
        /* 存储被禁时既没有交接也没有异常要报：这张卡照常可用，只是少一句提示。 */
        return { text: '', warning: '' };
    }
}

onMounted(() => {
    const saved = takeNotice();
    if (!saved.text) return;
    messageKind.value = 'positive';
    message.value = saved.text;
    warning.value = saved.warning;
});
</script>

<template>
    <LedgerSection title="数据" hint="导入 · 导出 · 清除">
        <div class="form-row">
            <span class="field-label">账本</span>
            <SlotButton
                icon="download"
                label="导出账本到文件"
                text="导出"
                :disabled="busy"
                @click="exportLedger"
            />
            <SlotButton
                icon="upload"
                label="从备份文件导入账本"
                text="导入"
                :disabled="busy"
                @click="askImport"
            />
            <SlotButton
                icon="upload"
                label="导入旧版 Electron 完整备份"
                text="导入旧版"
                :disabled="busy"
                @click="importLegacy"
            />
            <span class="hint">导入将替换全部账本</span>
        </div>

        <div class="backup-entry form-row">
            <span class="field-label">备份</span>
            <SlotButton
                icon="history"
                text="恢复"
                label="查看本地备份与恢复"
                :disabled="busy"
                @click="backupsOpen = true"
            />
            <span class="hint">自动留存最近 14 份日常备份</span>
        </div>

        <div class="danger-zone">
            <div class="form-row">
                <span class="field-label">清除</span>
                <SlotButton
                    danger
                    seal
                    icon="trash"
                    label="清空全部账本数据"
                    text="清除"
                    :disabled="busy"
                    @click="askClear"
                />
                <span class="hint">不可撤销；清除前不会自动备份</span>
            </div>
        </div>

        <!-- 回执（含自动备份的路径）是**一次出现**的一句话：读屏只在「区域已存在、
             内容变了」时才播报，`v-if` 直接挂在这一段上会让整条被略过。
             所以常驻一个空的 `role="status"` 容器，句子从里面进出——与 `NotifyHost`
             那层 `aria-live` 同一个做法。空容器高度为 0，没有留白。 -->
        <div role="status">
            <p v-if="message" class="note" :class="messageKind">{{ message }}</p>
            <!-- 截断提示与回执同一个播报区域，排在它下面：先「办成了」，再「不过……」。
                 用赭（`--ochre`）而不是朱红——导入本身是成功的，红字会被读成「导入失败」。 -->
            <p v-if="warning" class="note warning">{{ warning }}</p>
        </div>
    </LedgerSection>
    <BackupHistory
        v-if="backupsOpen"
        :busy="busy"
        :restore-error="messageKind === 'error' ? message : ''"
        @close="backupsOpen = false"
        @restore="restore"
    />
</template>

<style scoped>
.backup-entry {
    margin-top: 12px;
}
/* 行本身是全局 `.form-row`（`base.css`：flex + gap 10），纵向节奏留给这一页——
 * 与 `AppearanceSection.vue` 同一处写法、同一个 12px：两张卡并排时行距不一致，
 * 翻过去会读成「另一套表格」。
 *
 * 这一页只有两段而不是三行，于是相邻选择器落不到（`.form-row + .form-row` 中间隔着
 * `.danger-zone` 这层）。段间距写在下面那条上，不再留一个只对第一段生效的规则。 */

/* 清除那一段：一条通栏细线 + 上下各 14px。
 *
 * 用 `--rule-2`（细线色）而不是 `--bevel-lo`：后者是棱的暗面，横着铺满整栏会读成
 * 「这里压了一道槽」，而这条线要说的只是「下面的事不一样」。14 比行距 12 多 2px，
 * 是「隔开」与「同一张卡里两段」的分界；再大就会让人以为这是两张卡拼起来的。 */
.danger-zone {
    margin-top: 14px;
    padding-top: 14px;
    border-top: var(--w-hair) solid var(--rule-2);
}

/* 「有数据会被裁掉」那句：只换色，档位与 `.note` 一致（排版来自 `blocks.css`）。
 *
 * 取赭（`--ochre`）而不是朱（`--cinnabar`）：导入是**成功**的，朱红会被读成「导入失败」。
 * 写成复合选择器与 `base.css` 里 `.note.error` / `.note.positive` 同一手法——
 * 独立类与 `.note` 同特异性，谁赢取决于样式表加载顺序。 */
.note.warning {
    color: var(--warning);
}
</style>
