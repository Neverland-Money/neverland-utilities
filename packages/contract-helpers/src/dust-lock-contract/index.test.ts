import { dustLockAbi, erc20Abi, multicall3Abi } from '@neverland-money/contract-types';
import { ethers } from 'ethers';
import type { BigNumberish } from 'ethers';
import type { UserLock } from './types';
import { DustLockHelper } from '.';
const LOCK = '0x00000000000000000000000000000000000010c4';
const DUST = '0x0000000000000000000000000000000000000d57';
const USER = '0x00000000000000000000000000000000000000a1';
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';
const lockIface = new ethers.Interface(dustLockAbi);
const erc20Iface = new ethers.Interface(erc20Abi);
const multicallIface = new ethers.Interface(multicall3Abi);
// A real provider with a fixed network, so ethers never probes the URL; tests mock `call`.
const provider = new ethers.JsonRpcProvider(
  'http://127.0.0.1:1',
  {
    chainId: 143,
    name: 'monad',
  },
  { staticNetwork: true },
);
const helper = new DustLockHelper({ provider, lockAddress: LOCK, dustTokenAddress: DUST });
const ether = (amount: string) => ethers.parseEther(amount);
const aggregate3Result = (results: Array<[boolean, string]>) =>
  multicallIface.encodeFunctionResult('aggregate3', [results]);
describe('DustLockHelper', () => {
  describe('getEarlyWithdrawTxData', () => {
    it('encodes earlyWithdraw(uint256) when no penalty cap is given', () => {
      const { to, data } = helper.getEarlyWithdrawTxData(7);
      expect(to).toBe(LOCK);
      expect(data.slice(0, 10)).toBe(lockIface.getFunction('earlyWithdraw(uint256)')!.selector);
      expect(lockIface.decodeFunctionData('earlyWithdraw(uint256)', data).map(String)).toEqual([
        '7',
      ]);
    });
    it('encodes the penalty-bounded overload when maxPenalty is given', () => {
      const maxPenalty = ether('2').toString();
      const { data } = helper.getEarlyWithdrawTxData(7, maxPenalty);
      expect(data.slice(0, 10)).toBe(
        lockIface.getFunction('earlyWithdraw(uint256,uint256)')!.selector,
      );
      expect(
        lockIface.decodeFunctionData('earlyWithdraw(uint256,uint256)', data).map(String),
      ).toEqual(['7', maxPenalty]);
    });
  });
  describe('getUserDustDataWithMulticall', () => {
    it('reads through a static aggregate3 call on a read-only provider', async () => {
      const requests: Array<{
        to?: string;
        data: string;
      }> = [];
      jest.spyOn(provider, 'call').mockImplementation(async tx => {
        requests.push({
          to:
            tx.to === null || tx.to === undefined ? undefined : await ethers.resolveAddress(tx.to),
          data: ethers.hexlify(tx.data ?? '0x'),
        });
        return aggregate3Result([
          [true, lockIface.encodeFunctionResult('balanceOf', [0])],
          [true, erc20Iface.encodeFunctionResult('balanceOf', [ether('5')])],
          [true, erc20Iface.encodeFunctionResult('allowance', [ether('1')])],
          [true, lockIface.encodeFunctionResult('minLockAmount', [ether('10')])],
        ]);
      });
      const result = await helper.getUserDustDataWithMulticall(USER, MULTICALL);
      expect(requests).toHaveLength(1);
      expect(typeof result.dustBalance).toBe('bigint');
      expect(requests[0].to).toBe(MULTICALL);
      expect(multicallIface.parseTransaction({ data: requests[0].data })!.name).toBe('aggregate3');
      expect(result).toEqual({
        userLocks: [],
        dustBalance: ether('5'),
        dustAllowance: ether('1'),
        minLockAmount: ether('10'),
      });
    });
    it('reads a failed sub-call as zero', async () => {
      jest.spyOn(provider, 'call').mockResolvedValue(
        aggregate3Result([
          [true, lockIface.encodeFunctionResult('balanceOf', [0])],
          [false, '0x'],
          [true, erc20Iface.encodeFunctionResult('allowance', [ether('1')])],
          [false, '0x'],
        ]),
      );
      const result = await helper.getUserDustDataWithMulticall(USER, MULTICALL);
      expect(result.dustBalance).toEqual(0n);
      expect(result.dustAllowance).toEqual(ether('1'));
      expect(result.minLockAmount).toEqual(0n);
    });
  });

  it('decodes bigint lock timestamps from a static multicall', async () => {
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      const data = ethers.hexlify(tx.data ?? '0x');
      const to = tx.to === null || tx.to === undefined ? '' : await ethers.resolveAddress(tx.to);
      if (to.toLowerCase() === MULTICALL.toLowerCase()) {
        return aggregate3Result([
          [true, lockIface.encodeFunctionResult('locked', [[ether('10'), 1000, 2000, false]])],
          [true, lockIface.encodeFunctionResult('balanceOfNFT', [ether('5')])],
        ]);
      }

      const { name } = lockIface.parseTransaction({ data })!;
      if (name === 'balanceOf') return lockIface.encodeFunctionResult(name, [1]);
      if (name === 'ownerToNFTokenIdList') return lockIface.encodeFunctionResult(name, [7]);
      throw new Error(`Unexpected read: ${name}`);
    });
    const locks = await helper.getUserLocksWithMulticall(USER, MULTICALL);
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({
      tokenId: 7,
      amount: ether('10').toString(),
      veDustAmount: ether('5').toString(),
      effectiveStart: 1000,
      end: 2000,
      isPermanent: false,
    });
  });
});

const MAX_UINT256 = ethers.MaxUint256.toString();
describe('DustLockHelper canonical transaction inputs', () => {
  it('encodes createLockFor amount, duration seconds, and recipient in canonical order', () => {
    const tx = helper.getCreateLockForTxData({ to: USER, amount: MAX_UINT256, unlockTime: 86400 });
    expect(tx.to).toBe(LOCK);
    expect(tx.data.slice(0, 10)).toBe('0xec32e6df');
    expect(lockIface.decodeFunctionData('createLockFor', tx.data).toArray()).toEqual([
      ethers.MaxUint256,
      86400n,
      ethers.getAddress(USER),
    ]);
  });

  it.each(['', '   ', '-', '- -1', '-1', (ethers.MaxUint256 + 1n).toString()])(
    'rejects invalid uint256 amount %j in createLock and approval',
    amount => {
      expect(() => helper.getCreateLockTxData({ amount, lockDuration: 0 })).toThrow();
      expect(() => helper.getApprovalTxData(USER, amount)).toThrow();
    },
  );

  it('uses an explicit zero timestamp independently of the clock', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2000000000000);
    const calculation = {
      dustAmount: 100,
      endTimestamp: 31536000,
      isPermanent: false,
      currentTimestamp: 0,
    };
    expect(DustLockHelper.calculateVeDustPower(calculation)).toBe(100);
  });
});

const exactIds: BigNumberish[] = [
  0,
  0n,
  '0',
  7,
  Number.MAX_SAFE_INTEGER,
  '9007199254740993',
  9007199254740993n,
  ethers.MaxUint256,
  MAX_UINT256,
];
const invalidIds: BigNumberish[] = [
  '',
  ' ',
  '-',
  '- -1',
  '-1',
  -1n,
  0.1,
  Number.MAX_SAFE_INTEGER + 1,
  NaN,
  Infinity,
  '1.5',
  '1e3',
  ethers.MaxUint256 + 1n,
];
const idEncoders = (id: BigNumberish) =>
  [
    [
      'increaseAmount',
      helper.getIncreaseAmountTxData({ tokenId: id, amount: MAX_UINT256 }),
      [BigInt(id), ethers.MaxUint256],
    ],
    ['increaseUnlockTime', helper.getIncreaseUnlockTimeTxData(id, 0), [BigInt(id), 0n]],
    ['lockPermanent', helper.getLockPermanentTxData(id), [BigInt(id)]],
    ['unlockPermanent', helper.getUnlockPermanentTxData(id), [BigInt(id)]],
    ['earlyWithdraw(uint256)', helper.getEarlyWithdrawTxData(id, undefined), [BigInt(id)]],
    ['earlyWithdraw(uint256,uint256)', helper.getEarlyWithdrawTxData(id, 0n), [BigInt(id), 0n]],
    ['withdraw', helper.getWithdrawTxData(id), [BigInt(id)]],
    ['merge', helper.getMergeTxData({ fromTokenId: id, toTokenId: id }), [BigInt(id), BigInt(id)]],
    [
      'safeTransferFrom(address,address,uint256)',
      helper.getTransferTxData({ from: USER, to: DUST, tokenId: id }),
      [ethers.getAddress(USER), ethers.getAddress(DUST), BigInt(id)],
    ],
  ] as const;

describe('DustLockHelper exact uint256 transactions', () => {
  it.each(exactIds)('canonically encodes every token transaction with exact ID %s', id => {
    for (const [signature, tx, expected] of idEncoders(id)) {
      expect(tx.to).toBe(LOCK);
      expect(lockIface.decodeFunctionData(signature, tx.data).toArray()).toEqual(expected);
    }
  });

  it.each(invalidIds)('rejects invalid token input %s in every ID position', id => {
    const encoders = [
      () => helper.getIncreaseAmountTxData({ tokenId: id, amount: '0' }),
      () => helper.getIncreaseUnlockTimeTxData(id, 0),
      () => helper.getLockPermanentTxData(id),
      () => helper.getUnlockPermanentTxData(id),
      () => helper.getEarlyWithdrawTxData(id),
      () => helper.getEarlyWithdrawTxData(0, id),
      () => helper.getWithdrawTxData(id),
      () => helper.getMergeTxData({ fromTokenId: id, toTokenId: 0 }),
      () => helper.getMergeTxData({ fromTokenId: 0, toTokenId: id }),
      () => helper.getTransferTxData({ from: USER, to: DUST, tokenId: id }),
    ];
    for (const encode of encoders) expect(encode).toThrow();
  });

  it.each(['0', MAX_UINT256])(
    'canonically encodes raw amount %s without decimal scaling',
    amount => {
      for (const [signature, tx, expected] of [
        [
          'createLock',
          helper.getCreateLockTxData({ amount, lockDuration: 0 }),
          [BigInt(amount), 0n],
        ],
        [
          'createLockPermanent',
          helper.getCreateLockPermanentTxData({ amount, lockDuration: 0 }),
          [BigInt(amount), 0n],
        ],
        [
          'createLockFor',
          helper.getCreateLockForTxData({ amount, unlockTime: 0, to: USER }),
          [BigInt(amount), 0n, ethers.getAddress(USER)],
        ],
      ] as const)
        expect(lockIface.decodeFunctionData(signature, tx.data).toArray()).toEqual(expected);
      const approval = helper.getApprovalTxData(USER, amount);
      expect(approval.to).toBe(DUST);
      expect(erc20Iface.decodeFunctionData('approve', approval.data).toArray()).toEqual([
        ethers.getAddress(LOCK),
        BigInt(amount),
      ]);
    },
  );

  it.each([-1, 0.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(
    'rejects invalid duration %s in all duration positions',
    duration => {
      expect(() => helper.getCreateLockTxData({ amount: '0', lockDuration: duration })).toThrow();
      expect(() =>
        helper.getCreateLockPermanentTxData({ amount: '0', lockDuration: duration }),
      ).toThrow();
      expect(() =>
        helper.getCreateLockForTxData({ amount: '0', unlockTime: duration, to: USER }),
      ).toThrow();
      expect(() => helper.getIncreaseUnlockTimeTxData(0, duration)).toThrow();
    },
  );

  it('encodes the bounded early withdrawal with a maximum bigint cap', () => {
    const tx = helper.getEarlyWithdrawTxData(0, ethers.MaxUint256);
    expect(
      lockIface.decodeFunctionData('earlyWithdraw(uint256,uint256)', tx.data).toArray(),
    ).toEqual([0n, ethers.MaxUint256]);
  });

  it('rejects malformed transfer and create recipients', () => {
    expect(() => helper.getTransferTxData({ from: 'bad', to: USER, tokenId: 0 })).toThrow();
    expect(() => helper.getTransferTxData({ from: USER, to: 'bad', tokenId: 0 })).toThrow();
    expect(() =>
      helper.getCreateLockForTxData({ amount: '0', unlockTime: 0, to: 'bad' }),
    ).toThrow();
  });
});

describe('DustLockHelper timestamp input', () => {
  it('forwards nonzero and zero timestamps to merge and increase helpers', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2000000000000);
    expect(
      DustLockHelper.calculateVeDustPower({
        dustAmount: 100,
        endTimestamp: 31536100,
        isPermanent: false,
        currentTimestamp: 100,
      }),
    ).toBe(100);
    expect(DustLockHelper.calculateMergedVeDustPower(100, 31536000, false, 0)).toBe(100);
    expect(DustLockHelper.calculateVeDustIncrease(100, 7, 31536000, false, 0)).toBe(107);
    expect(DustLockHelper.calculateMergedVeDustPower(100, 31536100, false, 100)).toBe(100);
    expect(DustLockHelper.calculateVeDustIncrease(100, 7, 31536100, false, 100)).toBe(107);
  });

  it('retains the clock default and permanent-lock result', () => {
    jest.spyOn(Date, 'now').mockReturnValue(100000);
    expect(
      DustLockHelper.calculateVeDustPower({
        dustAmount: 100,
        endTimestamp: 31536100,
        isPermanent: false,
      }),
    ).toBe(100);
    expect(
      DustLockHelper.calculateVeDustPower({
        dustAmount: 100,
        endTimestamp: 0,
        isPermanent: true,
        currentTimestamp: 0,
      }),
    ).toBe(100);
  });
});

describe('DustLockHelper strict read primitives', () => {
  it.each(exactIds)('reads a lock and unnamed penalty output using exact ID %s', async tokenId => {
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      const parsed = lockIface.parseTransaction({ data: ethers.hexlify(tx.data ?? '0x') })!;
      expect(parsed.args.toArray()).toEqual([BigInt(tokenId)]);
      if (parsed.name === 'locked')
        return lockIface.encodeFunctionResult('locked', [
          [ethers.MaxUint256 / 2n, 1000, 2000, false],
        ]);
      if (parsed.name === 'balanceOfNFT')
        return lockIface.encodeFunctionResult('balanceOfNFT', [ethers.MaxUint256]);
      if (parsed.name === 'earlyWithdrawPenaltyAmount')
        return lockIface.encodeFunctionResult('earlyWithdrawPenaltyAmount', [ethers.MaxUint256]);
      throw new Error(`Unexpected read ${parsed.name}`);
    });
    await expect(helper.getLockInfo(tokenId)).resolves.toEqual({
      amount: (ethers.MaxUint256 / 2n).toString(),
      veDustAmount: MAX_UINT256,
      effectiveStart: 1000,
      end: 2000,
      isPermanent: false,
    });
    await expect(helper.readEarlyWithdrawPenaltyAmount(tokenId)).resolves.toBe(ethers.MaxUint256);
  });

  it('reads total voting power in raw bigint units', async () => {
    const call = jest.spyOn(provider, 'call').mockImplementation(async tx => {
      expect(ethers.hexlify(tx.data ?? '0x')).toBe(lockIface.encodeFunctionData('totalSupply', []));
      return lockIface.encodeFunctionResult('totalSupply', [ethers.MaxUint256]);
    });
    await expect(helper.getTotalVotingPower()).resolves.toBe(ethers.MaxUint256);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('uses the configured lock or an explicit allowance spender', async () => {
    const spenders: string[] = [];
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      const decoded = erc20Iface.decodeFunctionData('allowance', ethers.hexlify(tx.data ?? '0x'));
      expect(decoded[0]).toBe(ethers.getAddress(USER));
      spenders.push(String(decoded[1]));
      return erc20Iface.encodeFunctionResult('allowance', [ethers.MaxUint256]);
    });
    await expect(helper.getDustAllowance(USER)).resolves.toBe(ethers.MaxUint256);
    await expect(helper.getDustAllowance(USER, DUST)).resolves.toBe(ethers.MaxUint256);
    expect(spenders).toEqual([ethers.getAddress(LOCK), ethers.getAddress(DUST)]);
  });

  it.each(invalidIds)('rejects invalid read ID %s before RPC', async tokenId => {
    const call = jest.spyOn(provider, 'call');
    await expect(helper.getLockInfo(tokenId)).rejects.toThrow();
    await expect(helper.readEarlyWithdrawPenaltyAmount(tokenId)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it.each(['lock', 'penalty', 'supply', 'allowance'] as const)(
    'propagates the original %s RPC error object',
    async read => {
      const failure = new Error('RPC unavailable');
      jest.spyOn(provider, 'call').mockRejectedValue(failure);
      const pending =
        read === 'lock'
          ? helper.getLockInfo(0)
          : read === 'penalty'
            ? helper.readEarlyWithdrawPenaltyAmount(0)
            : read === 'supply'
              ? helper.getTotalVotingPower()
              : helper.getDustAllowance(USER, DUST);
      await expect(pending).rejects.toBe(failure);
    },
  );
});

describe('DustLockHelper lock list reads with an injected clock', () => {
  const NOW = 1_800_000_000;
  const DAY = 86400;
  type Row = { amount: bigint; end: number; isPermanent: boolean; veDust: bigint };
  // Owner index 1 fails, so ID 0 at that index is never read; ID 8 is not owned.
  const owned: Array<number | Error> = [7, new Error('index read failed'), 11, 12, 13, 14];
  const rows: Record<number, Row> = {
    7: {
      amount: ether('5'),
      end: NOW + 10 * DAY + DAY / 2,
      isPermanent: false,
      veDust: ether('1'),
    },
    11: { amount: ether('5'), end: NOW, isPermanent: false, veDust: 0n },
    12: { amount: ether('1'), end: 0, isPermanent: true, veDust: ether('1') },
    13: { amount: ether('5'), end: NOW + 30 * DAY, isPermanent: false, veDust: ether('2') },
    14: { amount: ether('9'), end: NOW - 1, isPermanent: false, veDust: 0n },
  };
  const lockedResult = (id: number) => {
    const row = rows[id];
    return lockIface.encodeFunctionResult('locked', [[row.amount, 1, row.end, row.isPermanent]]);
  };

  const mockReads = (failBalance = false) =>
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      const data = ethers.hexlify(tx.data ?? '0x');
      const to = tx.to === null || tx.to === undefined ? '' : await ethers.resolveAddress(tx.to);
      if (to.toLowerCase() === MULTICALL.toLowerCase()) {
        const calls: unknown = multicallIface.decodeFunctionData('aggregate3', data)[0];
        if (!Array.isArray(calls)) throw new Error('Expected a Call3 array');
        return aggregate3Result(
          calls.map((call: unknown) => {
            // Each Call3 decodes as (target, allowFailure, callData).
            if (!Array.isArray(call)) throw new Error('Expected a Call3 tuple');
            const parsed = lockIface.parseTransaction({ data: String(call[2]) })!;
            const id = Number(parsed.args[0]);
            return parsed.name === 'locked'
              ? [true, lockedResult(id)]
              : [true, lockIface.encodeFunctionResult('balanceOfNFT', [rows[id].veDust])];
          }),
        );
      }

      const parsed = lockIface.parseTransaction({ data })!;
      if (parsed.name === 'balanceOf') {
        if (failBalance) throw new Error('balance read failed');
        return lockIface.encodeFunctionResult('balanceOf', [owned.length]);
      }

      if (parsed.name === 'ownerToNFTokenIdList') {
        const entry = owned[Number(parsed.args[1])];
        if (entry instanceof Error) throw entry;
        return lockIface.encodeFunctionResult('ownerToNFTokenIdList', [entry]);
      }

      const id = Number(parsed.args[0]);
      if (parsed.name === 'locked') return lockedResult(id);
      if (parsed.name === 'balanceOfNFT')
        return lockIface.encodeFunctionResult('balanceOfNFT', [rows[id].veDust]);
      throw new Error(`Unexpected read: ${parsed.name}`);
    });
  const summary = (locks: UserLock[]) =>
    locks.map(({ tokenId, daysRemaining, isExpired, isPermanent }) => ({
      tokenId,
      daysRemaining,
      isExpired,
      isPermanent,
    }));
  const expected = [
    { tokenId: 12, daysRemaining: 0, isExpired: false, isPermanent: true },
    { tokenId: 14, daysRemaining: 0, isExpired: true, isPermanent: false },
    { tokenId: 13, daysRemaining: 30, isExpired: false, isPermanent: false },
    { tokenId: 7, daysRemaining: 10, isExpired: false, isPermanent: false },
    { tokenId: 11, daysRemaining: 0, isExpired: true, isPermanent: false },
  ];

  it.each(['sequential', 'multicall'] as const)(
    'derives days and expiry from the %s clock argument and sorts permanent, amount, then time',
    async mode => {
      mockReads();
      const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
      const locks =
        mode === 'sequential'
          ? await helper.getUserLocks(USER, NOW)
          : await helper.getUserLocksWithMulticall(USER, MULTICALL, NOW);
      expect(summary(locks)).toEqual(expected);
      expect(locks.find(lock => lock.tokenId === 13)).toMatchObject({
        amount: ether('5').toString(),
        amountFormatted: '5.00',
        veDustFormatted: '2.00',
        end: NOW + 30 * DAY,
      });
      expect(clock).not.toHaveBeenCalled();
    },
  );

  it('defaults to the local clock once per read when no clock is passed', async () => {
    mockReads();
    const clock = jest.spyOn(Date, 'now').mockReturnValue((NOW + 11 * DAY) * 1000);
    const locks = await helper.getUserLocks(USER);
    expect(locks.find(lock => lock.tokenId === 7)).toMatchObject({
      daysRemaining: 0,
      isExpired: true,
    });
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it('passes the clock through the combined multicall read', async () => {
    mockReads();
    jest.spyOn(provider, 'call').mockImplementationOnce(async () =>
      aggregate3Result([
        [true, lockIface.encodeFunctionResult('balanceOf', [owned.length])],
        [true, erc20Iface.encodeFunctionResult('balanceOf', [0])],
        [true, erc20Iface.encodeFunctionResult('allowance', [0])],
        [true, lockIface.encodeFunctionResult('minLockAmount', [ether('10')])],
      ]),
    );
    const { userLocks } = await helper.getUserDustDataWithMulticall(USER, MULTICALL, NOW);
    expect(summary(userLocks)).toEqual(expected);
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid clock %s before any RPC',
    async now => {
      const call = jest.spyOn(provider, 'call');
      await expect(helper.getUserLocks(USER, now)).rejects.toThrow('currentTimestamp');
      await expect(helper.getUserLocksWithMulticall(USER, MULTICALL, now)).rejects.toThrow(
        'currentTimestamp',
      );
      await expect(helper.getUserDustDataWithMulticall(USER, MULTICALL, now)).rejects.toThrow(
        'currentTimestamp',
      );
      expect(call).not.toHaveBeenCalled();
    },
  );

  it('reads no locks when the owner balance fails or the owner is malformed', async () => {
    const call = mockReads(true);
    await expect(helper.getUserLocks(USER, NOW)).resolves.toEqual([]);
    await expect(helper.getUserLocksWithMulticall(USER, MULTICALL, NOW)).resolves.toEqual([]);
    call.mockClear();
    await expect(helper.getUserLocks('not-an-address', NOW)).resolves.toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });
});
