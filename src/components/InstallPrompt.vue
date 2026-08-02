<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isIOS = ref(false)
const isStandalone = ref(false)
const showPrompt = ref(false)

// 檢查是否已經是以 PWA 全螢幕模式開啟
const checkIsStandalone = () => {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
    )
}

// 偵測 iOS Safari 裝置
const checkIsIOS = () => {
    const ua = window.navigator.userAgent
    const isApple = /iPad|iPhone|iPod/.test(ua)
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
    return isApple && isSafari
}

const handleBeforeInstallPrompt = (e: Event) => {
    e.preventDefault()
    deferredPrompt.value = e as BeforeInstallPromptEvent
    if (!isStandalone.value) {
        showPrompt.value = true
    }
}

onMounted(() => {
    isStandalone.value = checkIsStandalone()
    isIOS.value = checkIsIOS()

    // 如果已經是 Standalone 模式，就不需顯示提示
    if (isStandalone.value) return

    // 監聽原生安裝事件 (Android / Chrome)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // 若為 iOS 且未安裝，延遲 1.5 秒自動跳出引導
    if (isIOS.value) {
        const hasDismissed = localStorage.getItem('ios_install_prompt_dismissed')
        if (!hasDismissed) {
            setTimeout(() => {
                showPrompt.value = true
            }, 1500)
        }
    }
})

onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
})

// 觸發原生安裝視窗 (Android)
const handleInstallClick = async () => {
    if (!deferredPrompt.value) return

    await deferredPrompt.value.prompt()
    const choiceResult = await deferredPrompt.value.userChoice

    if (choiceResult.outcome === 'accepted') {
        showPrompt.value = false
    }
    deferredPrompt.value = null
}

// 關閉提示面板
const dismissPrompt = () => {
    showPrompt.value = false
    if (isIOS.value) {
        localStorage.setItem('ios_install_prompt_dismissed', 'true')
    }
}
</script>

<template>
    <Transition enter-active-class="transition transform duration-300 ease-out"
        enter-from-class="translate-y-full opacity-0" enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition transform duration-200 ease-in" leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-full opacity-0">
        <div v-if="showPrompt && !isStandalone"
            class="fixed bottom-4 left-4 right-4 max-w-md mx-auto bg-slate-800/95 border border-slate-700/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl z-50 text-slate-100">
            <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                    <!-- App Icon Placeholder / Logo -->
                    <div
                        class="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-indigo-950/40">
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5z" />
                        </svg>
                    </div>
                    <div>
                        <h3 class="font-semibold text-sm text-slate-100">安裝記分板 App</h3>
                        <p class="text-xs text-slate-400 mt-0.5">新增至主畫面，享全螢幕與離線記分</p>
                    </div>
                </div>

                <!-- 關閉按鈕 -->
                <button type="button" @click="dismissPrompt"
                    class="text-slate-400 hover:text-slate-200 p-1 rounded-lg transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Android / Chrome: 一鍵安裝按鈕 -->
            <div v-if="deferredPrompt" class="mt-3.5">
                <button type="button" @click="handleInstallClick"
                    class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 min-h-[40px]">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>立即安裝至手機主畫面</span>
                </button>
            </div>

            <!-- iOS Safari: 圖文引導說明 -->
            <div v-else-if="isIOS" class="mt-3 pt-3 border-t border-slate-700/60 text-xs text-slate-300 space-y-1.5">
                <div class="flex items-center gap-2">
                    <span
                        class="bg-slate-700 text-slate-300 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>點擊下方選單列的 <strong>「分享」</strong> 按鈕</span>
                    <!-- iOS Share Icon -->
                    <svg class="w-4 h-4 text-indigo-400 shrink-0 inline" fill="none" stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M8.25 9.75h4.875a2.625 2.625 0 0 1 2.625 2.625v6.75a2.625 2.625 0 0 1-2.625 2.625H8.25a2.625 2.625 0 0 1-2.625-2.625v-6.75A2.625 2.625 0 0 1 8.25 9.75Z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 3v11.25m0-11.25L8.25 6.75M12 3l3.75 3.75" />
                    </svg>
                </div>
                <div class="flex items-center gap-2">
                    <span
                        class="bg-slate-700 text-slate-300 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                    <span>滑動選擇 <strong>「加入主畫面」</strong> 即可像 App 般使用</span>
                </div>
            </div>
        </div>
    </Transition>
</template>