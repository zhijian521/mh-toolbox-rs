import { computed, ref } from 'vue';
import { useLiquidPreferences } from '../../composables/use-liquid-preferences';
import { daysAgo, todayText } from '../../services/format';
import { makeId } from '../../services/shape';
import {
    sortedPoints,
    type PriceItem,
    type PricePoint,
    type PricePointDraft,
} from '../prices/prices';

export function createGalleryExamples() {
    const { wallpaper } = useLiquidPreferences();
    const day = todayText();
    const chartExample = ref('trend');
    const sampleDays = Array.from({ length: 7 }, (_, index) => daysAgo(6 - index));
    const sampleTrend = [
        {
            id: 'income',
            name: '收入',
            values: [820000, 560000, 740000, 980000, 620000, 830000, 910000],
        },
        {
            id: 'expense',
            name: '支出',
            values: [420000, 360000, 520000, 610000, 380000, 460000, 330000],
        },
    ];
    const sampleSeries = [
        { name: '收入', color: 'var(--liquid-down)' },
        { name: '支出', color: 'var(--liquid-up)' },
    ];
    const sampleColors = sampleSeries.map((item) => item.color);
    const sampleChannels = [
        { id: 'cbg', name: '藏宝阁', values: [320, 180] },
        { id: 'game', name: '游戏内', values: [210, 120] },
    ];
    const sampleItem = ref<PriceItem>({
        id: 'sample',
        name: '金刚石',
        category: '任务产出',
        sub: '五宝',
        unit: '个',
        note: '',
        createdAt: 0,
        updatedAt: 0,
        points: [
            { id: 'first', date: day, price: 830_000, note: '', createdAt: 0 },
            { id: 'second', date: day, price: 855_000, note: '', createdAt: 1 },
        ],
    });
    const history = computed(() => sortedPoints(sampleItem.value));
    const samplePage = ref(1);
    const sheetOpen = ref(false);
    const editorOpen = ref(false);
    const editingPoint = ref<PricePoint>();
    function openSample(mode: 'add' | 'edit') {
        editingPoint.value = mode === 'edit' ? history.value[0] : undefined;
        editorOpen.value = true;
    }
    function saveSample(draft: PricePointDraft) {
        if (editingPoint.value) Object.assign(editingPoint.value, draft);
        else
            sampleItem.value.points.push({ ...draft, id: makeId('sample'), createdAt: Date.now() });
        editorOpen.value = false;
    }

    const priceExample = ref<number | null>(3_200_000);
    const initialPrice = ref<number | null>(null);
    const fieldRows = ref(
        ['紧凑', '标准'].map((size) => ({
            size,
            name: '',
            category: '',
            date: day,
            time: '07:30',
            query: '',
            quantity: 12,
        })),
    );
    const compactLevel = ref(69);
    const compactExperience = ref(1_200_000);
    const invalidQuantity = ref(0);
    const disabledQuantity = ref(12);
    const smallAlerts = ref(true);
    const disabledAlerts = ref(false);
    const invalidPrice = ref<number | null>(0);
    const unavailableCategory = ref('');
    const categories = [
        { value: '任务产出', label: '任务产出' },
        { value: '装备灵饰', label: '装备灵饰' },
        { value: '召唤兽', label: '召唤兽' },
    ];
    const checkboxOptions = categories.map((category) => ({
        ...category,
        disabled: category.value === '召唤兽',
    }));
    const filterOptions = [{ value: '', label: '全部分类' }, ...categories];
    const names = ['金刚石', '定魂珠', '夜光珠'];
    const tableExamples = Array.from({ length: 12 }, (_, index) => ({
        name: names[index % names.length],
        date: daysAgo(index),
        price: 855_000 - index * 5_000,
    }));
    function searchExamples(query: string) {
        return names.filter((item) => item.includes(query.trim()));
    }
    const alerts = ref(true);
    const threshold = ref(62);
    const currentTab = ref('prices');
    const choiceExamples = ref(
        (['compact', 'standard'] as const).map((size) => ({
            size,
            label: size === 'compact' ? '紧凑' : '标准',
            status: 'active',
            categories: ['任务产出', '召唤兽'],
        })),
    );
    const checkboxCategories = ref(['任务产出']);
    const sort = ref('名称');
    const observations = [
        '06:15　记录金刚石行情',
        '07:40　更新定魂珠价格',
        '08:25　查看历史',
        '09:50　补记夜光珠价格',
        '11:10　更新五宝行情',
    ];
    return {
        wallpaper,
        chartExample,
        sampleDays,
        sampleTrend,
        sampleSeries,
        sampleColors,
        sampleChannels,
        sampleItem,
        history,
        samplePage,
        sheetOpen,
        editorOpen,
        editingPoint,
        openSample,
        saveSample,
        priceExample,
        initialPrice,
        fieldRows,
        compactLevel,
        compactExperience,
        invalidQuantity,
        disabledQuantity,
        smallAlerts,
        disabledAlerts,
        invalidPrice,
        unavailableCategory,
        categories,
        checkboxOptions,
        filterOptions,
        tableExamples,
        searchExamples,
        alerts,
        threshold,
        currentTab,
        choiceExamples,
        checkboxCategories,
        sort,
        observations,
    };
}

export type GalleryExamples = ReturnType<typeof createGalleryExamples>;
