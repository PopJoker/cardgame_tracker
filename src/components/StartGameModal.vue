<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlayersStore } from '../stores/usePlayersStore'
import { useGameStore, type GameSession, type GameRound } from '../stores/useGameStore'
import {
    detectNameConflicts,
    type NameConflict,
    type BackupData,
    type ConflictResolution
} from '../utils/importHandler'
import ImportMappingModal from './ImportMappingModal.vue'
import SessionSelectModal from './SessionSelectModal.vue'
import HistoryModal from './HistoryModal.vue'

const emit = defineEmits<{
    (e: 'game-started'): void
}>()

const playersStore = usePlayersStore()
const gameStore = useGameStore()

const fileInputRef = ref<HTMLInputElement | null>(null)

// 彈窗與對接狀態
const isMappingModalOpen = ref(false)
const isSessionModalOpen = ref(false)
const isHistoryModalOpen = ref(false)
const isTextImportModalOpen = ref(false) // 👈 新增：文字匯入 Modal 開關

const importText = ref('') // 👈 新增：綁定貼上的 JSON 文字
const pendingConflicts = ref<NameConflict[]>([])
const pendingBackupData = ref<BackupData | null>(null)

// 儲存簡化後的 ID 對照表 (舊 ID -> 新 ID)
const savedMappingResult = ref<Record<string, string>>({})

const hasMissingPlayerInHistory = computed(() => {
    const existingPlayerIds = new Set(playersStore.players.map(p => p.id))
    const history = gameStore.historyStack || []

    return history.some((round: GameRound) => {
        const playerIdsInRound = Object.keys(round.scores || {})
        return playerIdsInRound.some((id: string) => !existingPlayerIds.has(id))
    })
})

const newPlayerName = ref('')
const selectedPlayerIds = ref<string[]>([])

const historyPlayers = computed(() => playersStore.players)

const selectedPlayers = computed(() => {
    return selectedPlayerIds.value
        .map(id => historyPlayers.value.find(p => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
})

// ==================== Handlers ====================

const handleAddPlayer = () => {
    const name = newPlayerName.value.trim()
    if (!name) return

    let player = playersStore.players.find(p => p.name === name)
    if (!player) {
        playersStore.addPlayer(name)
        player = playersStore.players.find(p => p.name === name)
    }

    if (player && !selectedPlayerIds.value.includes(player.id)) {
        selectedPlayerIds.value.push(player.id)
    }
    newPlayerName.value = ''
}

const togglePlayerSelect = (id: string) => {
    const index = selectedPlayerIds.value.indexOf(id)
    if (index > -1) {
        selectedPlayerIds.value.splice(index, 1)
    } else {
        selectedPlayerIds.value.push(id)
    }
}

const removeSelected = (id: string) => {
    selectedPlayerIds.value = selectedPlayerIds.value.filter(pId => pId !== id)
}

const handleDeletePlayer = (id: string, name: string) => {
    if (confirm(`確定要從歷史紀錄中刪除玩家「${name}」嗎？`)) {
        playersStore.removePlayer(id)
        removeSelected(id)
    }
}

const handleStartGame = () => {
    if (selectedPlayerIds.value.length < 2) return
    gameStore.startNewGame(selectedPlayerIds.value)
    emit('game-started')
}

// ==================== 匯入相關邏輯 ====================

// 核心通用解析邏輯 (處理 JSON 字串)
const processBackupContent = (jsonString: string) => {
    try {
        const data = JSON.parse(jsonString) as BackupData

        if (!data || typeof data !== 'object') {
            throw new Error('格式不符，非有效的備份資料格式')
        }

        // 確保至少有 players 陣列
        if (!Array.isArray(data.players)) {
            data.players = []
        }

        pendingBackupData.value = data
        const conflicts = detectNameConflicts(data.players, playersStore.players)
        pendingConflicts.value = conflicts
        isMappingModalOpen.value = true // Step 1: 開啟人名對接 Modal
    } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : 'JSON 格式錯誤，解析失敗！')
    }
}

// 1. 檔案匯入觸發
const triggerFileInput = () => {
    fileInputRef.value?.click()
}

const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
        const content = event.target?.result as string
        if (content) {
            processBackupContent(content)
        }
    }
    reader.onerror = () => {
        alert('讀取檔案失敗！')
    }
    reader.readAsText(file)
    target.value = ''
}

// 2. 文字貼上匯入觸發
const handleTextImportSubmit = () => {
    if (!importText.value.trim()) {
        alert('請先貼上備份文字！')
        return
    }

    processBackupContent(importText.value.trim())
    importText.value = ''
    isTextImportModalOpen.value = false
}

// Step 1 完成：接收 MappingModal 的 Map 類型數據
const handleMappingConfirm = (resolutions: Map<string, ConflictResolution>) => {
    if (pendingBackupData.value) {
        const simpleMapping = playersStore.importPlayersWithMapping(pendingBackupData.value.players, resolutions)

        savedMappingResult.value = simpleMapping ?? {}
        isMappingModalOpen.value = false
        isSessionModalOpen.value = true
    }
}

// Step 2 完成：使用者選擇對局後觸發
const handleSessionConfirm = (payload: {
    selectedSession: GameSession | null;
    activeHistoryStack: GameRound[] | null;
    startImmediately?: boolean
}) => {
    const { selectedSession, activeHistoryStack, startImmediately = true } = payload

    if (selectedSession || activeHistoryStack) {
        gameStore.loadSelectedSession(
            selectedSession,
            activeHistoryStack,
            savedMappingResult.value
        )

        const rawPlayerIds = selectedSession?.playerIds
            || (activeHistoryStack && activeHistoryStack.length > 0 ? Object.keys(activeHistoryStack[0].scores) : [])

        if (rawPlayerIds.length > 0) {
            const mappedIds = rawPlayerIds.map(oldId => savedMappingResult.value[oldId] || oldId)
            selectedPlayerIds.value = Array.from(new Set(mappedIds))
        }

        if (!startImmediately) {
            gameStore.activePlayerIds = []
        }

        isSessionModalOpen.value = false
        pendingBackupData.value = null

        if (startImmediately) {
            emit('game-started')
        } else {
            alert('對局資料已成功載入！您可以確認玩家後再點擊「開始戰局」。')
        }
    } else {
        alert('玩家數據已成功導入！')
        isSessionModalOpen.value = false
        pendingBackupData.value = null
    }
}
</script>

<template>
    <div class="max-w-md mx-auto p-4 space-y-6">
        <!-- 隱藏式 File Input -->
        <input ref="fileInputRef" type="file" accept=".json" class="hidden" @change="handleFileChange" />

        <!-- Header -->
        <header class="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
                <h1 class="text-xl font-semibold tracking-wide text-slate-100">開局設定</h1>
                <p class="text-xs text-slate-400 mt-1">選擇或新增參與本局的玩家（至少 2 人）</p>
            </div>

            <!-- 右側功能按鈕區 -->
            <div class="flex items-center gap-1.5">
                <!-- 歷史戰績/累積統計按鈕 -->
                <button type="button" @click="isHistoryModalOpen = true"
                    class="bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs px-2.5 py-2 rounded-lg flex items-center gap-1 active:scale-95 transition-all min-h-[40px] relative"
                    title="查看歷史戰績與玩家累積統計">
                    <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span>歷史</span>

                    <span v-if="hasMissingPlayerInHistory"
                        class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"
                        title="部分歷史紀錄包含已刪除或未對接的玩家">
                    </span>
                </button>

                <!-- 貼上文字匯入按鈕 -->
                <button type="button" @click="isTextImportModalOpen = true"
                    class="bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs px-2.5 py-2 rounded-lg flex items-center gap-1 active:scale-95 transition-all min-h-[40px]"
                    title="貼上 JSON 備份文字">
                    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>貼上</span>
                </button>

                <!-- 匯入 JSON 檔案按鈕 -->
                <button type="button" @click="triggerFileInput"
                    class="bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs px-2.5 py-2 rounded-lg flex items-center gap-1 active:scale-95 transition-all min-h-[40px]"
                    title="選擇 JSON 檔案匯入">
                    <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M9 14.25l3 3m0 0l3-3m-3 3V10.5" />
                    </svg>
                    <span>檔案</span>
                </button>
            </div>
        </header>

        <!-- 1. 新增玩家輸入框 -->
        <section class="space-y-2">
            <label class="block text-xs font-medium tracking-wider text-slate-400 uppercase">
                手動新增玩家
            </label>
            <form @submit.prevent="handleAddPlayer" class="flex gap-2">
                <input v-model="newPlayerName" type="text" placeholder="輸入玩家姓名..."
                    class="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                <button type="submit" :disabled="!newPlayerName.trim()"
                    class="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-medium px-5 py-3 rounded-xl min-h-[48px] active:scale-95 transition-all flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    新增
                </button>
            </form>
        </section>

        <!-- 2. 歷史玩家快捷選單與刪除 (Chips) -->
        <section class="space-y-2" v-if="historyPlayers.length > 0">
            <label class="block text-xs font-medium tracking-wider text-slate-400 uppercase">
                歷史玩家清單 (點擊選取 / 按右側 ✕ 刪除)
            </label>
            <div class="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                <div v-for="player in historyPlayers" :key="player.id" :class="[
                    'inline-flex items-center rounded-full text-xs font-medium transition-all min-h-[40px] border overflow-hidden',
                    selectedPlayerIds.includes(player.id)
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-400'
                ]">
                    <button type="button" @click="togglePlayerSelect(player.id)"
                        class="pl-3.5 pr-2 py-2 flex items-center gap-1.5 h-full hover:bg-white/5 active:scale-95 transition-all">
                        <span>{{ player.name }}</span>
                        <svg v-if="selectedPlayerIds.includes(player.id)" class="w-3.5 h-3.5 text-indigo-400 shrink-0"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                                d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                    </button>

                    <button type="button" @click.stop="handleDeletePlayer(player.id, player.name)" title="從歷史紀錄中刪除此玩家"
                        class="pr-3 pl-1 py-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 h-full flex items-center justify-center transition-colors border-l border-slate-700/50">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </section>

        <!-- 3. 本局登場玩家區塊 -->
        <section class="space-y-2">
            <div class="flex justify-between items-center">
                <label class="text-xs font-medium tracking-wider text-slate-400 uppercase">
                    本局登場玩家 ({{ selectedPlayerIds.length }})
                </label>
                <button v-if="selectedPlayerIds.length > 0" @click="selectedPlayerIds = []"
                    class="text-xs text-rose-400 hover:text-rose-300 transition-colors py-1">
                    清空全選
                </button>
            </div>

            <div v-if="selectedPlayers.length === 0"
                class="border border-dashed border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                點擊上方歷史玩家或輸入新名稱以加入對局
            </div>

            <div v-else class="space-y-2">
                <div v-for="(player, idx) in selectedPlayers" :key="player.id"
                    class="flex items-center justify-between bg-slate-800/80 border border-slate-700/70 rounded-xl px-4 py-3 min-h-[52px]">
                    <div class="flex items-center gap-3">
                        <span
                            class="w-6 h-6 rounded-md bg-slate-700/80 text-slate-300 text-xs flex items-center justify-center font-mono">
                            {{ idx + 1 }}
                        </span>
                        <span class="font-medium text-slate-200 text-sm">{{ player.name }}</span>
                    </div>
                    <button type="button" @click="removeSelected(player.id)"
                        class="text-slate-500 hover:text-rose-400 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-slate-700/50 transition-all active:scale-95">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </section>

        <!-- 4. 開始遊戲按鈕 -->
        <div class="pt-2">
            <button type="button" @click="handleStartGame" :disabled="selectedPlayerIds.length < 2"
                class="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-base py-3.5 rounded-xl shadow-lg min-h-[52px] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                <span>開始戰局</span>
            </button>
            <p v-if="selectedPlayerIds.length < 2" class="text-xs text-center text-slate-500 mt-2">
                至少需要 2 位玩家才能開始遊戲
            </p>
        </div>

        <!-- 貼上 JSON 文字匯入 Modal -->
        <div v-if="isTextImportModalOpen"
            class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
                <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 class="font-semibold text-slate-100 text-sm flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>貼上 JSON 文字匯入</span>
                    </h3>
                    <button type="button" @click="isTextImportModalOpen = false"
                        class="text-slate-400 hover:text-slate-200">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <p class="text-xs text-slate-400">請貼上完整的備份 JSON 字串，系統將自動為您進行人名與對局對接：</p>
                <textarea v-model="importText" placeholder="在此處貼上 JSON 備份內容..."
                    class="w-full h-40 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono resize-none"></textarea>
                <div class="flex gap-2">
                    <button type="button" @click="isTextImportModalOpen = false"
                        class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-medium border border-slate-700">
                        取消
                    </button>
                    <button type="button" @click="handleTextImportSubmit"
                        class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-medium shadow-sm">
                        解析並對接
                    </button>
                </div>
            </div>
        </div>

        <!-- 人名 Mapping Modal -->
        <ImportMappingModal v-if="isMappingModalOpen" :is-open="isMappingModalOpen" :conflicts="pendingConflicts"
            :existing-players="playersStore.players" @close="isMappingModalOpen = false"
            @confirm="handleMappingConfirm" />

        <!-- 對局選擇 Modal -->
        <SessionSelectModal v-if="isSessionModalOpen" :is-open="isSessionModalOpen" :backup-data="pendingBackupData"
            :mapping-result="savedMappingResult" :existing-players="playersStore.players"
            @close="isSessionModalOpen = false" @confirm="handleSessionConfirm" />

        <!-- 歷史紀錄與統計 Modal -->
        <HistoryModal v-if="isHistoryModalOpen" :is-open="isHistoryModalOpen" @close="isHistoryModalOpen = false" />
    </div>
</template>