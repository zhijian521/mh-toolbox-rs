<script setup lang="ts">
import PageShell from '../../components/PageShell.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import SlotButton from '../../components/SlotButton.vue';
import { askConfirm } from '../../composables/use-confirm';
import { notify } from '../../composables/use-notify';
import { useDevMode } from '../../composables/use-dev-mode';
import AtomsSection from './AtomsSection.vue';
import IconsSection from './IconsSection.vue';
import PaletteSection from './PaletteSection.vue';
import SlipRowSection from './SlipRowSection.vue';
import TypeScaleSection from './TypeScaleSection.vue';
import { DEMO_COUNTS, importDemoData } from './demo-data';

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
 * 与 `SettingsView` 同一个写法，因为它们本来是同一种页面（一叠 `.board` 卡）。
 *
 * 演示卡**按「原子 → 组合」的顺序**排：`AtomsSection` 收全局小件，`SlipRowSection`
 * 收由它们拼成、带业务语义的行；色板、字号、图标各一张。新件先问清楚「它是原子、
 * 组合，还是资源清单」——不然半年后没人说得清哪个该去哪儿。
 *
 * 卡片的并排与说明字数都按「够用就好」处理：一张卡回答一个问题，文字只留改的时候会踩的。
 */

const { devMode } = useDevMode();

/**
 * 灌一份模拟数据进名册与物价表。
 *
 * **先问再动手**：它整份顶掉现有的角色与物价。问句里必须写出代价与退路（设置页能导出），
 * 与设置页那两个确认窗同一条口径——同一个动作在不同页面换一种问法，用户就得重新判断
 * 「这次是不是也会删」。
 *
 * 写的是两份真数据，所以**不需要刷新页面**：`add` / `remove` / `addItem` 这些方法
 * 自己会更新内存里的那份 ref，页面上的卡片立刻换成新的。设置页的「导入备份」要
 * `location.reload()`，是因为那里走的是 Rust 整份替换、内存不知道。
 */
async function importDemo() {
    const ok = await askConfirm({
        danger: true,
        title: '用模拟数据替换现在的角色与物价？',
        note: `${DEMO_COUNTS.characters} 个角色、${DEMO_COUNTS.prices} 件物价会整份顶掉现在的内容，撤不回来。想留一份就先到设置页「导出」。主题与字号不受影响。`,
        confirmText: '导入',
        cancelText: '保持现状',
    });
    if (!ok) return;

    const result = importDemoData();
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    notify.success(`已导入 ${result.characters} 个角色、${result.prices} 件物价`);
}
</script>

<template>
    <PageShell title="开发帮助" desc="组件 · 令牌 · 图标 · 模拟数据">
        <div class="stack">
            <!-- 两张说明卡都只有几行，并一排；竖排下来右边全是空纸。 -->
            <div class="stack-pair">
                <LedgerSection title="入口与约定" hint="左栏里没有这一页">
                    <p class="note">
                        进来：三连击左栏顶部的标（朱印「梦」），或地址栏补 <code>#/dev</code>。
                    </p>
                    <p class="note">
                        明暗只改 <code>color-scheme</code>，字号只改 <code>--fs-scale</code>
                        （0.92 / 1 / 1.1）。
                    </p>
                </LedgerSection>

                <LedgerSection title="开发者模式" hint="测试入口的总开关">
                    <div class="form-row">
                        <span class="field-label">测试工具</span>
                        <CostSwitch v-model="devMode" off-label="关" on-label="开" />
                        <span class="meta">{{
                            devMode ? '捉鬼助手显示「测试文字」' : '捉鬼助手不生成「测试文字」'
                        }}</span>
                    </div>

                    <!-- 模拟数据是「另一个页面有没有东西可看」的问题，与上面那个开关无关：
                         开发页本身已经是隐藏入口，进得来的人就是来动这些的。 -->
                    <div class="form-row demo-row">
                        <span class="field-label">模拟数据</span>
                        <SlotButton
                            icon="flask"
                            text="导入"
                            label="导入模拟数据"
                            @click="importDemo"
                        />
                        <span class="meta">
                            {{ DEMO_COUNTS.characters }} 个角色 · {{ DEMO_COUNTS.prices }} 件物价
                        </span>
                    </div>
                    <p class="note">
                        整份替换，撤不回来（想留底稿先到设置页「导出」）。角色一满一空，物价
                        涨跌平、一件只记过一天、一件一条没记。
                    </p>
                </LedgerSection>
            </div>

            <AtomsSection />
            <SlipRowSection />

            <!-- 五张卡里四张传 `max-height="60vh"`（色板 97 枚、图标 41 枚、字号六档、票面行），
                 卡头钉住、内容自己滚，一张卡不会再长到两屏。原子组件那张传的是 `height`
                 而不是 `max-height`：它切组时内容高矮不同，只封顶的话卡片会跟着缩，
                 它上下那些卡全在动。
                 色板与字号仍并排：字号那一列内容只有 400 出头，被色板的 60vh 拉着等高，
                 多出来的是卡内空白，不是页面空白——与设置页四张卡的处理同一条。 -->
            <div class="stack-pair">
                <PaletteSection />
                <TypeScaleSection />
            </div>

            <IconsSection />
        </div>
    </PageShell>
</template>

<style scoped>
/* `.form-row` 只给行内排布、不给纵向间距（那是使用方的现场决定）。
 * 这一行接在上一段的说明文字后面，12px 才读得出「换了一件事」。 */
.demo-row {
    margin-top: 12px;
}
</style>
