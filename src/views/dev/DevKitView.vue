<script setup lang="ts">
import PageHeader from '../../components/PageHeader.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import AtomsSection from './AtomsSection.vue';
import IconsSection from './IconsSection.vue';
import PaletteSection from './PaletteSection.vue';
import TypeScaleSection from './TypeScaleSection.vue';

/**
 * 开发帮助：做界面时才要查的东西——组件、色板、字号阶梯、图标。
 *
 * **不在左栏。** 这四张卡原先长在设置页里，可用户去设置页只为一件事：换纸、换字号。
 * 组件演示、令牌清单、图标目录是给写界面的人查的，混在同一页里，设置页读起来
 * 就像一份设计系统文档——功能只有两个，篇幅却有六块。
 *
 * 入口是**隐藏**的：三连击左栏顶部的标（`AppRail` 的牌记），或者地址栏直接 `#/dev`。
 * 不复用左栏入口，是因为那一条竖槽是这个应用的目录：八个入口都是用户真会点的页面。
 * 往里加第九个「开发者」，等于每时每刻都在提醒用户「这里还有一堆你不该动的东西」。
 *
 * 这一页本身也只做一件事：按顺序把五张卡排起来（用法说明 + 四张演示卡）。加一张卡就是加一行——
 * 与 `SettingsView` 同一个写法，因为它们本来是同一种页面（一叠 `.frame` 卡）。
 */
</script>

<template>
    <PageHeader title="开发帮助" desc="组件 · 令牌 · 图标 · 线条">
        <span class="hint">设计样张见 design/income.html</span>
    </PageHeader>

    <div class="page-content">
        <div class="stack">
            <LedgerSection title="入口与约定" hint="左栏里没有这一页">
                <p class="note">
                    <b>怎么进来</b>：三连击左栏顶部的标（那枚朱印「梦」）。浏览器预览时地址栏补
                    <code>#/dev</code> 也行——桌面窗口里没有地址栏，所以三连击是唯一入口。
                    导航槽里不放这一项：那八格是用户真会点的页面，不该混进开发者清单。
                </p>
                <p class="note">
                    <b>边界</b>：设置页只留「外观」与「关于」两件用户要动的东西；
                    组件演示、令牌清单、图标目录全在这一页。给用户看的和给做界面的人看的，
                    不放在同一屏里互相解释。
                </p>
                <p class="note">
                    <b>两条机制</b>：主题只改根元素上的 <code>color-scheme</code>，
                    颜色令牌不需要第二份，全部走 <code>light-dark()</code>；字号只改
                    <code>--fs-scale</code> 一个变量（0.92 / 1 / 1.1），八档字号都是
                    <code>calc(Npx * var(--fs-scale))</code>。
                </p>
            </LedgerSection>

            <AtomsSection />
            <PaletteSection />
            <TypeScaleSection />
            <IconsSection />
        </div>
    </div>
</template>
