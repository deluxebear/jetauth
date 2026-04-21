import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

interface SortableListProps<T> {
  items: T[];
  getId: (item: T, index: number) => string;
  onReorder: (newOrder: T[]) => void;
  renderItem: (item: T, index: number, dragHandle: ReactNode) => ReactNode;
  disabled?: boolean;
}

/**
 * Vertical drag-sort wrapper. Consumer supplies:
 *   - items + getId (stable id per item, typically its name/index)
 *   - onReorder callback that receives the new array
 *   - renderItem that wraps each row; receives a `dragHandle` node to
 *     place wherever makes sense (typically in the row's left gutter)
 *
 * Keyboard support: arrow keys move items while the drag handle is
 * focused. Announces reorder via aria-live (handled by @dnd-kit).
 */
export default function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  disabled = false,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it, i) => getId(it, i) === active.id);
    const newIndex = items.findIndex((it, i) => getId(it, i) === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  const ids = items.map((it, i) => getId(it, i));

  if (disabled) {
    return (
      <>
        {items.map((it, i) => (
          <div key={ids[i]}>{renderItem(it, i, null)}</div>
        ))}
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((it, i) => (
          <SortableRow key={ids[i]} id={ids[i]}>
            {(dragHandle) => renderItem(it, i, dragHandle)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className="cursor-grab active:cursor-grabbing p-1 text-text-muted hover:text-text-secondary touch-none"
    >
      <GripVertical size={14} />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}
