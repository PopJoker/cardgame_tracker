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
    <div v-if="isOpen"
        class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div
            class="bg-slate-900 border border-slate-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/90">
                <div>
                    <h3 class="text-lg font-bold text-slate-100">導入資料人名對接</h3>
                    <p class="text-xs text-slate-400 mt-0.5">請確認匯入的 {{ conflicts.length }} 位玩家如何處理</p>
                </div>
                <button @click="emit('close')"
                    class="text-slate-400 hover:text-slate-200 p-2 text-xl min-w-[44px] min-h-[44px]">✕</button>
            </div>

            <!-- Conflict List -->
            <div class="p-4 overflow-y-auto space-y-4 flex-1">
                <div v-for="conflict in conflicts" :key="conflict.importedName"
                    class="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="font-semibold text-indigo-300 text-base">匯入人名：{{ conflict.importedName }}</span>
                        <span v-if="conflict.suggestedMatchId"
                            class="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                            發現同名玩家
                        </span>
                    </div>

                    <!-- Action Selectors -->
                    <div v-if="decisions[conflict.importedName]" class="space-y-2">
                        <div class="grid grid-cols-3 gap-1.5 bg-slate-900/60 p-1 rounded-lg">
                            <button type="button" @click="decisions[conflict.importedName].action = 'merge'"
                                :disabled="existingPlayers.length === 0" :class="[
                                    'py-2 px-1 text-xs font-medium rounded-md transition-all min-h-[40px]',
                                    decisions[conflict.importedName].action === 'merge'
                                        ? 'bg-indigo-600 text-white shadow'
                                        : 'text-slate-400 hover:text-slate-200'
                                ]">
                                併入現有
                            </button>
                            <button type="button" @click="decisions[conflict.importedName].action = 'create'" :class="[
                                'py-2 px-1 text-xs font-medium rounded-md transition-all min-h-[40px]',
                                decisions[conflict.importedName].action === 'create'
                                    ? 'bg-emerald-600 text-white shadow'
                                    : 'text-slate-400 hover:text-slate-200'
                            ]">
                                新增玩家
                            </button>
                            <button type="button" @click="decisions[conflict.importedName].action = 'rename'" :class="[
                                'py-2 px-1 text-xs font-medium rounded-md transition-all min-h-[40px]',
                                decisions[conflict.importedName].action === 'rename'
                                    ? 'bg-amber-600 text-white shadow'
                                    : 'text-slate-400 hover:text-slate-200'
                            ]">
                                重命名
                            </button>
                        </div>

                        <!-- Merge Option: Select existing player -->
                        <div v-if="decisions[conflict.importedName].action === 'merge'" class="mt-2">
                            <select v-model="decisions[conflict.importedName].targetId"
                                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 min-h-[44px]">
                                <option value="" disabled>選擇要對接的現有玩家...</option>
                                <option v-for="p in existingPlayers" :key="p.id" :value="p.id">
                                    {{ p.name }} (舊局數: {{ p.totalGames }})
                                </option>
                            </select>
                        </div>

                        <!-- Rename Option: Input new name -->
                        <div v-if="decisions[conflict.importedName].action === 'rename'" class="mt-2">
                            <input v-model="decisions[conflict.importedName].newName" type="text" placeholder="輸入新姓名..."
                                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 min-h-[44px]" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Footer -->
            <div class="p-4 border-t border-slate-800 bg-slate-900 flex gap-3">
                <button @click="emit('close')"
                    class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl min-h-[48px]">
                    取消
                </button>
                <button @click="handleConfirm"
                    class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl min-h-[48px] shadow-lg active:scale-95 transition-all">
                    確認對接並匯入
                </button>
            </div>
        </div>
    </div>
</template>