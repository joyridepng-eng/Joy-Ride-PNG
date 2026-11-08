import { NotFoundException } from '@nestjs/common';
import { DriverStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService', () => {
  let service: VehiclesService;

  const prismaMock = {
    vehicle: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    driver: {
      findUnique: jest.fn(),
    },
  };

  const baseVehicle = {
    id: 'vehicle-1',
    plateNumber: 'PMV-002',
    make: 'Toyota',
    model: 'HiAce',
    year: 2020,
    color: 'White',
    seatCount: 12,
    chassisNumber: 'CHASSIS-001',
    registrationNumber: 'REG-001',
    registrationExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    approvedAt: new Date('2025-01-01T00:00:00.000Z'),
    approvedBy: null,
    suspensionReason: null,
    status: VehicleStatus.ACTIVE,
    driverId: 'driver-1',
    driver: {
      id: 'driver-1',
      fullName: 'Test Driver',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new VehiclesService(prismaMock as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a vehicle with converted numeric fields', async () => {
      prismaMock.vehicle.create.mockResolvedValue({
        ...baseVehicle,
        status: VehicleStatus.PENDING,
      });

      const result = await service.create({
        plateNumber: 'PMV-002',
        make: 'Toyota',
        model: 'HiAce',
        year: 2020,
        color: 'White',
        seatCount: 12,
        driverId: 'driver-1',
      });

      expect(prismaMock.vehicle.create).toHaveBeenCalledWith({
        data: {
          plateNumber: 'PMV-002',
          make: 'Toyota',
          model: 'HiAce',
          year: 2020,
          color: 'White',
          seatCount: 12,
          status: VehicleStatus.PENDING,
          driverId: 'driver-1',
        },
        include: { driver: true },
      });

      expect(result).toEqual({
        ...baseVehicle,
        status: VehicleStatus.PENDING,
      });
    });

    it('defaults vehicle status to pending', async () => {
      prismaMock.vehicle.create.mockResolvedValue({
        ...baseVehicle,
        status: VehicleStatus.PENDING,
      });

      await service.create({
        plateNumber: 'PMV-003',
        driverId: 'driver-1',
      });

      expect(prismaMock.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: VehicleStatus.PENDING,
          }) as unknown,
        }),
      );
    });
  });

  describe('lifecycle invariants', () => {
    it('rejects creating any vehicle without a driver', () => {
      expect(() =>
        service.create({
          plateNumber: 'PMV-NO-DRIVER',
        } as unknown as Parameters<VehiclesService['create']>[0]),
      ).toThrow('Vehicle must be assigned to a driver');

      expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
    });

    it('rejects activating a second vehicle for the same driver', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({
        ...baseVehicle,
        id: 'vehicle-2',
        status: VehicleStatus.APPROVED,
        driverId: 'driver-1',
      });

      prismaMock.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        status: DriverStatus.APPROVED,
      });

      prismaMock.vehicle.findFirst.mockResolvedValue({
        ...baseVehicle,
        id: 'vehicle-1',
        status: VehicleStatus.ACTIVE,
        driverId: 'driver-1',
      });

      await expect(
        service.update('vehicle-2', {
          status: VehicleStatus.ACTIVE,
        }),
      ).rejects.toThrow('Driver already has an active vehicle');

      expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
    });
    it('rejects activating an unassigned vehicle', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({
        ...baseVehicle,
        status: VehicleStatus.APPROVED,
        driverId: null,
        driver: null,
      });

      await expect(
        service.update('vehicle-1', {
          status: VehicleStatus.ACTIVE,
        }),
      ).rejects.toThrow('Active vehicle must be assigned to a driver');

      expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
    });

    it('rejects assigning an active vehicle to a non-approved driver', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue(baseVehicle);

      prismaMock.driver.findUnique.mockResolvedValue({
        id: 'driver-2',
        status: DriverStatus.SUSPENDED,
      });

      await expect(
        service.update('vehicle-1', {
          driverId: 'driver-2',
        }),
      ).rejects.toThrow(
        'Active vehicle can only be assigned to an approved driver',
      );

      expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
    });
  });
  describe('approval and activation requirements', () => {
    it('rejects approval when the vehicle profile is incomplete', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({
        ...baseVehicle,
        status: VehicleStatus.PENDING,
        make: null,
      });

      await expect(
        service.updateStatus('vehicle-1', VehicleStatus.APPROVED),
      ).rejects.toThrow('Vehicle profile is incomplete: make');

      expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
    });

    it('rejects activating a pending vehicle directly', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({
        ...baseVehicle,
        status: VehicleStatus.PENDING,
      });

      await expect(
        service.updateStatus('vehicle-1', VehicleStatus.ACTIVE),
      ).rejects.toThrow('Vehicle must be approved before activation');

      expect(prismaMock.driver.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
    });

    it('rejects approval when vehicle registration has expired', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({
        ...baseVehicle,
        status: VehicleStatus.PENDING,
        registrationExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
      });

      await expect(
        service.updateStatus('vehicle-1', VehicleStatus.APPROVED),
      ).rejects.toThrow(
        'Vehicle registration must be valid at the time of approval or activation',
      );

      expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
    });

    it('activates a complete approved vehicle for an approved driver', async () => {
      const approvedVehicle = {
        ...baseVehicle,
        status: VehicleStatus.APPROVED,
      };

      const activeVehicle = {
        ...baseVehicle,
        status: VehicleStatus.ACTIVE,
      };

      prismaMock.vehicle.findUnique.mockResolvedValue(approvedVehicle);
      prismaMock.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        status: DriverStatus.APPROVED,
      });
      prismaMock.vehicle.findFirst.mockResolvedValue(null);
      prismaMock.vehicle.update.mockResolvedValue(activeVehicle);

      const result = await service.updateStatus(
        'vehicle-1',
        VehicleStatus.ACTIVE,
      );

      expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'vehicle-1' },
        data: expect.objectContaining({
          status: VehicleStatus.ACTIVE,
        }) as unknown,
        include: { driver: true },
      });

      expect(result).toEqual(activeVehicle);
    });
  });

  describe('normalization', () => {
    it('normalizes vehicle identity fields during creation', async () => {
      prismaMock.vehicle.create.mockResolvedValue(baseVehicle);

      await service.create({
        plateNumber: '  pmv-009  ',
        make: '  Toyota  ',
        model: '  HiAce  ',
        color: '  White  ',
        chassisNumber: '  chassis-009  ',
        registrationNumber: '  reg-009  ',
        driverId: 'driver-1',
      });

      expect(prismaMock.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            plateNumber: 'PMV-009',
            make: 'Toyota',
            model: 'HiAce',
            color: 'White',
            chassisNumber: 'CHASSIS-009',
            registrationNumber: 'REG-009',
          }) as unknown,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('returns all vehicles when driverId is not supplied', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([baseVehicle]);

      const result = await service.findAll();

      expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: 'desc' },
        include: { driver: true },
      });

      expect(result).toEqual([baseVehicle]);
    });

    it('filters vehicles by driverId', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([baseVehicle]);

      await service.findAll('driver-1');

      expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith({
        where: { driverId: 'driver-1' },
        orderBy: { createdAt: 'desc' },
        include: { driver: true },
      });
    });
  });

  describe('findOne', () => {
    it('returns an existing vehicle', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue(baseVehicle);

      await expect(service.findOne('vehicle-1')).resolves.toEqual(baseVehicle);
    });

    it('throws when the vehicle does not exist', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-vehicle')).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.findOne('missing-vehicle')).rejects.toThrow(
        'Vehicle not found',
      );
    });
  });

  describe('update', () => {
    it('updates an existing vehicle', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue(baseVehicle);

      prismaMock.vehicle.update.mockResolvedValue({
        ...baseVehicle,
        color: 'Blue',
        seatCount: 14,
      });

      const result = await service.update('vehicle-1', {
        color: 'Blue',
        seatCount: 14,
      });

      expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'vehicle-1' },
        data: {
          color: 'Blue',
          seatCount: 14,
          year: undefined,
        },
        include: { driver: true },
      });

      expect(result.color).toBe('Blue');
      expect(result.seatCount).toBe(14);
    });
  });

  describe('remove', () => {
    it('deactivates an existing vehicle instead of deleting it', async () => {
      const inactiveVehicle = {
        ...baseVehicle,
        status: VehicleStatus.INACTIVE,
      };

      prismaMock.vehicle.findUnique.mockResolvedValue(baseVehicle);
      prismaMock.vehicle.update.mockResolvedValue(inactiveVehicle);

      const result = await service.remove('vehicle-1');

      expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'vehicle-1' },
        data: {
          status: VehicleStatus.INACTIVE,
        },
        include: { driver: true },
      });

      expect(prismaMock.vehicle.delete).not.toHaveBeenCalled();

      expect(result).toEqual(inactiveVehicle);
      expect(result.driverId).toBe('driver-1');
    });

    it('does not deactivate a missing vehicle', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-vehicle')).rejects.toThrow(
        'Vehicle not found',
      );

      expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
      expect(prismaMock.vehicle.delete).not.toHaveBeenCalled();
    });
  });
});
