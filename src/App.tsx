import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { Inspector } from './components/Inspector'
import { AiWorkoutPanel } from './components/AiWorkoutPanel'
import { Palette } from './components/Palette'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { WorkoutChart } from './components/WorkoutChart'
import { useSettings } from './hooks/useSettings'
import { useWorkoutLibrary } from './hooks/useWorkoutLibrary'
import { uid } from './lib/ids'
import { BLOCK_LABELS, createBlock } from './lib/workout'
import { POWER_ZONES } from './lib/zones'
import type { BlockType, Workout, WorkoutBlock } from './types'

function isPaletteId(id: string | number): boolean {
  return String(id).startsWith('palette:')
}

const collision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  const usablePointer = pointerHits.filter((hit) => hit.id !== 'chart-canvas')
  if (usablePointer.length > 0) return usablePointer
  if (pointerHits.length > 0) return pointerHits
  const centers = closestCenter(args).filter((hit) => hit.id !== 'chart-canvas')
  if (centers.length > 0) return centers
  return closestCenter(args)
}

function App() {
  const { settings, setSettings } = useSettings()
  const library = useWorkoutLibrary(settings)
  const { workout, updateWorkout } = library
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<BlockType | null>(null)
  const [dragBlocks, setDragBlocks] = useState<WorkoutBlock[] | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [blockRevealEpoch, setBlockRevealEpoch] = useState(0)
  const skipPaletteClickRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const selected = useMemo(
    () => workout?.blocks.find((block) => block.id === selectedId) ?? null,
    [workout, selectedId],
  )

  const chartWorkout: Workout | null = useMemo(() => {
    if (!workout) return null
    if (!dragBlocks) return workout
    return { ...workout, blocks: dragBlocks }
  }, [workout, dragBlocks])

  useEffect(() => {
    if (!workout) return
    if (selectedId && !workout.blocks.some((block) => block.id === selectedId)) {
      setSelectedId(workout.blocks[0]?.id ?? null)
    }
    if (!selectedId && workout.blocks[0]) {
      setSelectedId(workout.blocks[0].id)
    }
  }, [workout, selectedId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      const undoKey = event.key === 'z' && (event.ctrlKey || event.metaKey) && !event.shiftKey
      const redoKey =
        (event.key === 'z' && (event.ctrlKey || event.metaKey) && event.shiftKey) ||
        (event.key === 'y' && (event.ctrlKey || event.metaKey))

      if (undoKey) {
        event.preventDefault()
        library.undo()
        return
      }
      if (redoKey) {
        event.preventDefault()
        library.redo()
        return
      }

      if (!workout || !selectedId) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        removeBlock(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [workout, selectedId, library])

  function patchWorkout(patch: Partial<Workout>) {
    updateWorkout((current) => ({ ...current, ...patch }))
  }

  function setBlocks(blocks: WorkoutBlock[], nextSelected?: string | null) {
    updateWorkout((current) => ({ ...current, blocks }))
    if (nextSelected !== undefined) setSelectedId(nextSelected)
  }

  function removeBlock(id: string) {
    if (!workout) return
    const blocks = workout.blocks.filter((block) => block.id !== id)
    const index = workout.blocks.findIndex((block) => block.id === id)
    const fallback = blocks[index] ?? blocks[index - 1] ?? null
    setBlocks(blocks, fallback?.id ?? null)
  }

  function duplicateBlock(id: string) {
    if (!workout) return
    const index = workout.blocks.findIndex((block) => block.id === id)
    if (index < 0) return
    const copy = { ...workout.blocks[index], id: uid() } as WorkoutBlock
    const blocks = [...workout.blocks]
    blocks.splice(index + 1, 0, copy)
    setBlocks(blocks, copy.id)
  }

  function changeBlock(id: string, patch: Partial<WorkoutBlock>) {
    updateWorkout((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === id ? ({ ...block, ...patch } as WorkoutBlock) : block,
      ),
    }))
  }

  function onDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.blockType as BlockType | undefined
    setActiveType(type ?? null)
    if (isPaletteId(event.active.id)) {
      skipPaletteClickRef.current = true
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!workout || !over || !isPaletteId(active.id)) return

    const type = active.data.current?.blockType as BlockType
    const previewId = String(active.id)

    setDragBlocks((current) => {
      if (current?.some((block) => block.id === previewId)) return current

      const source = current ?? workout.blocks
      const preview = { ...createBlock(type), id: previewId }
      const overId = String(over.id)
      const insertAt =
        overId === 'chart-canvas' || !source.some((block) => block.id === overId)
          ? source.length
          : source.findIndex((block) => block.id === overId)
      const next = [...source]
      next.splice(Math.max(0, insertAt), 0, preview)
      return next
    })
  }

  function finishPaletteDrag() {
    setActiveType(null)
    setDragBlocks(null)
    window.setTimeout(() => {
      skipPaletteClickRef.current = false
    }, 250)
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!workout) {
      finishPaletteDrag()
      return
    }

    if (isPaletteId(active.id)) {
      if (!over || !dragBlocks) {
        finishPaletteDrag()
        return
      }

      let nextBlocks = dragBlocks
      const overId = String(over.id)
      if (overId !== String(active.id) && dragBlocks.some((block) => block.id === overId)) {
        const oldIndex = dragBlocks.findIndex((block) => block.id === active.id)
        const newIndex = dragBlocks.findIndex((block) => block.id === overId)
        nextBlocks = arrayMove(dragBlocks, oldIndex, newIndex)
      }

      const committedId = uid()
      setBlocks(
        nextBlocks.map((block) =>
          block.id === String(active.id) ? ({ ...block, id: committedId } as WorkoutBlock) : block,
        ),
        committedId,
      )
      finishPaletteDrag()
      return
    }

    setActiveType(null)
    if (!over) return
    if (active.id !== over.id && workout.blocks.some((block) => block.id === over.id)) {
      const oldIndex = workout.blocks.findIndex((block) => block.id === active.id)
      const newIndex = workout.blocks.findIndex((block) => block.id === over.id)
      setBlocks(arrayMove(workout.blocks, oldIndex, newIndex), String(active.id))
    }
  }

  if (!library.ready || !workout || !chartWorkout) {
    return (
      <div className="boot">Loading workouts…</div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finishPaletteDrag}
    >
      <div className="app-shell">
        <Sidebar
          summaries={library.summaries}
          activeId={workout.id}
          globalFtp={settings.ftp}
          onOpen={(id) => void library.openWorkout(id)}
          onNew={() => void library.newWorkout()}
          onOpenSettings={() => setSettingsOpen(true)}
          onDelete={(id) => {
            if (window.confirm('Delete this workout from this browser?')) {
              void library.removeWorkout(id)
            }
          }}
        />

        <div className="main">
          <TopBar
            workout={workout}
            globalFtp={settings.ftp}
            canUndo={library.canUndo}
            canRedo={library.canRedo}
            onUndo={library.undo}
            onRedo={library.redo}
            onApplyGlobalFtp={library.applyFtpToCurrent}
            onImport={(imported) => void library.importWorkout(imported)}
          />
          <Palette
            onAdd={(type) => {
              if (skipPaletteClickRef.current) {
                skipPaletteClickRef.current = false
                return
              }
              const next = createBlock(type)
              setBlocks([...workout.blocks, next], next.id)
            }}
          />
          <AiWorkoutPanel
            workout={workout}
            onLoadingChange={setAiGenerating}
            onApply={({ name, description, blocks }) => {
              updateWorkout((current) => ({
                ...current,
                name,
                description,
                blocks,
              }))
              setBlockRevealEpoch((n) => n + 1)
              setSelectedId(blocks[0]?.id ?? null)
            }}
          />
          <WorkoutChart
            workout={chartWorkout}
            selectedId={selectedId}
            onSelect={setSelectedId}
            isGenerating={aiGenerating}
            revealEpoch={blockRevealEpoch}
          />
          <ul className="zone-legend">
            {POWER_ZONES.map((zone) => (
              <li key={zone.id}>
                <i style={{ background: zone.color }} />
                {zone.short}
              </li>
            ))}
          </ul>
        </div>

        <Inspector
          workout={workout}
          globalFtp={settings.ftp}
          selected={selected}
          onChangeMeta={(patch) => patchWorkout(patch)}
          onChangeBlock={changeBlock}
          onDuplicate={duplicateBlock}
          onRemove={removeBlock}
          onApplyGlobalFtp={library.applyFtpToCurrent}
        />
      </div>

      <SettingsPanel
        settings={settings}
        workoutFtp={workout.ftp}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChange={setSettings}
        onApplyCurrent={() => {
          library.applyFtpToCurrent()
        }}
        onApplyAll={() => {
          void library.applyFtpToAll()
        }}
      />

      <DragOverlay>
        {activeType ? (
          <div className={`drag-ghost type-${activeType}`}>{BLOCK_LABELS[activeType]}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export default App
