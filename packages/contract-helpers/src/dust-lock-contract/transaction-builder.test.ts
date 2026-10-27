import { dustLockAbi, erc20Abi } from '@neverland-money/contract-types';
import { AbstractProvider, Interface, MaxUint256 } from 'ethers';
import type { BigNumberish } from 'ethers';
import { DustLockTransactionBuilder } from '../index';

const LOCK = '0x0000000000000000000000000000000000000011';
const DUST = '0x0000000000000000000000000000000000000022';
const USER = '0x0000000000000000000000000000000000000033';
const RECIPIENT = '0x0000000000000000000000000000000000000044';
const lockIface = new Interface(dustLockAbi);
const erc20Iface = new Interface(erc20Abi);
const builder = new DustLockTransactionBuilder({ lockAddress: LOCK, dustTokenAddress: DUST });

const invalidUints: BigNumberish[] = [
  '',
  ' ',
  '-',
  '- -1',
  '-1',
  -1n,
  0.1,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  MaxUint256 + 1n,
];
describe('provider-free DustLock transaction builder', () => {
  it('encodes every lock transaction from addresses alone without RPC', () => {
    const call = jest.spyOn(AbstractProvider.prototype, 'call');
    const getNetwork = jest.spyOn(AbstractProvider.prototype, 'getNetwork');
    const amount = MaxUint256.toString();
    const id = '9007199254740993';
    const transactions = [
      ['createLock', builder.getCreateLockTxData({ amount, lockDuration: 0 }), [MaxUint256, 0n]],
      [
        'createLockPermanent',
        builder.getCreateLockPermanentTxData({ amount, lockDuration: 0 }),
        [MaxUint256, 0n],
      ],
      [
        'createLockFor',
        builder.getCreateLockForTxData({ amount, unlockTime: 0, to: RECIPIENT }),
        [MaxUint256, 0n, RECIPIENT],
      ],
      [
        'increaseAmount',
        builder.getIncreaseAmountTxData({ tokenId: id, amount }),
        [9007199254740993n, MaxUint256],
      ],
      ['increaseUnlockTime', builder.getIncreaseUnlockTimeTxData(id, 0), [9007199254740993n, 0n]],
      ['lockPermanent', builder.getLockPermanentTxData(MaxUint256), [MaxUint256]],
      ['unlockPermanent', builder.getUnlockPermanentTxData(0n), [0n]],
      [
        'earlyWithdraw(uint256)',
        builder.getEarlyWithdrawTxData(id, undefined),
        [9007199254740993n],
      ],
      [
        'earlyWithdraw(uint256,uint256)',
        builder.getEarlyWithdrawTxData(id, 0n),
        [9007199254740993n, 0n],
      ],
      ['withdraw', builder.getWithdrawTxData(id), [9007199254740993n]],
      [
        'merge',
        builder.getMergeTxData({ fromTokenId: id, toTokenId: MaxUint256 }),
        [9007199254740993n, MaxUint256],
      ],
      [
        'safeTransferFrom(address,address,uint256)',
        builder.getTransferTxData({ from: USER, to: RECIPIENT, tokenId: id }),
        [USER, RECIPIENT, 9007199254740993n],
      ],
    ] as const;
    for (const [signature, tx, expected] of transactions) {
      expect(tx.to).toBe(LOCK);
      expect(lockIface.decodeFunctionData(signature, tx.data).toArray()).toEqual(expected);
    }

    const approval = builder.getApprovalTxData(USER, amount);
    expect(approval.to).toBe(DUST);
    expect(erc20Iface.decodeFunctionData('approve', approval.data).toArray()).toEqual([
      LOCK,
      MaxUint256,
    ]);
    expect(call).not.toHaveBeenCalled();
    expect(getNetwork).not.toHaveBeenCalled();
  });

  it.each(invalidUints)('rejects invalid uint256 input %s without a provider', value => {
    expect(() => builder.getWithdrawTxData(value)).toThrow();
    expect(() => builder.getEarlyWithdrawTxData(0, value)).toThrow();
    expect(() => builder.getMergeTxData({ fromTokenId: 0, toTokenId: value })).toThrow();
  });

  it('validates configured addresses before producing transactions', () => {
    expect(
      () => new DustLockTransactionBuilder({ lockAddress: 'bad', dustTokenAddress: DUST }),
    ).toThrow();
    expect(
      () => new DustLockTransactionBuilder({ lockAddress: LOCK, dustTokenAddress: 'bad' }),
    ).toThrow();
  });
});
