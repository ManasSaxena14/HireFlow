'use client';

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { AtsApplication, PipelineStage } from '@hireflow/shared';
import { clsx } from 'clsx';
import { GripVertical, Star } from 'lucide-react';
import Link from 'next/link';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useCardFlights } from '@/components/tracker/use-card-flights';
import { useToast } from '@/components/ui/toast';
import { KIND_COLORS } from '@/lib/ats';
import { avatarColor, timeAgo } from '@/lib/format';
import { setBoardBusy } from '@/lib/live';

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="font-display grid size-9 shrink-0 place-items-center rounded-xl text-base font-extrabold text-on-accent"
      style={{ background: avatarColor(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

interface BoardActions {
  cid: string;
  stages: PipelineStage[];
  canMove: boolean;
  onMove: (application: AtsApplication, stage: PipelineStage, from?: DOMRect) => void;
}

function Card({
  application,
  index,
  actions: { cid, stages, canMove, onMove },
}: {
  application: AtsApplication;
  index: number;
  actions: BoardActions;
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: application.id,
    data: { stageId: application.stageId },
    disabled: !canMove,
  });
  const name = application.candidate.fullName;

  return (
    <li
      ref={setNodeRef}
      {...(canMove ? listeners : {})}
      data-testid="pipeline-card"
      data-card-id={application.id}
      data-card-status={application.stageId}
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
      className={clsx(
        'group card-lift animate-card-in relative touch-manipulation select-none rounded-2xl border border-line bg-raised p-3 hover:border-(--status)',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/company/${cid}/candidates/${application.id}`}
            className="block text-[15px] leading-snug font-bold break-words hover:text-accent"
          >
            {name}
          </Link>
          <p className="mt-0.5 truncate text-[13px] text-muted">{application.candidate.email}</p>
        </div>
      </div>
      {canMove && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          aria-label={`Drag ${name}`}
          className="absolute top-1.5 right-1.5 grid size-7 cursor-grab place-items-center rounded-control bg-raised text-subtle opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      )}
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="flex items-center justify-between gap-2 text-xs whitespace-nowrap text-subtle">
          {timeAgo(application.appliedAt)}
          {application.score !== null && (
            <span className="flex items-center gap-1 font-bold text-status-screening">
              <Star aria-hidden className="size-3 fill-current" />
              {application.score.toFixed(1)}
              <span className="sr-only"> out of 5</span>
            </span>
          )}
        </p>
        {canMove && (
          <label className="mt-2 block">
            <span className="sr-only">Move {name} to</span>
            <select
              value={application.stageId}
              onMouseDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onChange={(event) => {
                const stage = stages.find(({ id }) => id === event.target.value);
                if (stage) onMove(application, stage);
              }}
              className="h-8 w-full rounded-lg border border-line bg-sunken/70 px-2 text-xs font-semibold text-muted transition hover:border-line-strong focus:border-line-strong"
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </li>
  );
}

function Column({
  stage,
  index,
  items,
  dragging,
  actions,
}: {
  stage: PipelineStage;
  index: number;
  items: AtsApplication[];
  dragging: boolean;
  actions: BoardActions;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: !actions.canMove });

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      style={
        {
          '--status': KIND_COLORS[stage.kind],
          animationDelay: `${index * 55}ms`,
        } as CSSProperties
      }
      className={clsx(
        'animate-fade-up flex min-h-[60dvh] min-w-72 flex-1 flex-col overflow-hidden rounded-[20px] border bg-sunken/80 transition max-lg:snap-start lg:min-h-0 lg:min-w-52',
        isOver ? 'border-(--status) ring-3 ring-(--status)/30' : 'border-line',
      )}
    >
      <div aria-hidden className="h-1.5 shrink-0 bg-(--status)" />
      <h2 className="flex shrink-0 items-center justify-between gap-2 px-4 py-3.5 text-[15px] font-bold">
        <span className="truncate">{stage.name}</span>
        <span
          key={items.length}
          className="animate-pop grid h-6 min-w-6 place-items-center rounded-full bg-overlay px-1.5 text-xs font-bold text-(--status)"
        >
          {items.length}
        </span>
      </h2>
      <ul className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 pt-0">
        {items.map((application, position) => (
          <Card key={application.id} application={application} index={position} actions={actions} />
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

export function PipelineBoard({
  cid,
  stages,
  applications,
  canMove,
  onMove,
  flightRef,
}: {
  cid: string;
  stages: PipelineStage[];
  applications: AtsApplication[];
  canMove: boolean;
  /** Return false when the move is waiting on a question, such as the reason for a "no". */
  onMove: (application: AtsApplication, stage: PipelineStage) => boolean;
  /** Lets the page start a flight when a move goes through later on. */
  flightRef: { current: ((id: string, stageId: string) => void) | null };
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const hiredStages = useMemo(
    () => new Set(stages.filter((stage) => stage.kind === 'hired').map((stage) => stage.id)),
    [stages],
  );
  const launch = useCardFlights(
    boardRef,
    (stageId) => {
      if (hiredStages.has(stageId)) toast('Great news! You made a hire.');
    },
    (stageId) => hiredStages.has(stageId),
  );
  flightRef.current = launch;

  const move = (application: AtsApplication, stage: PipelineStage, from?: DOMRect) => {
    const start =
      from ??
      boardRef.current
        ?.querySelector<HTMLElement>(`[data-card-id="${application.id}"]`)
        ?.getBoundingClientRect();
    if (onMove(application, stage)) launch(application.id, stage.id, start);
  };
  const actions: BoardActions = { cid, stages, canMove, onMove: move };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => {
    const grouped = new Map<string, AtsApplication[]>(stages.map((stage) => [stage.id, []]));
    for (const application of applications) grouped.get(application.stageId)?.push(application);
    return grouped;
  }, [stages, applications]);

  const active = applications.find((application) => application.id === activeId);

  // Pause the live refresh while a card is held, so nothing jumps in the person's hand.
  useEffect(() => {
    setBoardBusy(activeId !== null);
    return () => setBoardBusy(false);
  }, [activeId]);

  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null);
    const stage = stages.find(({ id }) => id === over?.id);
    const application = applications.find(({ id }) => id === dragged.id);
    if (stage && application && application.stageId !== stage.id) {
      move(application, stage, overlayRef.current?.getBoundingClientRect());
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      autoScroll={{
        threshold: { x: 0.08, y: 0.1 },
        acceleration: 6,
        layoutShiftCompensation: false,
      }}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div ref={boardRef} className="flex h-full gap-3 overflow-x-auto pb-1 max-lg:snap-x">
        {stages.map((stage, index) => (
          <Column
            key={stage.id}
            stage={stage}
            index={index}
            dragging={active !== undefined && active.stageId !== stage.id}
            items={columns.get(stage.id) ?? []}
            actions={actions}
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
              <Avatar name={active.candidate.fullName} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{active.candidate.fullName}</p>
                <p className="truncate text-[13px] text-muted">{active.candidate.email}</p>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
