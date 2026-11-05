'use client';

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { TRACKER_STATUSES, type TrackedApplication, type TrackerStatus } from '@hireflow/shared';
import { clsx } from 'clsx';
import { GripVertical, MapPin } from 'lucide-react';
import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { avatarColor, timeAgo } from '@/lib/format';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/tracker';
import { useCardFlights } from './use-card-flights';

function CompanyAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="font-display grid size-10 shrink-0 place-items-center rounded-xl text-lg font-extrabold text-on-accent"
      style={{ background: avatarColor(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function CardExtras({ application }: { application: TrackedApplication }) {
  return (
    <>
      {application.location && (
        <p className="mt-3 flex items-center gap-1.5 truncate text-[13px] text-muted">
          <MapPin aria-hidden className="size-3.5 shrink-0" />
          {application.location}
        </p>
      )}
      {application.tags.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {application.tags.slice(0, 3).map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-overlay px-2.5 py-0.5 text-xs font-medium text-muted"
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
  index,
  onOpen,
  onMove,
}: {
  application: TrackedApplication;
  index: number;
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
      data-card-id={application.id}
      data-card-status={application.status}
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
      className={clsx(
        'group card-lift animate-card-in touch-manipulation select-none rounded-2xl border border-line bg-raised p-3.5 hover:border-(--status)',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex items-start gap-3">
        <CompanyAvatar name={application.companyName} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen(application.id)}
            className="block w-full text-left text-[15px] leading-snug font-bold hover:text-accent"
          >
            {application.title}
          </button>
          <p className="mt-0.5 truncate text-[13px] text-muted">{application.companyName}</p>
        </div>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          aria-label={`Drag ${application.title}`}
          className="-mt-1 -mr-1.5 grid size-7 shrink-0 cursor-grab place-items-center rounded-control text-subtle opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      </div>
      <CardExtras application={application} />
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="text-xs whitespace-nowrap text-subtle">
          {timeAgo(application.updatedAt)}
        </span>
        <label className="min-w-0">
          <span className="sr-only">Move {application.title} to</span>
          <select
            value={application.status}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onChange={(event) => onMove(application.id, event.target.value as TrackerStatus)}
            className="max-w-28 rounded-md border border-transparent bg-transparent py-0.5 text-right text-xs font-semibold text-muted hover:border-line-strong focus:border-line-strong"
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
  index,
  items,
  dragging,
  onOpen,
  onMove,
}: {
  status: TrackerStatus;
  index: number;
  dragging: boolean;
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
      style={
        {
          '--status': STATUS_COLORS[status],
          animationDelay: `${index * 55}ms`,
        } as CSSProperties
      }
      className={clsx(
        'animate-fade-up flex min-h-[60dvh] min-w-72 flex-1 flex-col max-lg:snap-start overflow-hidden rounded-[20px] border bg-sunken/80 transition lg:min-h-0 lg:min-w-52',
        isOver ? 'border-(--status) ring-3 ring-(--status)/30' : 'border-line',
      )}
    >
      <div aria-hidden className="h-1.5 shrink-0 bg-(--status)" />
      <h2 className="flex shrink-0 items-center justify-between px-4 py-3.5 text-[15px] font-bold">
        {STATUS_LABELS[status]}
        <span
          key={items.length}
          className="animate-pop grid h-6 min-w-6 place-items-center rounded-full bg-overlay px-1.5 text-xs font-bold text-(--status)"
        >
          {items.length}
        </span>
      </h2>
      <ul className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 pt-0">
        {items.map((application, position) => (
          <Card
            key={application.id}
            application={application}
            index={position}
            onOpen={onOpen}
            onMove={onMove}
          />
        ))}
        {dragging && isOver && (
          <li
            aria-hidden
            className="animate-card-in grid min-h-20 place-items-center rounded-2xl border-2 border-dashed border-(--status) text-[13px] font-semibold text-(--status)"
          >
            Drop here
          </li>
        )}
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
  const boardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const launch = useCardFlights(boardRef, (status) => {
    if (status === 'offer') toast('Well done! You got an offer.');
  });
  const moveWithFlight = (id: string, status: TrackerStatus, from?: DOMRect) => {
    launch(id, status, from);
    onMove(id, status);
  };
  const sensors = useSensors(
    // A card only starts to drag after a small move, so a normal click still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On a phone, a swipe scrolls the board and a long press picks up the card.
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
    if (target && dragged.data.current?.status !== target) {
      moveWithFlight(String(dragged.id), target, overlayRef.current?.getBoundingClientRect());
    }
  };

  return (
    <DndContext
      sensors={sensors}
      // The card drops into the column under the pointer, and the board only scrolls
      // when the pointer is close to its edge.
      collisionDetection={pointerWithin}
      autoScroll={{
        threshold: { x: 0.08, y: 0.1 },
        acceleration: 6,
        layoutShiftCompensation: false,
      }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        ref={boardRef}
        data-board
        className="flex h-full gap-3 overflow-x-auto pb-1 max-lg:snap-x"
      >
        {TRACKER_STATUSES.map((status, index) => (
          <Column
            key={status}
            status={status}
            index={index}
            dragging={active !== undefined && active.status !== status}
            items={columns.get(status) ?? []}
            onOpen={onOpen}
            onMove={moveWithFlight}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div
            ref={overlayRef}
            className="animate-lift w-72 rounded-2xl border border-accent bg-overlay p-3.5 shadow-2xl shadow-black/60"
          >
            <div className="flex items-center gap-3">
              <CompanyAvatar name={active.companyName} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{active.title}</p>
                <p className="truncate text-[13px] text-muted">{active.companyName}</p>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
