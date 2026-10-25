import { Controller, Get, Patch, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  bedListSchema,
  bedSchema,
  createBedSchema,
  createRoomCategorySchema,
  createWardSchema,
  idParamsSchema,
  listQuerySchema,
  roomCategoryListSchema,
  roomCategorySchema,
  updateBedSchema,
  updateRoomCategorySchema,
  updateWardSchema,
  wardListSchema,
  wardSchema,
  type Bed,
  type CreateBed,
  type CreateRoomCategory,
  type CreateWard,
  type ListQuery,
  type RoomCategory,
  type UpdateBed,
  type UpdateRoomCategory,
  type UpdateWard,
  type Ward,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { BedsService } from './beds.service.js';

@Controller('room-categories')
export class RoomCategoriesController {
  constructor(private readonly beds: BedsService) {}

  @Get()
  @RequirePermission('masters.data.read')
  @ApiContract({ summary: 'List room categories', query: listQuerySchema, response: roomCategoryListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: ListQuery): Promise<Paginated<RoomCategory>> {
    return this.beds.listRoomCategories(auth, query);
  }

  @Post()
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Add a room category', body: createRoomCategorySchema, response: roomCategorySchema })
  create(@CurrentAuth() auth: AuthContext, @ValidBody() body: CreateRoomCategory, @ReqMeta() meta: RequestMeta): Promise<RoomCategory> {
    return this.beds.createRoomCategory(auth, body, meta);
  }

  @Patch(':id')
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Rename, retire or restore a room category', params: idParamsSchema, body: updateRoomCategorySchema, response: roomCategorySchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: UpdateRoomCategory,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RoomCategory> {
    return this.beds.updateRoomCategory(auth, params.id, body, meta);
  }
}

@Controller('wards')
export class WardsController {
  constructor(private readonly beds: BedsService) {}

  @Get()
  @RequirePermission('masters.data.read')
  @ApiContract({ summary: 'List wards with their room category and bed count', query: listQuerySchema, response: wardListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: ListQuery): Promise<Paginated<Ward>> {
    return this.beds.listWards(auth, query);
  }

  @Post()
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Add a ward', body: createWardSchema, response: wardSchema })
  create(@CurrentAuth() auth: AuthContext, @ValidBody() body: CreateWard, @ReqMeta() meta: RequestMeta): Promise<Ward> {
    return this.beds.createWard(auth, body, meta);
  }

  @Patch(':id')
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Change a ward', params: idParamsSchema, body: updateWardSchema, response: wardSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: UpdateWard,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Ward> {
    return this.beds.updateWard(auth, params.id, body, meta);
  }

  @Get(':id/beds')
  @RequirePermission('masters.data.read')
  @ApiContract({ summary: 'Beds of a ward', params: idParamsSchema, response: bedListSchema })
  async listBeds(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }): Promise<{ data: Bed[] }> {
    return { data: await this.beds.listBeds(auth, params.id) };
  }

  @Post(':id/beds')
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Add a bed to a ward', params: idParamsSchema, body: createBedSchema, response: bedSchema })
  createBed(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: CreateBed,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Bed> {
    return this.beds.createBed(auth, params.id, body, meta);
  }
}

@Controller('beds')
export class BedsController {
  constructor(private readonly beds: BedsService) {}

  @Patch(':id')
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Retire or restore a bed', params: idParamsSchema, body: updateBedSchema, response: bedSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: UpdateBed,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Bed> {
    return this.beds.updateBed(auth, params.id, body, meta);
  }
}
