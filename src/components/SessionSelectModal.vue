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
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <header class="border-b border-slate-800 pb-3">
                <h2 class="text-lg font-semibold text-slate-100">選擇要載入的對局</h2>
                <p class="text-xs text-slate-400 mt-0.5">選擇一場備份中的對局恢復資料：</p>
            </header>

            <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                <!-- 選項：JSON 中的進行中對局 -->
                <label v-if="hasUnfinishedGame"
                    :class="['block border p-3 rounded-xl cursor-pointer transition-all', selectedSessionId === 'current_active' ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800']">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <input type="radio" value="current_active" v-model="selectedSessionId"
                                class="text-indigo-600 focus:ring-0" />
                            <span class="text-sm font-medium text-amber-400">⚡ 未完成的對局 (進行中)</span>
                        </div>
                        <span class="text-xs text-slate-400 font-mono">{{ backupData?.historyStack?.length }} 回合</span>
                    </div>
                </label>

                <!-- 選項：歷史 Sessions -->
                <label v-for="(session, idx) in sessions" :key="session.id || idx"
                    :class="['block border p-3 rounded-xl cursor-pointer transition-all', selectedSessionId === session.id ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800']">
                    <div class="flex items-center justify-between mb-1.5">
                        <div class="flex items-center gap-2">
                            <input type="radio" :value="session.id" v-model="selectedSessionId"
                                class="text-indigo-600 focus:ring-0" />
                            <span class="text-sm font-medium text-slate-200">歷史對局 #{{ sessions.length - idx }}</span>
                        </div>
                        <span class="text-xs text-slate-400 font-mono">{{ formatDate(session.startTime) }}</span>
                    </div>
                    <!-- 參與玩家列表 preview -->
                    <div class="flex flex-wrap gap-1 text-xs text-slate-400 pl-6">
                        <span v-for="pId in session.playerIds" :key="pId"
                            class="bg-slate-700/50 px-1.5 py-0.5 rounded text-[11px] text-slate-300">
                            {{ getPlayerName(pId) }}
                        </span>
                    </div>
                </label>

                <div v-if="!hasUnfinishedGame && sessions.length === 0" class="text-center py-6 text-xs text-slate-500">
                    此備份檔內沒有可供載入的戰局紀錄。
                </div>
            </div>

            <!-- Footer 區塊 -->
            <footer class="space-y-2 pt-2 border-t border-slate-800">
                <!-- 載入動作區域 -->
                <div v-if="selectedSessionId" class="grid grid-cols-2 gap-2">
                    <button type="button" @click="emit('close')"
                        class="w-full bg-transparent hover:bg-slate-800/50 text-slate-400 text-xs py-1.5 rounded-lg transition-all">
                        僅匯入玩家名單 (不載入對局)
                    </button>
                    <button type="button" @click="handleConfirm(true)"
                        class="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 rounded-xl transition-all shadow-md active:scale-95">
                        載入並繼續對局
                    </button>
                </div>

            </footer>
        </div>
    </div>
</template>