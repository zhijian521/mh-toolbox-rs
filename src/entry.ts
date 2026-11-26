import { activeAppShell } from './services/app-shell';

// 分开加载两个入口，保留 Vite 生产构建为各自入口生成的样式预加载。
const loadAppShell = {
    legacy: () => import('./main'),
    liquid: () => import('./liquid-main'),
};

void loadAppShell[activeAppShell]();
