<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import { loadAssetSections, type AssetItem, type AssetSection } from '../../services/game-assets';

/**
 * 游戏资源：把项目里那些图标摆成一面可以搜的墙。
 *
 * ---- 这一页只有一件事：找到那张图 ----
 *
 * 用户来这里通常是「我想确认这个技能配的图对不对」或者「看看这件装备长什么样」。
 * 所以只有两个控件：一个搜索框、一个分类。没有排序、没有分页、没有详情弹窗——
 * 点开一张 48 的图看不到更多信息，那些信息（等级、门派）已经在名字下面一行了。
 *
 * ---- 一次只摆一类，默认「武器」 ----
 *
 * 没有「全部分类」这一档：十类加起来一千多项，`loading="lazy"` 只省下图片请求，
 * 一千多个 `<li>` 与它们的样式仍然要一次性建出来——按「找一张图」的用法，
 * 那笔开销换不来任何东西。所以进来先落在**武器**（最大的一类，231 项），
 * 要别的类在下拉里切一类。搜索也只在当前这一类里搜，与「先选类再打字」同一个模型。
 *
 * ---- 数据懒加载，失败不崩 ----
 *
 * `loadAssetSections()` 第一次进来才取 `icons.json` 与 `pet-skills.json`（装备名录复用
 * 启动时那份缓存）。单份坏掉只少一类，页面照常出来；全空时给一句话，而不是一片白。
 */
const sections = ref<AssetSection[]>([]);
const loading = ref(true);
const failed = ref(false);

/* 返回工具目录。写死 `/tools` 而不是 `router.back()`：刷新或直接从地址进来时
 * 「上一页」是空的，甚至可能是站外——工具子页的上一级永远只有目录一个。 */
const router = useRouter();

const keyword = ref('');
/** 当前选的类别。默认武器；清单里没有武器时在加载完成后退到第一类。 */
const kind = ref('weapon');

onMounted(async () => {
    try {
        sections.value = await loadAssetSections();
        /* 一份都没读上来，按失败处理：否则页面是一句「没有匹配的资源」，
         * 读起来像搜索词写错了，而事实是清单没到。 */
        if (!sections.value.length) failed.value = true;
        /* 默认那一类可能压根不存在（单份清单坏掉时只少一类）。退到第一类，
         * 不然一进来就是空态。 */
        else if (!sections.value.some((one) => one.kind === kind.value)) {
            kind.value = sections.value[0].kind;
        }
    } catch {
        failed.value = true;
    } finally {
        loading.value = false;
    }
});

const KIND_OPTIONS = computed(() =>
    sections.value.map((one) => ({ value: one.kind, label: one.title })),
);

function hit(item: AssetItem, word: string): boolean {
    const text = word.toLowerCase();
    return (
        item.name.toLowerCase().includes(text) ||
        item.subgroup.toLowerCase().includes(text) ||
        item.note.toLowerCase().includes(text)
    );
}

/** 一节的渲染形态：按 `subgroup` 再分一层，空名的组不画小标题。 */
interface RenderGroup {
    name: string;
    items: AssetItem[];
}

interface RenderSection {
    kind: string;
    title: string;
    total: number;
    groups: RenderGroup[];
}

const visible = computed<RenderSection[]>(() => {
    const word = keyword.value.trim();
    /* `!kind.value` 只是兜底：清单一份都没读上来时 `kind` 是空串，那时不该把
     * 任何一类摆出来（`sections` 本来也是空的），写在这里是为了让这条判据与
     * 「kind 是一把筛子」这件事读起来一致。 */
    const picked = sections.value.filter((one) => !kind.value || one.kind === kind.value);

    return picked
        .map((one) => {
            const items = word ? one.items.filter((item) => hit(item, word)) : one.items;
            const groups: RenderGroup[] = [];
            for (const item of items) {
                const last = groups[groups.length - 1];
                if (last && last.name === item.subgroup) last.items.push(item);
                else groups.push({ name: item.subgroup, items: [item] });
            }
            return { kind: one.kind, title: one.title, total: items.length, groups };
        })
        .filter((one) => one.total > 0);
});

const shownTotal = computed(() => visible.value.reduce((sum, one) => sum + one.total, 0));

/* 既然只摆一类，两个数字说同一件事：没打字时是「这一类共多少」，打了是「命中多少」。
 * 都用 `shownTotal`——它已经只算当前类，不必再单独维护一个全量总数。 */
const countText = computed(() => {
    if (loading.value) return '正在读清单…';
    if (keyword.value.trim()) return `找到 ${shownTotal.value} 项`;
    return `共 ${shownTotal.value} 项`;
});
</script>

<template>
    <PageShell title="游戏资源" desc="装备、技能与召唤兽图标">
        <template #actions>
            <!-- 与捉鬼、闹钟两页同一枚。这一页没有主操作，所以它是动作区里唯一的一个，
                 落在右端。 -->
            <PressButton
                icon="back"
                text="返回"
                label="返回工具列表"
                @click="router.push('/tools')"
            />
        </template>

        <div class="asset-bar">
            <input
                v-model="keyword"
                class="field asset-search"
                type="text"
                aria-label="搜索资源名"
                placeholder="在这一类里搜，例如 剑 / 刀"
            />
            <SelectField
                class="asset-kind"
                :model-value="kind"
                :options="KIND_OPTIONS"
                label="按类别筛选"
                placeholder="选择分类"
                @update:model-value="kind = $event"
            />
            <span class="asset-count">{{ countText }}</span>
        </div>

        <div v-if="failed" class="asset-void page-empty">
            <AppIcon name="info" class="void-icon page-empty-icon" />
            <h3>资源清单没读上来</h3>
            <p class="note">一般是 dev server 刚起来。刷新一下这一页再试试。</p>
        </div>

        <section v-for="section in visible" :key="section.kind" class="board asset-section">
            <header class="asset-head">
                <h3 class="asset-title">{{ section.title }}</h3>
                <span class="asset-total">{{ section.total }}</span>
            </header>

            <div v-for="group in section.groups" :key="group.name" class="asset-group">
                <h4 v-if="group.name" class="asset-sub">{{ group.name }}</h4>
                <ul class="asset-grid">
                    <li
                        v-for="item in group.items"
                        :key="item.key"
                        class="asset-cell"
                        :title="item.name"
                    >
                        <img
                            class="asset-img"
                            :src="item.img"
                            :alt="item.name"
                            loading="lazy"
                            decoding="async"
                        />
                        <span class="asset-name">{{ item.name }}</span>
                        <span v-if="item.note" class="asset-meta">{{ item.note }}</span>
                    </li>
                </ul>
            </div>
        </section>

        <div v-if="!loading && !failed && !visible.length" class="asset-void page-empty">
            <AppIcon name="search" class="void-icon page-empty-icon" />
            <h3>没有匹配的资源</h3>
            <p class="note">换个词试试，或者在上面换一个分类。</p>
        </div>
    </PageShell>
</template>

<style scoped>
/* ---------- 工具条 ----------
 * 搜索在左、分类在中、计数在右。计数贴着右端是为了「一边打字一边看数字变小」时
 * 眼睛不用来回跳——它回答的是「还剩多少」，与输入框同一条横线。 */
.asset-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.asset-search {
    width: calc(260px * var(--fs-scale));
}

/* `flex: none` 是必须的：`SelectField` 的根上写着 `flex: 1`（那条是给「下拉与输入格
 * 并排、各占一半」的表单用的），到这里它会把搜索框之后的宽度全吃掉——只写 width 没用，
 * `flex-basis: 0%` 让宽度由增长决定。两层选择器是为了压过子组件 scoped 里那一条
 * （`.asset-kind` + `.select-field` 都是 0,2,0，谁后注入谁赢；这里抬到 0,3,0）。
 *
 * 132 够放下最长的那几个分类名（「召唤兽技能」五个字加箭头）；
 * 下拉纸片有 `min-width: 168` 自己会撑开，触发条不必跟着变宽。 */
.asset-bar .asset-kind {
    flex: none;
    width: calc(132px * var(--fs-scale));
}

.asset-count {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

/* ---------- 一张类别的卡 ----------
 * 与其它页的 `.board` 同一张纸，只是内距收窄：资源墙要密，20 的白边在这里
 * 等于每屏少摆一整行。 */
.asset-section {
    padding: 14px 16px 16px;
}

.asset-section + .asset-section {
    margin-top: 12px;
}

.asset-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
}

.asset-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-md);
}

.asset-total {
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}

/* 子组标题（部位 / 门派 / 技能等级）：比正文小一档、带一道短竖条，
 * 与全站的 `.section-mark` 同一个说法，但这里要轻——一屏可能出现七八个。 */
.asset-sub {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 12px 0 8px;
    color: var(--muted);
    font-size: var(--fs-xs);
    font-weight: 400;
}

.asset-sub::before {
    content: '';
    width: 2px;
    height: 11px;
    border-radius: 1px;
    background: var(--rule-2);
}

.asset-group:first-child .asset-sub {
    margin-top: 0;
}

.asset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(calc(76px * var(--fs-scale)), 1fr));
    gap: 6px 4px;
    margin: 0;
    padding: 0;
    list-style: none;
}

/* 一格：图标在上、名字在下。**不加凹槽底**——三批图里有的自带底板（门派、召唤兽），
 * 有的透明（装备、武器），垫一层统一底色会变成「双层纸」，而这里要的是「一片图」。 */
.asset-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 4px 2px 5px;
    border-radius: 4px;
    text-align: center;
    transition: background-color var(--t-quick) var(--ease-soft);
}

.asset-cell:hover {
    background: color-mix(in srgb, var(--seal) 7%, transparent);
}

.asset-img {
    width: calc(54px * var(--fs-scale));
    height: calc(54px * var(--fs-scale));
    object-fit: contain;
}

/* 名字最多两行：`一苇渡江`、`双巨斧·乾` 这种四五个字的在小格里会顶到边，
 * 截成一行再打省略号就分不清了。 */
.asset-name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    width: 100%;
    color: var(--ink-2);
    font-size: var(--fs-mini);
    line-height: 1.3;
    overflow-wrap: anywhere;
}

.asset-meta {
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
}
</style>
