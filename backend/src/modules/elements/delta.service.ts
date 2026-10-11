import { createLogger } from '@shared/logger';
import { prisma } from '@config/prisma';
import type { CanvasDelta } from '../websocket/protocol/messages';
import { ElementRepository } from './element.repository';
import { autosaveScheduler } from '../persistence/autosave.scheduler';
import { boardRestoreService } from '../persistence/board-restore.service';

const logger = createLogger('DeltaService');


export class DeltaService {
  private readonly elementRepo: ElementRepository;

  constructor() {
    this.elementRepo = new ElementRepository(prisma);
  }

  async applyDelta(
    delta: CanvasDelta,
    boardId: string,
    userId: string,
  ): Promise<{ success: boolean; conflict?: boolean; currentElement?: unknown }> {
    try {
      switch (delta.op) {
        case 'add':
          await this.elementRepo.upsertFromDelta(
            delta as CanvasDelta & { op: 'add' },
            boardId,
            userId,
          );
          break;

        case 'update': {
          const patch = delta.patch as Record<string, unknown>;
          const expectedVersion = patch['_version'] as number | undefined;
          const updated = await this.elementRepo.updateFromDelta(
            delta as CanvasDelta & { op: 'update' },
            expectedVersion,
          );
          if (!updated) {
            const current = await this.elementRepo.findById(delta.elementId);
            return { success: false, conflict: true, currentElement: current };
          }
          break;
        }

        case 'delete':
          await this.elementRepo.softDelete(delta.elementId);
          break;

        case 'batch': {
          const ops = (delta.patch?.['ops'] as CanvasDelta[]) ?? [];
          await prisma.$transaction(async () => {
            for (const op of ops) {
              await this.applyDelta(op, boardId, userId);
            }
          });
          break;
        }
      }

      // Phase 8: delegate all snapshot scheduling to AutosaveScheduler
      autosaveScheduler.markDirty(boardId);

      return { success: true };
    } catch (err) {
      logger.error('Failed to apply delta', {
        boardId,
        op: delta.op,
        elementId: delta.elementId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { success: false };
    }
  }

  async loadBoardState(boardId: string): Promise<unknown[]> {
    const { elements } = await boardRestoreService.loadBoardState(boardId);
    return elements;
  }

  async invalidateCache(boardId: string): Promise<void> {
    await boardRestoreService.invalidateCache(boardId);
  }
}
