import type { PrismaClient, CanvasElement, ElementType } from '@prisma/client';
import type { CanvasDelta } from '../websocket/protocol/messages';

export class ElementRepository {
  constructor(private readonly db: PrismaClient) {}

  async findActiveByBoard(boardId: string): Promise<CanvasElement[]> {
    return this.db.canvasElement.findMany({
      where: { boardId, deletedAt: null },
      orderBy: { layerIndex: 'asc' },
    });
  }

  async findById(id: string): Promise<CanvasElement | null> {
    return this.db.canvasElement.findUnique({ where: { id } });
  }

  async upsertFromDelta(
    delta: CanvasDelta & { op: 'add' },
    boardId: string,
    userId: string,
  ): Promise<CanvasElement> {
    const patch = delta.patch as Record<string, unknown>;
    const data = {
      boardId,
      createdBy: userId,
      type: (patch['type'] as ElementType) ?? 'rectangle',
      x: (patch['x'] as number) ?? 0,
      y: (patch['y'] as number) ?? 0,
      width: (patch['width'] as number) ?? 100,
      height: (patch['height'] as number) ?? 100,
      rotation: (patch['rotation'] as number) ?? 0,
      layerIndex: (patch['layerIndex'] as number) ?? Date.now(),
      visible: (patch['visible'] as boolean) ?? true,
      locked: (patch['locked'] as boolean) ?? false,
      data: patch,
      version: 1,
    };
    return this.db.canvasElement.upsert({
      where: { id: delta.elementId },
      create: { id: delta.elementId, ...data },
      update: {},
    });
  }

  async updateFromDelta(
    delta: CanvasDelta & { op: 'update' },
    expectedVersion?: number,
  ): Promise<CanvasElement | null> {
    const patch = delta.patch as Record<string, unknown>;
    const geometryUpdate = {
      ...(patch['x'] !== undefined && { x: patch['x'] as number }),
      ...(patch['y'] !== undefined && { y: patch['y'] as number }),
      ...(patch['width'] !== undefined && { width: patch['width'] as number }),
      ...(patch['height'] !== undefined && { height: patch['height'] as number }),
      ...(patch['rotation'] !== undefined && { rotation: patch['rotation'] as number }),
      ...(patch['layerIndex'] !== undefined && { layerIndex: patch['layerIndex'] as number }),
      ...(patch['visible'] !== undefined && { visible: patch['visible'] as boolean }),
      ...(patch['locked'] !== undefined && { locked: patch['locked'] as boolean }),
    };

    try {
      const current = await this.db.canvasElement.findUnique({ where: { id: delta.elementId } });
      if (!current || current.deletedAt) return null;
      if (expectedVersion !== undefined && current.version !== expectedVersion) return null;

      const mergedData = { ...(current.data as Record<string, unknown>), ...patch };
      return this.db.canvasElement.update({
        where: { id: delta.elementId },
        data: { ...geometryUpdate, data: mergedData, version: { increment: 1 } },
      });
    } catch {
      return null;
    }
  }

  async softDelete(elementId: string): Promise<CanvasElement | null> {
    try {
      return await this.db.canvasElement.update({
        where: { id: elementId, deletedAt: null },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
    } catch {
      return null;
    }
  }

  
  async hardDeleteOlderThan(boardId: string, days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where = {
      deletedAt: { lt: cutoff },
      ...(boardId ? { boardId } : {}),
    };
    const result = await this.db.canvasElement.deleteMany({ where });
    return result.count;
  }

  async countActive(boardId: string): Promise<number> {
    return this.db.canvasElement.count({ where: { boardId, deletedAt: null } });
  }

  async saveSnapshot(boardId: string, elements: CanvasElement[]): Promise<void> {
    await this.db.boardSnapshot.create({
      data: {
        boardId,
        data: elements as unknown as object[],
        elementCount: elements.length,
      },
    });
  }

  async loadLatestSnapshot(boardId: string) {
    return this.db.boardSnapshot.findFirst({
      where: { boardId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
