import { NotFoundException } from '@nestjs/common';
import { ServiceStatus, ServiceZoneKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceZonesService } from './service-zones.service';

describe('ServiceZonesService', () => {
  let service: ServiceZonesService;

  const prismaMock = {
    serviceZone: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const baseZone = {
    id: 'zone-1',
    name: 'Port Moresby Test Zone',
    locationId: 1,
    serviceStatus: ServiceStatus.ACTIVE,
    zoneKind: ServiceZoneKind.CITY,
    isAirportZone: false,
    isHotelZone: false,
    isPeripheryBuffer: false,
    centerLatitude: -9.4438,
    centerLongitude: 147.1803,
    coverageRadiusKm: 10,
    location: {
      id: 1,
      name: 'Port Moresby',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ServiceZonesService(prismaMock as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a service zone with converted locationId', async () => {
      prismaMock.serviceZone.create.mockResolvedValue(baseZone);

      const result = await service.create({
        name: 'Port Moresby Test Zone',
        locationId: '1',
        serviceStatus: ServiceStatus.ACTIVE,
        zoneKind: ServiceZoneKind.CITY,
        isAirportZone: false,
        isHotelZone: false,
        isPeripheryBuffer: false,
        centerLatitude: -9.4438,
        centerLongitude: 147.1803,
        coverageRadiusKm: 10,
      });

      expect(prismaMock.serviceZone.create).toHaveBeenCalledWith({
        data: {
          name: 'Port Moresby Test Zone',
          locationId: 1,
          serviceStatus: ServiceStatus.ACTIVE,
          zoneKind: ServiceZoneKind.CITY,
          isAirportZone: false,
          isHotelZone: false,
          isPeripheryBuffer: false,
          centerLatitude: -9.4438,
          centerLongitude: 147.1803,
          coverageRadiusKm: 10,
        },
        include: { location: true },
      });

      expect(result).toEqual(baseZone);
    });

    it('uses safe defaults for optional fields', async () => {
      prismaMock.serviceZone.create.mockResolvedValue({
        ...baseZone,
        serviceStatus: ServiceStatus.COMING_SOON,
        isAirportZone: false,
        isHotelZone: false,
        isPeripheryBuffer: false,
        coverageRadiusKm: 0,
      });

      await service.create({
        name: 'Future Zone',
        locationId: '1',
      });

      expect(prismaMock.serviceZone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            locationId: 1,
            serviceStatus: ServiceStatus.COMING_SOON,
            isAirportZone: false,
            isHotelZone: false,
            isPeripheryBuffer: false,
            coverageRadiusKm: 0,
          }) as unknown,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('returns all zones without a location filter', async () => {
      prismaMock.serviceZone.findMany.mockResolvedValue([baseZone]);

      const result = await service.findAll();

      expect(prismaMock.serviceZone.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { name: 'asc' },
        include: { location: true },
      });

      expect(result).toEqual([baseZone]);
    });

    it('filters zones by numeric locationId', async () => {
      prismaMock.serviceZone.findMany.mockResolvedValue([baseZone]);

      await service.findAll('1');

      expect(prismaMock.serviceZone.findMany).toHaveBeenCalledWith({
        where: { locationId: 1 },
        orderBy: { name: 'asc' },
        include: { location: true },
      });
    });
  });

  describe('findOne', () => {
    it('returns an existing service zone', async () => {
      prismaMock.serviceZone.findUnique.mockResolvedValue(baseZone);

      await expect(service.findOne('zone-1')).resolves.toEqual(baseZone);
    });

    it('throws when the service zone does not exist', async () => {
      prismaMock.serviceZone.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-zone')).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.findOne('missing-zone')).rejects.toThrow(
        'Service zone not found',
      );
    });
  });

  describe('update', () => {
    it('updates an existing service zone', async () => {
      prismaMock.serviceZone.findUnique.mockResolvedValue(baseZone);

      prismaMock.serviceZone.update.mockResolvedValue({
        ...baseZone,
        name: 'Updated Zone',
        coverageRadiusKm: 15,
      });

      const result = await service.update('zone-1', {
        name: 'Updated Zone',
        locationId: '1',
        coverageRadiusKm: 15,
      });

      expect(prismaMock.serviceZone.update).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
        data: {
          name: 'Updated Zone',
          locationId: 1,
          coverageRadiusKm: 15,
        },
        include: { location: true },
      });

      expect(result.name).toBe('Updated Zone');
      expect(result.coverageRadiusKm).toBe(15);
    });
  });

  describe('remove', () => {
    it('deletes an existing service zone', async () => {
      prismaMock.serviceZone.findUnique.mockResolvedValue(baseZone);
      prismaMock.serviceZone.delete.mockResolvedValue(baseZone);

      const result = await service.remove('zone-1');

      expect(prismaMock.serviceZone.delete).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
      });

      expect(result).toEqual(baseZone);
    });

    it('does not delete a missing service zone', async () => {
      prismaMock.serviceZone.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-zone')).rejects.toThrow(
        'Service zone not found',
      );

      expect(prismaMock.serviceZone.delete).not.toHaveBeenCalled();
    });
  });
});
