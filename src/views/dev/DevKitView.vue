<script setup lang="ts">
import PageShell from '../../components/PageShell.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import { useDevMode } from '../../composables/use-dev-mode';
import AssistSlipSection from './AssistSlipSection.vue';
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
 * 这一页本身也只做一件事：按顺序把卡片排起来（说明 + 开关 + 演示卡）。加一张卡就是加一行——
 * 与 `SettingsView` 同一个写法，因为它们本来是同一种页面（一叠 `.frame` 卡）。
 *
 * 演示卡**按「原子 → 组合」的顺序**排：`AtomsSection` 收全局小件，`AssistSlipSection`
 * 收由它们拼成、带业务语义的行；色板、字号、图标各一张。新件先问清楚「它是原子、
 * 组合，还是资源清单」——不然半年后没人说得清哪个该去哪儿。
 *
 * 卡片的并排与说明字数都按「够用就好」处理：一张卡回答一个问题，文字只留改的时候会踩的。
 */

const { devMode } = useDevMode();
</script>

<template>
    <PageShell title="开发帮助" desc="组件 · 令牌 · 图标 · 线条">
        <div class="stack">
            <!-- 两张说明卡都只有几行，并一排；竖排下来右边全是空纸。 -->
            <div class="stack-pair">
                <LedgerSection title="入口与约定" hint="左栏里没有这一页">
                    <p class="note">
                        <b>怎么进来</b>：三连击左栏顶部的标（朱印「梦」）；浏览器预览可补
                        <code>#/dev</code>。导航槽里不放这一项。
                    </p>
                    <p class="note">
                        <b>两条机制</b>：主题只改根元素的 <code>color-scheme</code>，颜色全走
                        <code>light-dark()</code>；字号只改 <code>--fs-scale</code>（0.92 / 1 /
                        1.1）。
                    </p>
                </LedgerSection>

                <LedgerSection title="开发者模式" hint="测试入口的总开关">
                    <div class="form-row">
                        <span class="field-label">测试工具</span>
                        <CostSwitch v-model="devMode" off-label="关" on-label="开" />
                        <span class="meta">{{
                            devMode
                                ? '捉鬼助手的「测试文字」已显示'
                                : '捉鬼助手的「测试文字」已隐藏'
                        }}</span>
                    </div>
                    <p class="note">
                        关着时那块「测试文字」<b>不生成</b>（不是隐藏）——它是没有游戏时的替身，
                        不该被当成功能。以后的测试工具都挂这一个开关，不再各配一个。
                    </p>
                </LedgerSection>
            </div>

            <AtomsSection />
            <AssistSlipSection />

            <!-- 色板与字号也是矮卡。组件演示与图标那几张高度差得远，不并——
                 并排会把短的那张拉出大片空白。 -->
            <div class="stack-pair">
                <PaletteSection />
                <TypeScaleSection />
            </div>

            <IconsSection />
        </div>
    </PageShell>
</template>
