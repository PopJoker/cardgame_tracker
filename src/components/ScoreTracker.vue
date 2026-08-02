<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { usePlayersStore } from '../stores/usePlayersStore'
import { useGameStore } from '../stores/useGameStore'
import { useWakeLock } from '../composables/useWakeLock'
import HistoryModal from './HistoryModal.vue'

const isHistoryOpen = ref(false)

const emit = defineEmits<{
    (e: 'exit-game'): void
}>()

const playersStore = usePlayersStore()
const gameStore = useGameStore()
const { isSupported: isWakeLockSupported, isLocked: isWakeLockActive, requestWakeLock, releaseWakeLock } = useWakeLock()

const handleExitGame = () => {
    // 單純拋出事件通知 App.vue 使用者想結束遊戲
    // 不要在此處直接呼叫 startNewGame() 避免重複執行
    emit('exit-game')
}

// 當前對局玩家清單
const activePlayers = computed(() => {
    return gameStore.activePlayerIds
        .map(id => playersStore.players.find(p => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
})

// 當焦點勝者
const winnerId = ref<string>('')

// 當前回合輸家的扣點數（儲存非負整數，UI與計算時再轉為負數）
const roundLoserPoints = ref<Record<string, number>>({})

// 初始化回合點數
const initRoundScores = () => {
    const points: Record<string, number> = {}
    gameStore.activePlayerIds.forEach(id => {
        points[id] = 0
    })
    roundLoserPoints.value = points

    if (gameStore.activePlayerIds.length > 0 && !winnerId.value) {
        winnerId.value = gameStore.activePlayerIds[0]
    }
}

watch(() => gameStore.activePlayerIds, () => {
    initRoundScores()
}, { immediate: true })

// 動態計算勝者本局可獲得的總分 (所有輸家失分之和)
const calculatedWinnerGain = computed(() => {
    return Object.entries(roundLoserPoints.value).reduce((sum, [pId, pts]) => {
        if (pId === winnerId.value) return sum
        return sum + (Number(pts) || 0)
    }, 0)
})

// 切換勝者時，將該勝者失分歸零
const selectWinner = (pId: string) => {
    winnerId.value = pId
    roundLoserPoints.value[pId] = 0
}

// 快速微調輸家失分（確保不低於 0）
const adjustScore = (pId: string, delta: number) => {
    const current = Number(roundLoserPoints.value[pId]) || 0
    roundLoserPoints.value[pId] = Math.max(0, current + delta)
}

// 手動輸入分數時的防呆處理
const handleInput = (pId: string, event: Event) => {
    const target = event.target as HTMLInputElement
    const rawVal = target.value.replace(/[^0-9]/g, '') // 僅保留數字
    const val = parseInt(rawVal, 10)
    roundLoserPoints.value[pId] = isNaN(val) ? 0 : val
}

// 防重複提交
const isSubmitting = ref(false)

// 結算本局：將輸家轉為負數，勝者賦予總和正數
const handleSubmitRound = () => {
    if (!winnerId.value || isSubmitting.value) return

    isSubmitting.value = true

    const finalRoundScores: Record<string, number> = {}

    gameStore.activePlayerIds.forEach(id => {
        if (id === winnerId.value) {
            finalRoundScores[id] = calculatedWinnerGain.value // 勝者贏得總分
        } else {
            const pts = Number(roundLoserPoints.value[id]) || 0
            finalRoundScores[id] = -Math.abs(pts) // 輸家扣分 (必定為負數或 0)
        }
    })

    // 寫入 Store
    gameStore.recordRound(winnerId.value, finalRoundScores)

    // 重置下一回合
    initRoundScores()

    setTimeout(() => {
        isSubmitting.value = false
    }, 400)
}

// 撤銷上一局 (Undo)
const handleUndo = () => {
    gameStore.undoLastRound()
}

const toggleWakeLock = () => {
    if (isWakeLockActive.value) {
        releaseWakeLock()
    } else {
        requestWakeLock()
    }
}

onMounted(() => {
    requestWakeLock()
})

</script>

<template>
    <div class="max-w-md mx-auto space-y-5 pb-12">
        <!-- Top Bar -->
        <header class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-mono uppercase tracking-widest text-indigo-400">Round {{
                        gameStore.historyStack.length + 1 }}</span>

                    <!-- Wake Lock Status Indicator -->
                    <button v-if="isWakeLockSupported" type="button" @click="toggleWakeLock" :class="[
                        'text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 transition-all border',
                        isWakeLockActive
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                    ]" title="點擊切換螢幕常亮">
                        <!-- Sun Icon -->
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                        </svg>
                        <span>{{ isWakeLockActive ? '常亮中' : '常亮已關' }}</span>
                    </button>
                </div>
                <h2 class="text-lg font-semibold text-slate-100">回合記分板</h2>
            </div>

            <div class="flex items-center gap-1.5">
                <!-- 歷史紀錄按鈕 -->
                <button type="button" @click="isHistoryOpen = true"
                    class="bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/80 p-2 rounded-xl text-xs font-medium min-h-[40px] min-w-[40px] flex items-center justify-center active:scale-95 transition-all"
                    title="對局歷程與備份">
                    <!-- Clock / History Icon -->
                    <svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                </button>

                <!-- Undo Button -->
                <button type="button" @click="handleUndo" :disabled="gameStore.historyStack.length === 0"
                    class="bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-40 text-slate-300 border border-slate-700/80 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 min-h-[40px] active:scale-95 transition-all">
                    <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                    </svg>
                    <span>復原</span>
                </button>

                <!-- Exit Button -->
                <button type="button" @click="handleExitGame"
                    class="bg-slate-800/80 hover:bg-slate-700/80 text-rose-400 border border-slate-700/80 px-3 py-2 rounded-xl text-xs font-medium min-h-[40px] active:scale-95 transition-all">
                    結束
                </button>
            </div>
        </header>

        <!-- 玩家卡片列表 -->
        <section class="space-y-3">
            <div v-for="player in activePlayers" :key="player.id" :class="[
                'rounded-2xl p-4 transition-all border',
                winnerId === player.id
                    ? 'bg-indigo-950/40 border-indigo-500/80 shadow-lg shadow-indigo-950/30'
                    : 'bg-slate-800/70 border-slate-700/60'
            ]">
                <!-- Row 1: 玩家狀態與總分 -->
                <div class="flex items-center justify-between gap-2 mb-3">
                    <div class="flex items-center gap-2.5">
                        <button type="button" @click="selectWinner(player.id)" :class="[
                            'w-6 h-6 rounded-full border flex items-center justify-center transition-all min-h-[32px] min-w-[32px]',
                            winnerId === player.id
                                ? 'bg-indigo-600 border-indigo-400 text-white'
                                : 'border-slate-600 bg-slate-900/50 hover:border-slate-500'
                        ]">
                            <svg v-if="winnerId === player.id" class="w-4 h-4" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3"
                                    d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                        </button>
                        <span class="font-semibold text-slate-100 text-base">{{ player.name }}</span>
                        <span v-if="winnerId === player.id"
                            class="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">
                            勝者
                        </span>
                    </div>

                    <div class="text-right">
                        <span class="text-xs text-slate-400 block">累積得分</span>
                        <span class="font-mono font-bold text-base text-slate-200">
                            {{ gameStore.currentScores[player.id] || 0 }}
                        </span>
                    </div>
                </div>

                <!-- 勝者顯示：預計贏得總點數 -->
                <div v-if="winnerId === player.id"
                    class="pt-2 border-t border-indigo-500/30 flex items-center justify-between text-xs">
                    <span class="text-indigo-300 font-medium">本局進帳 (全場失分和)</span>
                    <span class="font-mono font-bold text-emerald-400 text-sm">+{{ calculatedWinnerGain }}</span>
                </div>

                <!-- 輸家顯示：罰分/失分輸入 -->
                <div v-else class="space-y-2 pt-1 border-t border-slate-700/50">
                    <div class="flex items-center justify-between gap-3">
                        <label class="text-xs font-medium text-rose-400">本局失分</label>
                        <div class="relative flex items-center">
                            <span
                                class="absolute left-3 text-rose-400 font-mono font-bold text-base pointer-events-none">-</span>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" :value="roundLoserPoints[player.id]"
                                @input="handleInput(player.id, $event)"
                                class="w-28 bg-slate-900 border border-slate-700 rounded-xl pl-7 pr-3 py-2 text-right font-mono text-base text-rose-300 focus:outline-none focus:border-rose-500 min-h-[44px]" />
                        </div>
                    </div>

                    <!-- 微調按鈕 (加減輸家的失分) -->
                    <div class="grid grid-cols-4 gap-1.5 pt-1">
                        <button type="button" @click="adjustScore(player.id, -5)"
                            class="bg-slate-900/90 hover:bg-slate-900 text-slate-300 border border-slate-700/80 rounded-xl py-2.5 text-xs font-mono font-medium min-h-[48px] active:scale-95 transition-all">
                            -5
                        </button>
                        <button type="button" @click="adjustScore(player.id, -1)"
                            class="bg-slate-900/90 hover:bg-slate-900 text-slate-300 border border-slate-700/80 rounded-xl py-2.5 text-xs font-mono font-medium min-h-[48px] active:scale-95 transition-all">
                            -1
                        </button>
                        <button type="button" @click="adjustScore(player.id, 1)"
                            class="bg-slate-900/90 hover:bg-slate-900 text-slate-300 border border-slate-700/80 rounded-xl py-2.5 text-xs font-mono font-medium min-h-[48px] active:scale-95 transition-all">
                            +1
                        </button>
                        <button type="button" @click="adjustScore(player.id, 5)"
                            class="bg-slate-900/90 hover:bg-slate-900 text-slate-300 border border-slate-700/80 rounded-xl py-2.5 text-xs font-mono font-medium min-h-[48px] active:scale-95 transition-all">
                            +5
                        </button>
                    </div>
                </div>
            </div>
        </section>

        <!-- 結算按鈕 -->
        <div class="pt-3">
            <button type="button" @click="handleSubmitRound" :disabled="!winnerId || isSubmitting"
                class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-base py-4 rounded-xl shadow-lg shadow-indigo-950/50 min-h-[56px] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span>結算本局點數</span>
            </button>
        </div>
        <HistoryModal v-if="isHistoryOpen" @close="isHistoryOpen = false" />
    </div>
</template>