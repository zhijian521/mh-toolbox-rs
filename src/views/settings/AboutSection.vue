<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';
import { useAppInfo } from '../../composables/use-app-info';

/**
 * 关于：版本与运行环境。
 *
 * 信息经 `useAppInfo` 取——和标题栏、左栏底部是同一份，全应用只发一次 IPC。
 * 浏览器里预览时它必然是 null，所以这里标「未连到 Rust 侧」而不是留空：
 * 这块顺带是进程序列化通道是否打通的指示灯。
 */
const { info } = useAppInfo();
</script>

<template>
    <LedgerSection title="关于" hint="版本与运行环境">
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
                <code>{{ info?.dataDir ?? '%APPDATA%\\mh-tool-v2' }}</code>
            </dd>
            <dt>运行环境</dt>
            <dd>{{ info?.webview ?? '系统 WebView2（Tauri 2）' }}</dd>
            <dt>字体</dt>
            <dd>霞鹜文楷 Screen（SIL OFL 1.1，GB2312 子集）</dd>
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
    color: var(--cinnabar);
}
</style>
