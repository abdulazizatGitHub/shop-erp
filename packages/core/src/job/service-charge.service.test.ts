import { describe, expect, it, vi } from 'vitest';
import { assertCommissionModeConsistent, createServiceCharge } from './service-charge.service.js';
import type {
  ServiceChargeRecord,
  ServiceChargeRepositoryPort,
} from './service-charge.repository.port.js';

function fakeRecord(overrides: Partial<ServiceChargeRecord> = {}): ServiceChargeRecord {
  return {
    id: 'id-1',
    name: 'Test',
    jobType: null,
    retailChargePaisa: 100,
    wholesaleChargePaisa: null,
    commissionMode: 'none',
    commissionAmountPaisa: null,
    commissionBp: null,
    typicalMinutes: null,
    isActive: true,
    createdAt: '2026-09-23T00:00:00.000Z',
    notes: null,
    ...overrides,
  };
}

describe('assertCommissionModeConsistent — P16-1 core-layer half of "Zod + core"', () => {
  it('none requires both amount and bp null', () => {
    expect(() => {
      assertCommissionModeConsistent('none', null, null);
    }).not.toThrow();
    expect(() => {
      assertCommissionModeConsistent('none', 100, null);
    }).toThrow();
    expect(() => {
      assertCommissionModeConsistent('none', null, 100);
    }).toThrow();
  });

  it('fixed requires a positive amount and bp null', () => {
    expect(() => {
      assertCommissionModeConsistent('fixed', 50000, null);
    }).not.toThrow();
    expect(() => {
      assertCommissionModeConsistent('fixed', null, null);
    }).toThrow();
    expect(() => {
      assertCommissionModeConsistent('fixed', 0, null);
    }).toThrow();
    expect(() => {
      assertCommissionModeConsistent('fixed', 50000, 1000);
    }).toThrow();
  });

  it('bp requires 1..10000 and amount null', () => {
    expect(() => {
      assertCommissionModeConsistent('bp', null, 1000);
    }).not.toThrow();
    expect(() => {
      assertCommissionModeConsistent('bp', null, 1);
    }).not.toThrow();
    expect(() => {
      assertCommissionModeConsistent('bp', null, 10000);
    }).not.toThrow();
    expect(() => {
      assertCommissionModeConsistent('bp', null, 0);
    }).toThrow();
    expect(() => {
      assertCommissionModeConsistent('bp', null, 10001);
    }).toThrow();
    expect(() => {
      assertCommissionModeConsistent('bp', 500, 1000);
    }).toThrow();
  });

  it('is enforced even when a caller bypasses Zod entirely (direct core-service test, no CreateServiceChargeInput.parse involved)', async () => {
    const createServiceChargeMock = vi.fn();
    const repo: ServiceChargeRepositoryPort = {
      createServiceCharge: createServiceChargeMock,
      updateServiceCharge: vi.fn(),
      toggleServiceCharge: vi.fn(),
      listServiceChargesAdmin: vi.fn(),
    };
    // Zod's superRefine (packages/contracts) never runs here — this
    // object is structurally valid CreateServiceChargeInput at the type
    // level (the refinement only enforces the invariant at runtime, via
    // .parse(), which this test deliberately never calls) — so only the
    // core-layer assertCommissionModeConsistent check stands between
    // this "both set" input and the repository.
    await expect(
      createServiceCharge(repo, {
        name: 'Both set',
        jobType: null,
        retailChargePaisa: 1000,
        wholesaleChargePaisa: null,
        typicalMinutes: null,
        notes: null,
        commissionMode: 'fixed',
        commissionAmountPaisa: 500,
        commissionBp: 1000,
      }),
    ).rejects.toThrow(/commissionBp to be null/);
    expect(createServiceChargeMock).not.toHaveBeenCalled();
  });

  it('valid input reaches the repository unchanged', async () => {
    const created = fakeRecord({ commissionMode: 'fixed', commissionAmountPaisa: 50000 });
    const createServiceChargeMock = vi.fn().mockResolvedValue(created);
    const repo: ServiceChargeRepositoryPort = {
      createServiceCharge: createServiceChargeMock,
      updateServiceCharge: vi.fn(),
      toggleServiceCharge: vi.fn(),
      listServiceChargesAdmin: vi.fn(),
    };
    const result = await createServiceCharge(repo, {
      name: 'AC Installation',
      jobType: null,
      retailChargePaisa: 300000,
      wholesaleChargePaisa: null,
      typicalMinutes: null,
      notes: null,
      commissionMode: 'fixed',
      commissionAmountPaisa: 50000,
      commissionBp: null,
    });
    expect(result).toBe(created);
    expect(createServiceChargeMock).toHaveBeenCalledWith({
      name: 'AC Installation',
      jobType: null,
      retailChargePaisa: 300000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: 50000,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });
  });
});
