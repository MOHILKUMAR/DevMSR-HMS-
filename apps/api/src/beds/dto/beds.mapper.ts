import type { Bed, RoomCategory, Ward } from '@devmsr/validation';
import type { BedRow, RoomCategoryRow, WardRow } from '../beds.repository.js';

export function toRoomCategory(row: RoomCategoryRow): RoomCategory {
  return { ...row };
}

export function toWard(row: WardRow): Ward {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    roomCategoryId: row.roomCategoryId,
    roomCategoryName: row.roomCategory?.name ?? null,
    isActive: row.isActive,
    bedCount: row._count.beds,
  };
}

export function toBed(row: BedRow): Bed {
  return { ...row };
}
