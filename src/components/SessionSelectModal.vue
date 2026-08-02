<!-- components/SessionSelectModal.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { GameSession, GameRound } from '../stores/useGameStore'
import type { BackupData } from '../utils/importHandler'

const props = defineProps<{
    isOpen: boolean
    backupData: BackupData | null
    mappingResult: Record<string, string> // 舊 ID -> 新 ID
    existingPlayers: Array<{ id: string; name: string }>
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', payload: {
        selectedSession: GameSession | null;
        activeHistoryStack: GameRound[] | null;
        startImmediately: boolean
    }): void
}>()

// 選中的對局 ID
const selectedSessionId = ref<string>('')

// 解析 JSON 內的 Sessions
const sessions = computed<GameSession[]>(() => {
    if (!props.backupData) return []
    return props.backupData.gameSessions || props.backupData.sessions || []
})

// 解析 JSON 內是否有進行中的未結算對局 (historyStack)
const hasUnfinishedGame = computed(() => {
    return Array.isArray(props.backupData?.historyStack) && props.backupData!.historyStack!.length > 0
})

// 當 Modal 打開時自動預設選擇項目
watch(() => props.isOpen, (newVal) => {
    if (newVal) {
        if (hasUnfinishedGame.value) {
            selectedSessionId.value = 'current_active'
        } else if (sessions.value.length > 0) {
            selectedSessionId.value = sessions.value[0].id
        } else {
            selectedSessionId.value = ''
        }
    }
}, { immediate: true })

// 格式化玩家名稱
const getPlayerName = (id: string) => {
    const mappedId = props.mappingResult[id] || id
    const found = props.existingPlayers.find(p => p.id === mappedId)
    return found ? found.name : id
}

// 格式化時間
const formatDate = (timestamp?: number | string) => {
    if (!timestamp) return '未知時間'
    const date = new Date(timestamp)
    return date.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 觸發確認 Event
const handleConfirm = (startImmediately: boolean) => {
    if (!selectedSessionId.value) return

    if (selectedSessionId.value === 'current_active' && props.backupData?.historyStack) {
        // 選擇復原「進行中的對局」
        emit('confirm', {
            selectedSession: null,
            activeHistoryStack: props.backupData.historyStack,
            startImmediately
        })
    } else {
        // 選擇某個特定的歷史紀錄 Session 載入
        const found = sessions.value.find(s => s.id === selectedSessionId.value)
        emit('confirm', {
            selectedSession: found || null,
            activeHistoryStack: null,
            startImmediately
        })
    }
}
</script>

<template>
    <!-- 主彈窗遮罩 -->
    <Transition name="modal-fade" appear>
        <div v-if="isOpen"
            class="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            @click.self="emit('close')">

            <!-- Modal 主體容器：套用 modal-bg 變數與主題適應樣式 -->
            <div
                class="modal-content modal-bg border header-border w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden relative transition-colors duration-300">

                <!-- Modal Header -->
                <header class="p-4 border-b header-border flex justify-between items-center card-bg shrink-0">
                    <div>
                        <h2 class="text-base font-bold text-main">選擇要載入的對局</h2>
                        <p class="text-xs text-sub mt-0.5">選擇一場備份中的對局恢復資料：</p>
                    </div>
                    <button type="button" @click="emit('close')"
                        class="text-sub hover:text-main p-2 text-xl min-w-[44px] min-h-[44px] rounded-lg transition-colors flex items-center justify-center">
                        ✕
                    </button>
                </header>

                <!-- Sessions List (Scrollable) -->
                <div class="p-4 overflow-y-auto space-y-2 flex-1 text-xs">
                    <!-- 選項：JSON 中的進行中對局 -->
                    <label v-if="hasUnfinishedGame" :class="[
                        'block border p-3.5 rounded-xl cursor-pointer transition-all',
                        selectedSessionId === 'current_active'
                            ? 'bg-indigo-500/10 border-indigo-500 shadow-sm'
                            : 'card-bg border-header-border hover:opacity-80'
                    ]">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <input type="radio" value="current_active" v-model="selectedSessionId"
                                    class="text-indigo-600 focus:ring-0" />
                                <span class="text-xs font-semibold text-amber-500">⚡ 未完成的對局 (進行中)</span>
                            </div>
                            <span class="text-[11px] text-sub font-mono">{{ backupData?.historyStack?.length }}
                                回合</span>
                        </div>
                    </label>

                    <!-- 選項：歷史 Sessions -->
                    <label v-for="(session, idx) in sessions" :key="session.id || idx" :class="[
                        'block border p-3.5 rounded-xl cursor-pointer transition-all',
                        selectedSessionId === session.id
                            ? 'bg-indigo-500/10 border-indigo-500 shadow-sm'
                            : 'card-bg border-header-border hover:opacity-80'
                    ]">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                                <input type="radio" :value="session.id" v-model="selectedSessionId"
                                    class="text-indigo-600 focus:ring-0" />
                                <span class="text-xs font-semibold text-main">歷史對局 #{{ sessions.length - idx }}</span>
                            </div>
                            <span class="text-[11px] text-sub font-mono">{{ formatDate(session.startTime) }}</span>
                        </div>

                        <!-- 參與玩家列表 preview -->
                        <div class="flex flex-wrap gap-1 text-xs text-sub pl-6">
                            <span v-for="pId in session.playerIds" :key="pId"
                                class="modal-bg border header-border px-2 py-0.5 rounded text-[11px] text-sub">
                                {{ getPlayerName(pId) }}
                            </span>
                        </div>
                    </label>

                    <div v-if="!hasUnfinishedGame && sessions.length === 0" class="text-center py-8 text-xs text-sub">
                        此備份檔內沒有可供載入的戰局紀錄。
                    </div>
                </div>

                <!-- Modal Footer -->
                <footer class="p-4 border-t header-border card-bg shrink-0 space-y-2">
                    <div v-if="selectedSessionId" class="grid grid-cols-2 gap-2">
                        <button type="button" @click="emit('close')"
                            class="w-full card-bg hover:opacity-80 text-sub font-medium text-xs py-3 rounded-xl border header-border transition-all min-h-[44px]">
                            僅匯入玩家名單
                        </button>
                        <button type="button" @click="handleConfirm(true)"
                            class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-3 rounded-xl transition-all shadow-md active:scale-95 min-h-[44px]">
                            載入並繼續對局
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* 1. 彈窗主體與背景：跟隨全域深淺色背景 (var(--bg)) */
.modal-bg {
    background-color: var(--bg);
}

/* 2. 內部卡片、Header、Footer 背景 (var(--code-bg)) */
.card-bg {
    background-color: var(--code-bg);
}

/* 3. 主要與次要文字顏色適應 */
.text-main {
    color: var(--text-h);
}

.text-sub {
    color: var(--text);
}

/* 4. 邊框顏色適應 */
.header-border {
    border-color: var(--border);
}

/* 彈窗淡入淡出與縮放動畫 */
.modal-fade-enter-active,
.modal-fade-leave-active {
    transition: opacity 0.25s ease;
}

.modal-fade-enter-active .modal-content,
.modal-fade-leave-active .modal-content {
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
    opacity: 0;
}

.modal-fade-enter-from .modal-content,
.modal-fade-leave-to .modal-content {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
}
</style>