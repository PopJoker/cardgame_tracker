<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Player } from '../types/game'
import type { NameConflict } from '../utils/importHandler'

const props = defineProps<{
    isOpen: boolean
    conflicts: NameConflict[]
    existingPlayers: Player[]
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', mappingResult: Map<string, { action: 'merge' | 'create' | 'rename', targetId?: string, newName?: string }>): void
}>()

// 紀錄每個匯入玩家的處理策略
// Key: importedName
const decisions = ref<Record<string, {
    action: 'merge' | 'create' | 'rename'
    targetId: string
    newName: string
}>>({})

watch(() => props.conflicts, (newConflicts) => {
    const initialDecisions: typeof decisions.value = {}
    newConflicts.forEach(c => {
        if (c.suggestedMatchId) {
            initialDecisions[c.importedName] = {
                action: 'merge',
                targetId: c.suggestedMatchId,
                newName: c.importedName
            }
        } else {
            initialDecisions[c.importedName] = {
                action: 'create',
                targetId: '',
                newName: c.importedName
            }
        }
    })
    decisions.value = initialDecisions
}, { immediate: true })

const handleConfirm = () => {
    const resultMap = new Map()
    Object.entries(decisions.value).forEach(([importedName, decision]) => {
        resultMap.set(importedName, decision)
    })
    emit('confirm', resultMap)
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
                class="modal-content modal-bg border header-border w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden relative transition-colors duration-300">

                <!-- Modal Header -->
                <header class="p-4 border-b header-border flex justify-between items-center card-bg shrink-0">
                    <div>
                        <h3 class="text-base font-bold text-main">導入資料人名對接</h3>
                        <p class="text-xs text-sub mt-0.5">請確認匯入的 {{ conflicts.length }} 位玩家如何處理</p>
                    </div>
                    <button type="button" @click="emit('close')"
                        class="text-sub hover:text-main p-2 text-xl min-w-[44px] min-h-[44px] rounded-lg transition-colors flex items-center justify-center">
                        ✕
                    </button>
                </header>

                <!-- Conflict List (Scrollable) -->
                <div class="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
                    <div v-for="conflict in conflicts" :key="conflict.importedName"
                        class="card-bg border header-border rounded-xl p-3.5 space-y-3 shadow-sm">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-indigo-500 text-sm">匯入人名：{{ conflict.importedName }}</span>
                            <span v-if="conflict.suggestedMatchId"
                                class="text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                發現同名玩家
                            </span>
                        </div>

                        <!-- Action Selectors -->
                        <div v-if="decisions[conflict.importedName]" class="space-y-2">
                            <div class="grid grid-cols-3 gap-1.5 modal-bg p-1 rounded-lg border header-border">
                                <button type="button" @click="decisions[conflict.importedName].action = 'merge'"
                                    :disabled="existingPlayers.length === 0" :class="[
                                        'py-2 px-1 text-xs font-semibold rounded-md transition-all min-h-[40px]',
                                        decisions[conflict.importedName].action === 'merge'
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : 'text-sub hover:text-main disabled:opacity-40'
                                    ]">
                                    併入現有
                                </button>
                                <button type="button" @click="decisions[conflict.importedName].action = 'create'"
                                    :class="[
                                        'py-2 px-1 text-xs font-semibold rounded-md transition-all min-h-[40px]',
                                        decisions[conflict.importedName].action === 'create'
                                            ? 'bg-emerald-600 text-white shadow-md'
                                            : 'text-sub hover:text-main'
                                    ]">
                                    新增玩家
                                </button>
                                <button type="button" @click="decisions[conflict.importedName].action = 'rename'"
                                    :class="[
                                        'py-2 px-1 text-xs font-semibold rounded-md transition-all min-h-[40px]',
                                        decisions[conflict.importedName].action === 'rename'
                                            ? 'bg-amber-600 text-white shadow-md'
                                            : 'text-sub hover:text-main'
                                    ]">
                                    重命名
                                </button>
                            </div>

                            <!-- Merge Option: Select existing player -->
                            <div v-if="decisions[conflict.importedName].action === 'merge'" class="mt-2">
                                <select v-model="decisions[conflict.importedName].targetId"
                                    class="w-full modal-bg border header-border rounded-lg px-3 py-2 text-xs text-main focus:outline-none focus:border-indigo-500 min-h-[44px]">
                                    <option value="" disabled>選擇要對接的現有玩家...</option>
                                    <option v-for="p in existingPlayers" :key="p.id" :value="p.id">
                                        {{ p.name }} (舊局數: {{ p.totalGames }})
                                    </option>
                                </select>
                            </div>

                            <!-- Rename Option: Input new name -->
                            <div v-if="decisions[conflict.importedName].action === 'rename'" class="mt-2">
                                <input v-model="decisions[conflict.importedName].newName" type="text"
                                    placeholder="輸入新姓名..."
                                    class="w-full modal-bg border header-border rounded-lg px-3 py-2 text-xs text-main focus:outline-none focus:border-indigo-500 min-h-[44px]" />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modal Footer -->
                <footer class="p-4 border-t header-border card-bg flex gap-3 shrink-0">
                    <button type="button" @click="emit('close')"
                        class="flex-1 card-bg hover:opacity-80 text-main font-semibold py-3 rounded-xl min-h-[48px] border header-border transition-all">
                        取消
                    </button>
                    <button type="button" @click="handleConfirm"
                        class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl min-h-[48px] shadow-md active:scale-95 transition-all">
                        確認對接並匯入
                    </button>
                </footer>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* 1. 彈窗主體背景：跟隨全域深淺色背景 (var(--bg)) */
.modal-bg {
    background-color: var(--bg);
}

/* 2. 內部卡片與區塊背景 (var(--code-bg)) */
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

/* 主彈窗淡入淡出與縮放動畫 */
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