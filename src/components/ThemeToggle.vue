<script setup lang="ts">
import { ref, onMounted } from 'vue'

// 1. 建立一個輔助函式，在 JS 初始化當下就取得精準狀態（避免預設 true 導致的狀態不同步）
const getInitialTheme = (): boolean => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const isDark = ref(getInitialTheme())

// 同步更新 HTML Class 與 localStorage
const updateTheme = (dark: boolean) => {
    isDark.value = dark
    const root = document.documentElement

    if (dark) {
        root.classList.add('dark')
        root.classList.remove('light')
        localStorage.setItem('theme', 'dark')
    } else {
        root.classList.remove('dark')
        root.classList.add('light')
        localStorage.setItem('theme', 'light')
    }
}

// 切換主題
const toggleTheme = () => {
    updateTheme(!isDark.value)
}

// 初始化與監聽
onMounted(() => {
    // 進入頁面時立即確保 DOM class 正確
    updateTheme(isDark.value)

    // 監聽系統主題切換
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemChange = (e: MediaQueryListEvent) => {
        if (!localStorage.getItem('theme')) {
            updateTheme(e.matches)
        }
    }

    mediaQuery.addEventListener('change', handleSystemChange)
})
</script>

<template>
    <button @click="toggleTheme" class="theme-toggle" :aria-label="isDark ? '切換至淺色模式' : '切換至深色模式'"
        :title="isDark ? '切換至淺色模式' : '切換至深色模式'">
        <!-- 光影背景滑塊 -->
        <span class="toggle-track" :class="{ 'is-dark': isDark }">
            <span class="toggle-thumb">
                <!-- 月亮 (深色) / 太陽 (淺色) 圖示 -->
                <svg v-if="isDark" class="icon moon-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>

                <svg v-else class="icon sun-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2" />
                    <path d="M12 20v2" />
                    <path d="m4.93 4.93 1.41 1.41" />
                    <path d="m17.66 17.66 1.41 1.41" />
                    <path d="M2 12h2" />
                    <path d="M20 12h2" />
                    <path d="m6.34 17.66-1.41 1.41" />
                    <path d="m19.07 4.93-1.41 1.41" />
                </svg>
            </span>
        </span>
        <span class="toggle-text">{{ isDark ? 'DARK' : 'LIGHT' }}</span>
    </button>
</template>

<style scoped>
.theme-toggle {
    background: transparent;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    border-radius: 9999px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    outline: none;
    font-family: var(--mono);
}

.toggle-track {
    position: relative;
    width: 48px;
    height: 26px;
    background-color: var(--code-bg);
    border: 1.5px solid var(--border);
    border-radius: 9999px;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    padding: 2px;
}

/* 霓虹競技紅切換特效 (Dark Mode Glow) */
.toggle-track.is-dark {
    border-color: rgba(255, 42, 84, 0.6);
    box-shadow: 0 0 10px rgba(255, 42, 84, 0.25);
}

/* 經典撲克紅切換特效 (Light Mode Glow) */
.toggle-track:not(.is-dark) {
    border-color: rgba(79, 70, 229, 0.4);
}

.toggle-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--secondary);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease;
}

/* 深色模式：滾動至右邊 + 霓虹紅 */
.toggle-track.is-dark .toggle-thumb {
    transform: translateX(22px);
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
}

/* 淺色模式：滾動至左邊 + 科技藍 */
.toggle-track:not(.is-dark) .toggle-thumb {
    transform: translateX(0px);
    background: var(--secondary);
}

.icon {
    width: 13px;
    height: 13px;
    transition: transform 0.3s ease;
}

.theme-toggle:hover .icon {
    transform: rotate(15deg);
}

.toggle-text {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--text-h);
    user-select: none;
}
</style>