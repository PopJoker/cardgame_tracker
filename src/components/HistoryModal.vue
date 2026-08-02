<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/useGameStore'
import { usePlayersStore } from '../stores/usePlayersStore'

const emit = defineEmits<{
    (e: 'close'): void
}>()

const gameStore = useGameStore()
const playersStore = usePlayersStore()

const activeTab = ref<'current' | 'history' | 'backup'>('current')
const expandedSessionId = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 複製與文字匯入狀態
const copySuccess = ref(false)
const showTextImportModal = ref(false)
const importText = ref('')

// 取得玩家姓名輔助函式
const getPlayerName = (id: string) => {
    return playersStore.players.find(p => p.id === id)?.name || '未知玩家'
}

// 格式化時間
const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    })
}

// 切換 Session 明細展開
const toggleSession = (id: string) => {
    expandedSessionId.value = expandedSessionId.value === id ? null : id
}

// 回溯當前對局到特定回合
const handleRollbackCurrent = (roundIndex: number, roundId: string) => {
    if (confirm(`確定要回溯到 Round ${roundIndex + 1} 嗎？此回合之後的計分紀錄將會被移除。`)) {
        gameStore.rollbackToRound(roundId)
        emit('close')
    }
}

// 載入歷史對局並回溯至指定回合
const handleRestoreSession = (sessionId: string, roundIndex: number, roundId: string) => {
    if (confirm(`確定要載入此對局並回溯至 Round ${roundIndex + 1} 繼續進行嗎？`)) {
        gameStore.restoreSession(sessionId, roundId)
        emit('close')
    }
}

// 🎯【核心修正 1】產生備份資料物件：確保加入 activePlayerIds
const getBackupData = () => ({
    version: 1,
    exportTime: Date.now(),
    players: playersStore.players,
    activePlayerIds: gameStore.activePlayerIds || [], // 👈 紀錄當前有哪些人在場上玩
    gameSessions: gameStore.gameSessions,
    historyStack: gameStore.historyStack
})

// 下載 JSON 備份檔
const handleExport = () => {
    const backupData = getBackupData()
    const jsonStr = JSON.stringify(backupData, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scoreboard_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
}

// 複製 JSON 文字至剪貼簿
const handleCopyText = async () => {
    try {
        const backupData = getBackupData()
        const jsonStr = JSON.stringify(backupData)
        await navigator.clipboard.writeText(jsonStr)
        copySuccess.value = true
        setTimeout(() => {
            copySuccess.value = false
        }, 2000)
    } catch (err) {
        console.error('Copy Error:', err)
        alert('複製失敗，請檢查瀏覽器權限。')
    }
}

// 🎯【核心修正 2】匯入解析邏輯：還原 activePlayerIds
const processImportJson = (content: string): boolean => {
    try {
        const data = JSON.parse(content)

        // 1. 還原全體玩家名單
        if (data.players && Array.isArray(data.players)) {
            playersStore.players = data.players
            localStorage.setItem('players', JSON.stringify(data.players))
        }

        // 2. 還原戰績與歷史紀錄 (gameStore 的內部匯入處理)
        const success = gameStore.importDataJson(content)

        // 3. 🎯 精準推算並還原「當前正在進行對局」的 4 位玩家
        let targetActiveIds: string[] = []

        if (Array.isArray(data.activePlayerIds) && data.activePlayerIds.length > 0) {
            // A 方案：JSON 備份資料中直接包含了 activePlayerIds
            targetActiveIds = data.activePlayerIds
        } else if (data.historyStack && data.historyStack.length > 0) {
            // B 方案 (向下相容舊備份)：取當前戰局最後一個回合出現的玩家 IDs
            const lastRound = data.historyStack[data.historyStack.length - 1]
            if (lastRound && lastRound.scores) {
                targetActiveIds = Object.keys(lastRound.scores)
            }
        } else if (data.gameSessions && data.gameSessions.length > 0) {
            // C 方案：如果當前戰局沒有回合，取最新歷史 Session 的玩家清單
            const latestSession = data.gameSessions[0]
            if (latestSession && Array.isArray(latestSession.playerIds)) {
                targetActiveIds = latestSession.playerIds
            }
        }

        // 同步寫入到 Store 與 LocalStorage
        if (targetActiveIds.length > 0) {
            gameStore.activePlayerIds = targetActiveIds
            localStorage.setItem('activePlayerIds', JSON.stringify(targetActiveIds))
        }

        return success
    } catch (err) {
        console.error('JSON Parsing Error:', err)
        return false
    }
}

// 文字貼上匯入
const handleTextImportSubmit = () => {
    if (!importText.value.trim()) {
        alert('請先貼上備份文字！')
        return
    }

    const success = processImportJson(importText.value.trim())
    if (success) {
        alert('戰績與玩家資料匯入成功！已還原當前對局人員。')
        importText.value = ''
        showTextImportModal.value = false
        emit('close') // 匯入成功後自動關閉彈窗，返回主計分板
    } else {
        alert('匯入失敗：格式不符合或字串毀損。')
    }
}

// 上傳檔案匯入
const handleFileUpload = (event: Event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
        const content = e.target?.result as string
        if (content) {
            const success = processImportJson(content)
            if (success) {
                alert('戰績與玩家資料匯入成功！已還原當前對局人員。')
                emit('close')
            } else {
                alert('匯入失敗：格式不符合或檔案毀損。')
            }
        }
    }
    reader.readAsText(file)
    target.value = ''
}

const triggerFileInput = () => {
    fileInputRef.value?.click()
}

const handleClearAll = () => {
    if (confirm('確定要清除所有歷史對局紀錄嗎？此操作無法復原！')) {
        gameStore.clearAllHistory()
    }
}
</script>

<template>
    <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3">
        <div
            class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
            <!-- Modal Header -->
            <header class="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
                <h2 class="text-base font-semibold text-slate-100 flex items-center gap-2">
                    <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span>對局歷程與備份</span>
                </h2>
                <button type="button" @click="emit('close')"
                    class="text-slate-400 hover:text-slate-200 p-1 rounded-lg transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </header>

            <!-- Tabs Nav -->
            <nav class="flex border-b border-slate-800 bg-slate-900/50 p-1 shrink-0">
                <button type="button" @click="activeTab = 'current'" :class="[
                    'flex-1 py-2 text-xs font-medium rounded-xl transition-all',
                    activeTab === 'current' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                ]">
                    本局明細
                </button>
                <button type="button" @click="activeTab = 'history'" :class="[
                    'flex-1 py-2 text-xs font-medium rounded-xl transition-all',
                    activeTab === 'history' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                ]">
                    歷史戰績 ({{ gameStore.gameSessions.length }})
                </button>
                <button type="button" @click="activeTab = 'backup'" :class="[
                    'flex-1 py-2 text-xs font-medium rounded-xl transition-all',
                    activeTab === 'backup' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                ]">
                    備份 / 匯入
                </button>
            </nav>

            <!-- Modal Body (Scrollable) -->
            <div class="p-4 overflow-y-auto space-y-4 flex-1 text-slate-300 text-xs">
                <!-- Tab 1: 本局明細 -->
                <div v-if="activeTab === 'current'" class="space-y-3">
                    <div v-if="gameStore.historyStack.length === 0" class="text-center py-8 text-slate-500">
                        本局尚未有任何回合紀錄
                    </div>

                    <div v-for="(round, idx) in gameStore.historyStack" :key="round.id"
                        class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-2">
                        <div class="flex items-center justify-between text-slate-400 font-mono">
                            <span class="font-bold text-slate-200">Round {{ idx + 1 }}</span>
                            <div class="flex items-center gap-2">
                                <span>{{ formatDate(round.timestamp) }}</span>
                                <button type="button" @click="handleRollbackCurrent(idx, round.id)"
                                    class="text-[11px] bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 transition-colors flex items-center gap-1">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                                    </svg>
                                    <span>回溯至此</span>
                                </button>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 pt-1">
                            <div v-for="(score, pId) in round.scores" :key="pId"
                                class="flex items-center justify-between bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800">
                                <span class="truncate max-w-[90px] font-medium"
                                    :class="pId === round.winnerId ? 'text-indigo-300' : 'text-slate-300'">
                                    {{ getPlayerName(pId) }}
                                </span>
                                <span class="font-mono font-bold"
                                    :class="score > 0 ? 'text-emerald-400' : score < 0 ? 'text-rose-400' : 'text-slate-400'">
                                    {{ score > 0 ? `+${score}` : score }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab 2: 歷史戰績 -->
                <div v-else-if="activeTab === 'history'" class="space-y-3">
                    <div v-if="gameStore.gameSessions.length === 0" class="text-center py-8 text-slate-500">
                        尚無已結束的歷史對局紀錄
                    </div>

                    <div v-for="session in gameStore.gameSessions" :key="session.id"
                        class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-2 transition-all">
                        <div @click="toggleSession(session.id)"
                            class="flex items-center justify-between cursor-pointer select-none">
                            <div>
                                <span class="font-medium text-slate-200 block">{{ formatDate(session.startTime)
                                }}</span>
                                <span class="text-[11px] text-slate-400">
                                    玩家: {{session.playerIds.map(id => getPlayerName(id)).join(', ')}}
                                </span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span
                                    class="text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                    共 {{ session.rounds.length }} 回合
                                </span>
                                <svg class="w-4 h-4 text-slate-400 transition-transform"
                                    :class="expandedSessionId === session.id ? 'rotate-180' : ''" fill="none"
                                    stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                            </div>
                        </div>

                        <!-- 折疊明細 -->
                        <div v-if="expandedSessionId === session.id"
                            class="pt-2 border-t border-slate-700/50 space-y-2">
                            <div v-for="(round, rIdx) in session.rounds" :key="round.id"
                                class="bg-slate-900/80 p-2.5 rounded-lg text-[11px] space-y-1.5">
                                <div class="flex items-center justify-between border-b border-slate-800 pb-1">
                                    <span class="text-indigo-400 font-mono font-bold">
                                        Round {{ rIdx + 1 }} (勝者: {{ getPlayerName(round.winnerId) }})
                                    </span>
                                    <button type="button" @click="handleRestoreSession(session.id, rIdx, round.id)"
                                        class="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded font-medium transition-all active:scale-95 flex items-center gap-1">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                                        </svg>
                                        <span>載入並繼續</span>
                                    </button>
                                </div>
                                <div class="flex flex-wrap gap-x-3 gap-y-1 text-slate-300">
                                    <span v-for="(score, pId) in round.scores" :key="pId">
                                        {{ getPlayerName(pId) }}:
                                        <strong
                                            :class="score > 0 ? 'text-emerald-400' : score < 0 ? 'text-rose-400' : 'text-slate-400'">
                                            {{ score > 0 ? `+${score}` : score }}
                                        </strong>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab 3: 備份 / 匯入 / 管理 -->
                <div v-else-if="activeTab === 'backup'" class="space-y-4 pt-2">
                    <!-- 匯出 -->
                    <div class="bg-slate-800/50 border border-slate-700/60 p-3.5 rounded-xl space-y-2.5">
                        <h3 class="font-medium text-slate-200">匯出備份資料</h3>
                        <p class="text-slate-400 text-[11px]">將玩家清單與對局歷史匯出，方便備份或分享給朋友。</p>

                        <div class="grid grid-cols-2 gap-2">
                            <!-- 複製文字按鈕 -->
                            <button type="button" @click="handleCopyText"
                                class="bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-medium min-h-[40px] transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm">
                                <svg v-if="!copySuccess" class="w-4 h-4" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <svg v-else class="w-4 h-4 text-white" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M5 13l4 4L19 7" />
                                </svg>
                                <span>{{ copySuccess ? '已複製文字！' : '複製備份文字' }}</span>
                            </button>

                            <!-- 下載 JSON 檔案按鈕 -->
                            <button type="button" @click="handleExport"
                                class="bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-medium min-h-[40px] transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                <span>下載 JSON 檔</span>
                            </button>
                        </div>
                    </div>

                    <!-- 匯入 -->
                    <div class="bg-slate-800/50 border border-slate-700/60 p-3.5 rounded-xl space-y-2.5">
                        <h3 class="font-medium text-slate-200">匯入備份資料</h3>
                        <p class="text-slate-400 text-[11px]">可直接貼上從 LINE 接收到的備份文字，或選擇 JSON 檔案還原。</p>

                        <div class="grid grid-cols-2 gap-2">
                            <!-- 貼上文字匯入按鈕 -->
                            <button type="button" @click="showTextImportModal = true"
                                class="bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 rounded-xl font-medium min-h-[40px] transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-slate-600">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <span>貼上文字匯入</span>
                            </button>

                            <!-- 上傳檔案匯入按鈕 -->
                            <input ref="fileInputRef" type="file" accept=".json" class="hidden"
                                @change="handleFileUpload" />
                            <button type="button" @click="triggerFileInput"
                                class="bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 rounded-xl font-medium min-h-[40px] transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-slate-600">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                </svg>
                                <span>選擇檔案匯入</span>
                            </button>
                        </div>
                    </div>

                    <!-- 清除歷史 -->
                    <div class="pt-2 border-t border-slate-800">
                        <button type="button" @click="handleClearAll"
                            class="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 py-2.5 rounded-xl font-medium min-h-[40px] transition-all active:scale-95">
                            清除所有歷史對局紀錄
                        </button>
                    </div>
                </div>
            </div>

            <!-- 子彈窗：貼上 JSON 文字匯入 -->
            <div v-if="showTextImportModal"
                class="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-10 flex flex-col p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 class="font-semibold text-slate-100 text-sm">貼上備份文字匯入</h3>
                    <button type="button" @click="showTextImportModal = false"
                        class="text-slate-400 hover:text-slate-200">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <p class="text-[11px] text-slate-400">請將 LINE 或剪貼簿中的完整 JSON 備份文字貼至下方欄位：</p>
                <textarea v-model="importText" placeholder="在此處貼上 JSON 內容..."
                    class="flex-1 w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-mono"></textarea>
                <div class="flex gap-2 shrink-0">
                    <button type="button" @click="showTextImportModal = false"
                        class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl font-medium border border-slate-700">
                        取消
                    </button>
                    <button type="button" @click="handleTextImportSubmit"
                        class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-medium shadow-sm">
                        確認匯入
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>