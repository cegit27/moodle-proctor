'use client';

import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type ScannedPage } from '@/store/scanStore';
// ── Single sortable page card ───────────────────────────────────────────────
function SortablePageCard({
  page,
  index,
  onDelete,
  onRetake,
}: {
  page: ScannedPage;
  index: number;
  onDelete: () => void;
  onRetake: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group rounded-xl overflow-hidden bg-surface border border-border"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="aspect-[3/4] relative bg-text-muted/10">
          <img
            src={page.thumbnail}
            alt={`Page ${index + 1}`}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Page number badge */}
      <div
        className="absolute top-2 left-2 bg-bg/80 backdrop-blur-sm
        rounded-md px-1.5 py-0.5 font-mono text-xs text-text-primary border border-border/50"
      >
        {index + 1}
      </div>

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 w-6 h-6 rounded-full
        bg-danger/90 text-white flex items-center justify-center
        opacity-0 group-active:opacity-100 focus:opacity-100
        transition-opacity text-xs font-bold shadow-lg"
      >
        ×
      </button>

      {/*  Retake button */}
      <button
        onClick={() => onRetake(page.id)}
        className="absolute bottom-2 right-2 text-xs px-2 py-1 rounded
        bg-blue-600 text-white shadow"
      >
        Retake
      </button>

      {/* Footer */}
      <div className="px-2 py-1.5 bg-surface">
        <p className="text-xs text-text-secondary font-mono truncate">
          pg {String(index + 1).padStart(2, '0')}
        </p>
      </div>
    </div>
  );
}


// ── Sortable grid ───────────────────────────────────────────────────────────
interface SortablePageGridProps {
  pages: ScannedPage[];
  onChange: (pages: ScannedPage[]) => void;
  onDelete: (id: string) => void;
  onRetake: (id: string) => void;   //  added
}

export default function SortablePageGrid({
  pages,
  onChange,
  onDelete,
  onRetake,
}: SortablePageGridProps) {

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 5 },
    })
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);

    onChange(arrayMove(pages, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={pages.map((p) => p.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4">
          {pages.map((page, index) => (
            <SortablePageCard
              key={page.id}
              page={page}
              index={index}
              onDelete={() => onDelete(page.id)}
              onRetake={onRetake}   //  passed here
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}