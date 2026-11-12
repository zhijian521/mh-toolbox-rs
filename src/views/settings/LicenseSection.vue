<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';
import PressButton from '../../components/PressButton.vue';
import { openExternal } from '../../services/desktop';

/**
 * 许可：这个软件能拿它做什么、不能做什么。
 *
 * ---- 为什么单独一张卡，而不是挂在「关于」下面 ----
 * 2026-11-06 从关于卡里拆出来的。两件事的读者不同：「关于」是查这台机器上装的是什么
 * （版本、标识、数据目录），「许可」是问「我能拿它商用吗」。前者一年看一次，
 * 后者是第一次用就会问的问题，挤在环境表下面等于把它埋进附录。
 * 拆成两张之后设置页第二行正好排满（关于 | 许可），也不再需要那条通栏分隔线。
 *
 * ---- 口径 ----
 * 照旧版设置页那张卡（`mh-tool` 的 `SettingsPage.vue`），只是把话说短：
 * 一句总述 + 一条限制 + 「可以 / 不可以」两行判词 + 两个链接。
 * 判词是这张卡唯一需要被记住的内容，其余都是佐证。
 */
const REPO_URL = 'https://github.com/zhijian521/mh-toolbox-rs';
const LICENSE_URL = 'https://polyformproject.org/licenses/noncommercial/1.0.0';
</script>

<template>
    <LedgerSection title="许可" hint="PolyForm Noncommercial 1.0.0">
        <p class="lead">本软件免费使用，源码公开。</p>

        <!-- 这张卡唯一要人记住的一句话，给一道朱线压住。
             带 `.note` 类不是为了字号，是为了让里面那个 `<b>` 落到全局 `.note b` 上
             ——它把强调改成「提一档墨、`font-weight: 400`」。文楷没有真粗体，
             脱离那条规则时浏览器会合成描边，亮色下肉眼可见「糊成一团」；
             第一版就是漏了这个类，截图里那八个字比周围明显脏一档。 -->
        <p class="note license-notice">
            采用 PolyForm Noncommercial 1.0.0 许可；<b>任何以营利为目的的使用均不在授权范围内</b>。
        </p>

        <dl class="terms">
            <div class="allow">
                <dt>可以</dt>
                <dd>运行、修改、再发布</dd>
            </div>
            <div class="deny">
                <dt>不可以</dt>
                <dd>商业用途</dd>
            </div>
        </dl>

        <div class="license-links">
            <PressButton
                icon="github"
                text="项目源码"
                label="在浏览器里打开项目仓库"
                @click="openExternal(REPO_URL)"
            />
            <PressButton
                icon="doc"
                text="许可证全文"
                label="在浏览器里打开许可证全文"
                @click="openExternal(LICENSE_URL)"
            />
        </div>

        <!-- 末一句是「这不是官方的东西」。它不是许可条款，是**免责的边界**：
             图标与名称都来自游戏客户端，作者对它们没有任何权利可以授予。 -->
        <p class="note">非官方工具，与游戏发行商无关；游戏图标与名称版权归原权利人。</p>
    </LedgerSection>
</template>

<style scoped>
/* 导语比 `.note` 高一档、深一档：它是这张卡的「一句话定义」，
   读者扫一眼就知道下面那些判词在说什么。不写成 `.note` 是因为 `.note` 的档位
   是「要读一段话」，而这一句是「先看这里」。 */
.lead {
    margin: 0 0 2px;
    color: var(--ink-2);
    font-size: var(--fs-base);
}

/* 警告条：朱色左竖线 + 极淡的同色底。
 *
 * 字号、行高、颜色都不在这里写——`.note` 已经给了，这里只补「一条朱线围出来的框」。
 * 复合选择器 `.note.license-notice` 与 `base.css` 的 `.note.error` 同一手法：
 * 单独一个类与 `.note` 同特异性，谁赢取决于样式表加载顺序。
 *
 * 底色比例按主题分（`light-dark`）：亮纸叠 5% 就有一层暖，暗纸（`--paper` #1c1912）
 * 叠同样 5% 几乎等于没有——深底上要靠更浓一点才读得出「这一块被圈出来了」。
 * 不取 `--warn-bg`（赭）：那句话说的是「不许」，不是「注意一下」，
 * 用赭会与导入成功、捉鬼告警那一类提示同一个颜色。 */
.note.license-notice {
    margin: 8px 0 11px;
    padding: 8px 11px;
    border-left: 2px solid var(--accent);
    border-radius: var(--r-1);
    background: color-mix(in srgb, var(--accent) light-dark(5%, 11%), transparent);
}

/* 两行判词。左列 38 = 「不可以」三个字在 `--fs-xs` 下的宽度 + 一点余量，
   两行正文因此能对齐成一条竖线，读起来像一张清单而不是两句话。
   **38 必须乘 `--fs-scale`**：`--fs-xs` 是 `calc(11px × 系数)`，字号放到 1.1 时
   三个字已是 36.3 + 字距 ≈ 38——写死 38 会把「不可以」挤成两行，而右边正文还空着
   大半行。项目里凡是「跟一个字宽相关」的固定值都乘这个系数。
   字色用苔（`--moss`，全站「正收益」那一个）与朱：这是全站唯一一对「能 / 不能」，
   不复用印章的朱面——那层朱面是「已达成」的意思，用在这里会读成两个状态灯。 */
.terms {
    display: grid;
    gap: 5px;
    margin: 0 0 14px;
}
.terms div {
    display: grid;
    grid-template-columns: calc(38px * var(--fs-scale)) minmax(0, 1fr);
    gap: 10px;
}
.terms dt {
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    line-height: 1.72;
    letter-spacing: 0.04em;
}
.terms dd {
    color: var(--ink-2);
    font-size: var(--fs-sm);
    line-height: 1.72;
}
.terms .allow dt {
    color: var(--success);
}
.terms .deny dt {
    color: var(--danger);
}

.license-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
</style>
