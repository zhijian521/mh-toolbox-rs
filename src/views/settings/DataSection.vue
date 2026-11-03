<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import PressButton from '../../components/PressButton.vue';
import { dataClear, dataExport, dataImport, type DataOutcome } from '../../services/desktop';

/**
 * 数据：把整本账搬出去、搬回来，或者清空。
 *
 * 这一页原先的读者只有用户，卡片也只放「用户会用的东西」——这三件事正是用户会用、
 * 而且**只在出事前后才会用**的那一类：平时一眼都不看，需要时找不到就等于没有。
 * 所以它单独一张卡，落在 `.stack-pair` 的第二行左列（**不通栏**：试过，实拍否掉了，
 * 见 `SettingsView.vue` 的注释与 `docs/RECORD.md` 第 87 批），不挤进「外观」里。
 *
 * 三件事的语义在界面上各有一次说清（hint 那三句），因为它们**不**可互换：
 * 导出是拿走一份副本、导入是替换、清除是清空。用户在这张卡上犯错的代价是数据，
 * 卡片本身没有任何撤销入口——所以文案必须自己交代后果。
 *
 * 只动账本（角色 + 物价）。主题与字号存在 `localStorage`，换台机器本来就该不一样，
 * 混进备份里会让「账本」读起来像应用设置。这一句也写在清除那条 hint 上。
 */
const busy = ref(false);
const message = ref('');
const messageKind = ref<'error' | 'positive'>('positive');

/**
 * 三条操作的共同外壳：置忙 → 跑 → 收起忙 → 把三种结局翻成界面上的一句话。
 *
 * `busy` 是**一个** ref 而不是每个按钮一个：这三件事共用同一份数据。导入正在整份替换
 * 的时候点一下「导出」，导出来的是一份半新半旧的账，而那份账会被用户当成备份收着。
 * 所以忙是整卡的忙，按钮和那枚确认一起停。
 */
async function run(action: () => Promise<DataOutcome>): Promise<DataOutcome> {
    busy.value = true;
    try {
        const outcome = await action();
        if (outcome.status === 'ok') {
            messageKind.value = 'positive';
            message.value = outcome.detail;
        } else if (outcome.status === 'failed') {
            messageKind.value = 'error';
            message.value = outcome.error;
        } else {
            /* 取消：**清掉**上一句，不留着。上一句可能是上一次的「已导出到 C:\…」，
             * 留着会让刚取消了这一次的人以为那一次又发生了一遍。 */
            message.value = '';
        }
        return outcome;
    } finally {
        /* 用 `finally` 而不是每条分支里各写一次：`action` 抛错（`invoke` 之外的原因，
         * 比如 IPC 通道断了）时按钮也必须能再按下去，否则这张卡就永久停在禁用态。 */
        busy.value = false;
    }
}

async function exportLedger() {
    await run(dataExport);
}

/**
 * 导入与清除成功后**必须重载页面**。
 *
 * `roster` / `prices-store` 都是模块级单例，且只在启动时读一次库；库整份换掉了、
 * 内存里还是旧数组，名册页会列出已经不存在的角色，物价图表也照旧画上一版。
 * 这两处没有任何「重新加载」的公共入口，重载页面是唯一不惊动它们内部状态的改法。
 */
async function importLedger() {
    const outcome = await run(dataImport);
    if (outcome.status === 'ok') reloadWithNotice();
}

/**
 * 带着刚写下的那句话重载。
 *
 * 不直接 `location.reload()`：刷新会把提示一起抹掉，而导入那句里带着**自动备份的路径**
 * ——用户很可能正是为了记下它才看上一眼。存 `sessionStorage`（刷新不清、关窗口就没），
 * 重载后由 `onMounted` 取出来显示、随即删除，于是这句话只活一轮，
 * 不会在下次打开设置页时冒充「刚刚发生过」。
 */
function reloadWithNotice() {
    try {
        sessionStorage.setItem(NOTICE_KEY, message.value);
    } catch {
        /* 存储被禁（极端隐私设置）时放弃这次交接：账已经换好了，少一句提示不算失败。 */
    }
    location.reload();
}

/** 提示在重载前后的交接键。带前缀是因为 `sessionStorage` 是整个 origin 共用的。 */
const NOTICE_KEY = 'mh-data-notice';

/**
 * 取出上一次重载前留下的那句话，**取到就删**——于是它只活一轮，
 * 不会在下次打开设置页时冒充「刚刚发生过」。
 *
 * 单独一个函数而不是写进 `onMounted`：`try` 里赋值、`catch` 里返回的写法
 * 会让变量「可能没被赋值」（eslint 的 `no-useless-assignment` 和 TS 的确定赋值
 * 两头都不满意），而这里真正想说的是「读不到就是空字符串」，那就直说。
 */
function takeNotice(): string {
    try {
        const saved = sessionStorage.getItem(NOTICE_KEY);
        sessionStorage.removeItem(NOTICE_KEY);
        return saved ?? '';
    } catch {
        /* 存储被禁时既没有交接也没有异常要报：这张卡照常可用，只是少一句提示。 */
        return '';
    }
}

onMounted(() => {
    const saved = takeNotice();
    if (!saved) return;
    messageKind.value = 'positive';
    message.value = saved;
});

/* ---------- 清除：就地确认，与角色卡同一套 ----------
 * 清空没有回收站（备份只在导入时自动做），所以「点一次就清」的代价太大。
 * 这里不弹确认框：页面上没有对话框这种器件，为一处清空造一个，等于把系统弹窗的观感
 * 搬进账簿。做法是把那枚按钮**就地改成「确认清除」并灌朱**——第二次点击的目标没变，
 * 误触变不成误清。
 *
 * 4 秒没有下文就退回原样：一张设置卡上停着一枚朱红的「确认清除」，别人走过来会以为
 * 这一格本来就是这个样子，然后顺手点下去——那一下清掉的是整本账。
 */
const pendingClear = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | undefined;

function askClear() {
    pendingClear.value = true;
    resetTimer = setTimeout(() => (pendingClear.value = false), 4000);
}

async function confirmClear() {
    clearTimeout(resetTimer);
    pendingClear.value = false;
    const outcome = await run(dataClear);
    if (outcome.status === 'ok') reloadWithNotice();
}

onBeforeUnmount(() => clearTimeout(resetTimer));
</script>

<template>
    <LedgerSection title="数据" hint="导入 · 导出 · 清除">
        <div class="form-row">
            <span class="field-label">导出</span>
            <PressButton label="导出账本" text="导出账本" :disabled="busy" @click="exportLedger" />
            <span class="hint">角色与物价写成一份 JSON，位置自己选</span>
        </div>
        <div class="form-row">
            <span class="field-label">导入</span>
            <PressButton label="导入账本" text="导入账本" :disabled="busy" @click="importLedger" />
            <span class="hint"><b>整体替换</b>现有数据；动手前会自动备份一份</span>
        </div>
        <div class="form-row">
            <span class="field-label">清除</span>
            <PressButton
                :label="pendingClear ? '确认清除' : '清除数据'"
                :text="pendingClear ? '确认清除' : '清除数据'"
                :seal="pendingClear"
                :disabled="busy"
                @click="pendingClear ? confirmClear() : askClear()"
            />
            <span class="hint">清空角色与物价，不可撤销。主题字号不受影响</span>
        </div>
        <p v-if="message" class="note" :class="messageKind">{{ message }}</p>
    </LedgerSection>
</template>

<style scoped>
/* 行本身是全局 `.form-row`（`base.css`：flex + gap 10），纵向节奏留给这一页——
 * 与 `AppearanceSection.vue` 同一处写法、同一个 12px：两张卡并排时行距不一致，
 * 翻过去会读成「另一套表格」。 */
.form-row + .form-row {
    margin-top: 12px;
}
/* 提示里那半句「整体替换」的强调**不在这里写**：它落在 `.hint` 里，而 `.note b`
 * 只管 `.note` 底下，早先这里以为能蹭到那条规则——蹭不到，`<b>` 会落回浏览器默认的
 * 伪粗体（文楷没有真粗体，合成描边会把字糊掉）。修在 `blocks.css` 的 `.hint b`：
 * `.hint` 是全局词汇，它的强调该是全局的一条口径，不该由某张卡自己定义。 */
</style>
