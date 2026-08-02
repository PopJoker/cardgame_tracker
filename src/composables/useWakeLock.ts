import { ref, onUnmounted } from 'vue'

export function useWakeLock() {
    const isSupported = typeof window !== 'undefined' && 'wakeLock' in navigator
    const isLocked = ref(false)
    let wakeLockSentinel: WakeLockSentinel | null = null

    // 請求螢幕常亮
    const requestWakeLock = async () => {
        if (!isSupported) return

        try {
            wakeLockSentinel = await navigator.wakeLock.request('screen')
            isLocked.value = true

            // 監聽解鎖事件
            wakeLockSentinel.addEventListener('release', () => {
                isLocked.value = false
                wakeLockSentinel = null
            })
        } catch (err) {
            console.warn('Wake Lock error:', err)
            isLocked.value = false
        }
    }

    // 釋放螢幕鎖定
    const releaseWakeLock = async () => {
        if (wakeLockSentinel) {
            await wakeLockSentinel.release()
            wakeLockSentinel = null
            isLocked.value = false
        }
    }

    // 當使用者切換分頁/切回 App 時，自動重新取得 Wake Lock
    const handleVisibilityChange = async () => {
        if (document.visibilityState === 'visible' && !isLocked.value) {
            await requestWakeLock()
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    onUnmounted(() => {
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
        releaseWakeLock()
    })

    return {
        isSupported,
        isLocked,
        requestWakeLock,
        releaseWakeLock,
    }
}