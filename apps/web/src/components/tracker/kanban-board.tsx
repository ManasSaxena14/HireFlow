'use client';

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { TRACKER_STATUSES, type TrackedApplication, type TrackerStatus } from '@hireflow/shared';
import { clsx } from 'clsx';
import { GripVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { timeAgo } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/tracker';

function CardBody({ application }: { application: TrackedApplication }) {
  return (
    <>
      <p className="truncate text-[13px] text-muted">{application.companyName}</p>
      {application.location && (
        <p className="mt-0.5 truncate text-xs text-subtle">{application.location}</p>
      )}
      {application.tags.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1">
          {application.tags.slice(0, 3).map((tag) => (
            <li
              key={tag}
              className="rounded-control bg-overlay px-1.5 py-0.5 text-[11px] text-muted"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Card({
  application,
  onOpen,
  onMove,
}: {
  application: TrackedApplication;
  onOpen: (id: string) => void;
  onMove: (id: string, status: TrackerStatus) => void;
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: application.id,
    data: { status: application.status },
  });

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      data-testid="board-card"
      className={clsx(
        'group touch-manipulation rounded-control border border-line bg-raised p-3 transition-colors hover:border-line-strong',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => onOpen(application.id)}
          className="min-w-0 flex-1 text-left text-sm leading-snug font-medium hover:text-accent"
        >
          {application.title}
        </button>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          aria-label={`Drag ${application.title}`}
          className="-mt-0.5 -mr-1 grid size-6 shrink-0 cursor-grab place-items-center rounded-control text-subtle opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
      </div>
      <div className="mt-1">
        <CardBody application={application} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] whitespace-nowrap text-subtle">
          {timeAgo(application.updatedAt)}
        </span>
        <label className="min-w-0">
          <span className="sr-only">Move {application.title} to</span>
          <select
            value={application.status}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onChange={(event) => onMove(application.id, event.target.value as TrackerStatus)}
            className="max-w-24 rounded-control border border-transparent bg-transparent py-0.5 text-right text-xs text-muted hover:border-line-strong focus:border-line-strong"
          >
            {TRACKER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </li>
  );
}

function Column({
  status,
  items,
  onOpen,
  onMove,
}: {
  status: TrackerStatus;
  items: TrackedApplication[];
  onOpen: (id: string) => void;
  onMove: (id: string, status: TrackerStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[status]}
      data-testid={`column-${status}`}
      className={clsx(
        'flex w-68 shrink-0 snap-start flex-col rounded-panel border bg-sunken transition-colors',
        isOver ? 'border-accent' : 'border-line',
      )}
    >
      <h2 className="flex items-center justify-between px-3 py-2.5 text-[13px] font-medium">
        {STATUS_LABELS[status]}
        <span className="font-mono text-xs text-subtle">{items.length}</span>
      </h2>
      <ul className="flex min-h-24 flex-1 flex-col gap-2 p-2 pt-0">
        {items.map((application) => (
          <Card key={application.id} application={application} onOpen={onOpen} onMove={onMove} />
        ))}
      </ul>
    </section>
  );
}

export function KanbanBoard({
  applications,
  onOpen,
  onMove,
}: {
  applications: TrackedApplication[];
  onOpen: (id: string) => void;
  onMove: (id: string, status: TrackerStatus) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    // A small threshold keeps a plain click on a card from starting a drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch screens a swipe scrolls the board, and a long press picks the card up.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => {
    const grouped = new Map<TrackerStatus, TrackedApplication[]>(
      TRACKER_STATUSES.map((status) => [status, []]),
    );
    for (const application of applications) grouped.get(application.status)?.push(application);
    return grouped;
  }, [applications]);

  const active = applications.find((application) => application.id === activeId);

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));
  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null);
    const target = over?.id as TrackerStatus | undefined;
    if (target && dragged.data.current?.status !== target) onMove(String(dragged.id), target);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex snap-x gap-3 overflow-x-auto pb-4">
        {TRACKER_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            items={columns.get(status) ?? []}
            onOpen={onOpen}
            onMove={onMove}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="w-64 rotate-1 rounded-control border border-line-strong bg-overlay p-3 shadow-xl shadow-black/40">
            <p className="text-sm leading-snug font-medium">{active.title}</p>
            <div className="mt-1">
              <CardBody application={active} />
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
