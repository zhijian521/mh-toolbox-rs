<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';
import { useAppInfo } from '../../composables/use-app-info';
import { useFontFamily } from '../../composables/use-font-family';

/**
 * 关于：版本与运行环境。
 *
 * 信息经 `useAppInfo` 取——和标题栏、左栏底部是同一份，全应用只发一次 IPC。
 * 浏览器里预览时它必然是 null，所以这里标「未连到 Rust 侧」而不是留空：
 * 这块顺带是进程序列化通道是否打通的指示灯。
 *
 * 许可另有一张卡（`LicenseSection.vue`，2026-11-06 拆出去）：这里是「装了什么东西」，
 * 那里是「能拿它做什么」。两件事的读者与查看频率都不同，挤在一张卡里会让后者
 * 读起来像环境表的附录。
 */
const { info } = useAppInfo();
const { selectedFont } = useFontFamily();
</script>

<template>
    <LedgerSection title="关于" hint="版本 · 运行环境">
        <dl class="about">
            <dt>产品名</dt>
            <dd>{{ info?.productName ?? '梦幻养老助手' }}（开发中）</dd>
            <dt>版本</dt>
            <dd>
                <template v-if="info">{{ info.version }}</template>
                <template v-else><span class="warn">未连到 Rust 侧</span>（浏览器预览）</template>
            </dd>
            <dt>标识</dt>
            <dd>
                <code>{{ info?.identifier ?? 'com.zhijian.mhtoolbox.rs' }}</code>
            </dd>
            <dt>数据目录</dt>
            <dd>
                <code>{{ info?.dataDir ?? '%APPDATA%\\mh-tool-rs' }}</code>
            </dd>
            <!-- 目录与文件名分成两行：问「我的账在哪」的人要的是那个文件，
                 而「备份哪几个文件」「换个盘怎么搬」都得先知道它叫什么。 -->
            <dt>数据库</dt>
            <dd><code>mh-toolbox.db</code>（SQLite · WAL）</dd>
            <dt>运行环境</dt>
            <dd>{{ info?.webview ?? '系统 WebView2（Tauri 2）' }}</dd>
            <dt>字体</dt>
            <dd>{{ selectedFont.label }}（SIL OFL 1.1，常用字子集）</dd>
        </dl>
    </LedgerSection>
</template>

<style scoped>
.about {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 6px 12px;
    align-items: baseline;
}
.about dt {
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}
.about dd {
    color: var(--ink-2);
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}
.about code {
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0;
}
.warn {
    color: var(--danger);
}
</style>
