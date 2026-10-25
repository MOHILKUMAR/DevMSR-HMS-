import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  cancelTariffRateSchema,
  createServiceItemSchema,
  createTariffRateSchema,
  idParamsSchema,
  rateParamsSchema,
  serviceItemListQuerySchema,
  serviceItemListSchema,
  serviceItemSchema,
  tariffRateListSchema,
  tariffRateSchema,
  updateServiceItemSchema,
  type CancelTariffRate,
  type CreateServiceItem,
  type CreateTariffRate,
  type RateParams,
  type ServiceItem,
  type ServiceItemListQuery,
  type TariffRate,
  type UpdateServiceItem,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { TariffsService } from './tariffs.service.js';

@Controller('service-items')
export class TariffsController {
  constructor(private readonly tariffs: TariffsService) {}

  @Get()
  @RequirePermission('tariffs.tariff.read')
  @ApiContract({ summary: 'List service items with the rate that applies today', query: serviceItemListQuerySchema, response: serviceItemListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: ServiceItemListQuery): Promise<Paginated<ServiceItem>> {
    return this.tariffs.listServiceItems(auth, query);
  }

  @Post()
  @RequirePermission('tariffs.tariff.manage')
  @ApiContract({ summary: 'Add a service item (a fee, room rent, procedure...)', body: createServiceItemSchema, response: serviceItemSchema })
  create(@CurrentAuth() auth: AuthContext, @ValidBody() body: CreateServiceItem, @ReqMeta() meta: RequestMeta): Promise<ServiceItem> {
    return this.tariffs.createServiceItem(auth, body, meta);
  }

  @Patch(':id')
  @RequirePermission('tariffs.tariff.manage')
  @ApiContract({ summary: 'Rename, retire or restore a service item', params: idParamsSchema, body: updateServiceItemSchema, response: serviceItemSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: UpdateServiceItem,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ServiceItem> {
    return this.tariffs.updateServiceItem(auth, params.id, body, meta);
  }

  @Get(':id/rates')
  @RequirePermission('tariffs.tariff.read')
  @ApiContract({ summary: 'Rate history of a service item, newest first', params: idParamsSchema, response: tariffRateListSchema })
  async listRates(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }): Promise<{ data: TariffRate[] }> {
    return { data: await this.tariffs.listRates(auth, params.id) };
  }

  @Post(':id/rates')
  @RequirePermission('tariffs.tariff.manage')
  @ApiContract({
    summary: 'Set a new rate from a date; the current rate ends the day before',
    params: idParamsSchema,
    body: createTariffRateSchema,
    response: tariffRateSchema,
  })
  createRate(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: CreateTariffRate,
    @ReqMeta() meta: RequestMeta,
  ): Promise<TariffRate> {
    return this.tariffs.createRate(auth, params.id, body, meta);
  }

  @Post(':id/rates/:rateId/cancel')
  @HttpCode(200)
  @RequirePermission('tariffs.tariff.manage')
  @ApiContract({
    summary: 'Cancel the latest rate before it starts; the rate before it carries on',
    params: rateParamsSchema,
    body: cancelTariffRateSchema,
    response: tariffRateSchema,
  })
  cancelRate(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: RateParams,
    @ValidBody() body: CancelTariffRate,
    @ReqMeta() meta: RequestMeta,
  ): Promise<TariffRate> {
    return this.tariffs.cancelRate(auth, params.id, params.rateId, body, meta);
  }
}
