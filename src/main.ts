import { createApp } from 'vue';
import './styles/tokens.css';
import './styles/base.css';
import './styles/blocks.css';
import App from './App.vue';
import { useFontScale } from './composables/use-font-scale';
import { useTheme } from './composables/use-theme';
import { router } from './router';

/**
 * 持久化偏好在挂载前就先落地：字号是根元素上的一个变量，主题是根元素上的一个类。
 * 两者都只在「第一次有人调」时才写入 DOM——原先只有设置页和左栏会调，于是冷启动停在
 * 总览时字号不会恢复，得先进一次设置页才对。两个 composable 都是模块级单例，
 * 这里各调一次即可覆盖整个应用，挂在 `mount` 之前也避免了首帧跳动。
 */
useFontScale();
useTheme();

createApp(App).use(router).mount('#app');
