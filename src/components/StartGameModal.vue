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
const isTextImportModalOpen = ref(false)

const importText = ref('')
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

const processBackupContent = (jsonString: string) => {
    try {
        const data = JSON.parse(jsonString) as BackupData

        if (!data || typeof data !== 'object') {
            throw new Error('格式不符，非有效的備份資料格式')
        }

        if (!Array.isArray(data.players)) {
            data.players = []
        }

        pendingBackupData.value = data
        const conflicts = detectNameConflicts(data.players, playersStore.players)
        pendingConflicts.value = conflicts
        isMappingModalOpen.value = true
    } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : 'JSON 格式錯誤，解析失敗！')
    }
}

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

const handleTextImportSubmit = () => {
    if (!importText.value.trim()) {
        alert('請先貼上備份文字！')
        return
    }

    processBackupContent(importText.value.trim())
    importText.value = ''
    isTextImportModalOpen.value = false
}

const handleMappingConfirm = (resolutions: Map<string, ConflictResolution>) => {
    if (pendingBackupData.value) {
        const simpleMapping = playersStore.importPlayersWithMapping(pendingBackupData.value.players, resolutions)

        savedMappingResult.value = simpleMapping ?? {}
        isMappingModalOpen.value = false
        isSessionModalOpen.value = true
    }
}

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
    <div class="max-w-md mx-auto p-4 space-y-6 theme-container">
        <!-- 隱藏式 File Input -->
        <input ref="fileInputRef" type="file" accept=".json" class="hidden" @change="handleFileChange" />

        <!-- Header -->
        <header class="flex items-center justify-between border-b pb-4 header-border">
            <div>
                <h1 class="text-xl font-semibold tracking-wide text-main">牌局設定</h1>
                <p class="text-xs text-sub mt-1">選擇或新增參與本局的玩家（至少 2 人）</p>
            </div>

            <!-- 右側功能按鈕區 -->
            <div class="flex items-center gap-1.5">
                <!-- 歷史戰績按鈕 -->
                <button type="button" @click="isHistoryModalOpen = true"
                    class="btn-secondary text-xs px-2.5 py-2 rounded-lg flex items-center gap-1 active:scale-95 transition-all min-h-[40px] relative"
                    title="查看歷史戰績與玩家累積統計">
                    <svg class="w-4 h-4 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>

                    <span v-if="hasMissingPlayerInHistory"
                        class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"
                        title="部分歷史紀錄包含已刪除或未對接的玩家">
                    </span>
                </button>

                <!-- 貼上文字匯入按鈕 -->
                <button type="button" @click="isTextImportModalOpen = true"
                    class="btn-secondary text-xs px-2.5 py-2 rounded-lg flex items-center gap-1 active:scale-95 transition-all min-h-[40px]"
                    title="貼上 JSON 備份文字">
                    <svg class="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                </button>

                <!-- 匯入 JSON 檔案按鈕 -->
                <button type="button" @click="triggerFileInput"
                    class="btn-secondary text-xs px-2.5 py-2 rounded-lg flex items-center gap-1 active:scale-95 transition-all min-h-[40px]"
                    title="選擇 JSON 檔案匯入">
                    <svg class="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M9 14.25l3 3m0 0l3-3m-3 3V10.5" />
                    </svg>
                </button>
            </div>
        </header>

        <!-- 1. 新增玩家輸入框 -->
        <section class="space-y-2">
            <label class="block text-xs font-medium tracking-wider text-sub uppercase">
                手動新增玩家
            </label>
            <form @submit.prevent="handleAddPlayer" class="flex gap-2">
                <input v-model="newPlayerName" type="text" placeholder="輸入玩家姓名..."
                    class="flex-1 theme-input rounded-xl px-4 py-3 text-sm placeholder-slate-400 focus:outline-none min-h-[48px]" />
                <button type="submit" :disabled="!newPlayerName.trim()"
                    class="btn-primary text-white text-sm font-medium px-5 py-3 rounded-xl min-h-[48px] active:scale-95 transition-all flex items-center gap-1.5">
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
            <label class="block text-xs font-medium tracking-wider text-sub uppercase">
                歷史玩家清單 (點擊選取 / 按右側 ✕ 刪除)
            </label>
            <div class="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                <div v-for="player in historyPlayers" :key="player.id" :class="[
                    'inline-flex items-center rounded-full text-xs font-medium transition-all min-h-[40px] border overflow-hidden',
                    selectedPlayerIds.includes(player.id)
                        ? 'chip-selected'
                        : 'chip-normal'
                ]">
                    <button type="button" @click="togglePlayerSelect(player.id)"
                        class="pl-3.5 pr-2 py-2 flex items-center gap-1.5 h-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all">
                        <span>{{ player.name }}</span>
                        <svg v-if="selectedPlayerIds.includes(player.id)" class="w-3.5 h-3.5 shrink-0 accent-icon"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                                d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                    </button>

                    <button type="button" @click.stop="handleDeletePlayer(player.id, player.name)" title="從歷史紀錄中刪除此玩家"
                        class="pr-3 pl-1 py-2 text-sub hover:text-rose-500 hover:bg-rose-500/10 h-full flex items-center justify-center transition-colors border-l header-border">
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
                <label class="text-xs font-medium tracking-wider text-sub uppercase">
                    本局登場玩家 ({{ selectedPlayerIds.length }})
                </label>
                <button v-if="selectedPlayerIds.length > 0" @click="selectedPlayerIds = []"
                    class="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 transition-colors py-1">
                    清空全選
                </button>
            </div>

            <div v-if="selectedPlayers.length === 0"
                class="border border-dashed header-border rounded-xl p-6 text-center text-sub text-xs">
                點擊上方歷史玩家或輸入新名稱以加入對局
            </div>

            <div v-else class="space-y-2">
                <div v-for="(player, idx) in selectedPlayers" :key="player.id"
                    class="flex items-center justify-between card-bg border header-border rounded-xl px-4 py-3 min-h-[52px]">
                    <div class="flex items-center gap-3">
                        <span class="w-6 h-6 rounded-md index-badge text-xs flex items-center justify-center font-mono">
                            {{ idx + 1 }}
                        </span>
                        <span class="font-medium text-main text-sm">{{ player.name }}</span>
                    </div>
                    <button type="button" @click="removeSelected(player.id)"
                        class="text-sub hover:text-rose-500 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-95">
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
                class="w-full btn-start disabled:opacity-50 text-white font-semibold text-base py-3.5 rounded-xl shadow-lg min-h-[52px] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                <span>開始戰局</span>
            </button>
            <p v-if="selectedPlayerIds.length < 2" class="text-xs text-center text-sub mt-2">
                至少需要 2 位玩家才能開始遊戲
            </p>
        </div>

        <!-- 貼上 JSON 文字匯入 Modal -->
        <div v-if="isTextImportModalOpen"
            class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="modal-bg border header-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
                <div class="flex items-center justify-between border-b header-border pb-3">
                    <h3 class="font-semibold text-main text-sm flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>貼上 JSON 文字匯入</span>
                    </h3>
                    <button type="button" @click="isTextImportModalOpen = false" class="text-sub hover:text-main">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <p class="text-xs text-sub">請貼上完整的備份 JSON 字串，系統將自動為您進行人名與對局對接：</p>
                <textarea v-model="importText" placeholder="在此處貼上 JSON 備份內容..."
                    class="w-full h-40 theme-input rounded-xl p-3 text-xs focus:outline-none font-mono resize-none"></textarea>
                <div class="flex gap-2">
                    <button type="button" @click="isTextImportModalOpen = false"
                        class="flex-1 btn-secondary py-2.5 rounded-xl text-xs font-medium border header-border">
                        取消
                    </button>
                    <button type="button" @click="handleTextImportSubmit"
                        class="flex-1 btn-primary text-white py-2.5 rounded-xl text-xs font-medium shadow-sm">
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

<style scoped>
/* 文字樣式適應 */
.text-main {
    color: var(--text-h);
}

.text-sub {
    color: var(--text);
}

.header-border {
    border-color: var(--border);
}

/* 邊線與背景樣式適應 */
.card-bg {
    background-color: var(--code-bg);
}

.modal-bg {
    background-color: var(--bg);
}

.index-badge {
    background-color: var(--border);
    color: var(--text-h);
}

/* 輸入框樣式 */
.theme-input {
    background-color: var(--code-bg);
    border: 1px solid var(--border);
    color: var(--text-h);
}

.theme-input:focus {
    border-color: var(--accent);
}

/* 按鈕樣式 */
.btn-primary {
    background-color: var(--accent);
}

.btn-primary:hover {
    filter: brightness(1.1);
}

.btn-primary:disabled {
    background-color: var(--border);
    color: var(--text);
}

.btn-secondary {
    background-color: var(--code-bg);
    border: 1px solid var(--border);
    color: var(--text-h);
}

.btn-secondary:hover {
    background-color: var(--border);
}

/* 開始對局按鈕 (綠色競技感) */
.btn-start {
    background-color: #10B981;
}

.btn-start:hover {
    background-color: #059669;
}

/* Chips 標籤切換適應 */
.chip-normal {
    background-color: var(--code-bg);
    border-color: var(--border);
    color: var(--text);
}

.chip-selected {
    background-color: var(--accent-bg);
    border-color: var(--accent-border);
    color: var(--accent);
}

.accent-icon {
    color: var(--accent);
}
</style>