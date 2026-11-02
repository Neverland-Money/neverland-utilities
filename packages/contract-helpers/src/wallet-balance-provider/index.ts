import { walletBalanceProviderAbi } from '@neverland-money/contract-types';
import type { Provider } from 'ethers';
import { isAddress } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import type { Options } from '../commons/read-types';
import type {
  BalanceOfResponse,
  BatchBalanceOfResponse,
  UserWalletBalancesResponse,
} from './types/wallet-balance-provider-types';
export type * from './types/wallet-balance-provider-types';
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface WalletBalanceProviderContext {
  walletBalanceProviderAddress: string;
  provider: Provider;
}

export class WalletBalanceProvider extends AbiBaseService<typeof walletBalanceProviderAbi> {
  /**
   * Constructor
   * @param context The wallet balance provider context
   */
  public constructor(context: WalletBalanceProviderContext) {
    super(context.provider, walletBalanceProviderAbi, context.walletBalanceProviderAddress);
  }

  /**
   *  Get the balance for a user on a token
   * @param user The user address
   * @param token The token address
   */
  public async balanceOf(user: string, token: string): Promise<BalanceOfResponse> {
    if (!isAddress(user)) {
      throw new Error('User address is not a valid ethereum address');
    }

    if (!isAddress(token)) {
      throw new Error('Token address is not a valid ethereum address');
    }

    return this.readContract(this.defaultAddress!, 'balanceOf', [
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      user as `0x${string}`,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      token as `0x${string}`,
    ]);
  }

  /**
   *  Get the balance for a user on a token
   * @param users The users addresses
   * @param tokens The tokens addresses
   */
  public async batchBalanceOf(
    users: string[],
    tokens: string[],
    opts: Options = {},
  ): Promise<BatchBalanceOfResponse> {
    if (!users.every(u => isAddress(u))) {
      throw new Error('One of the user address is not a valid ethereum address');
    }

    if (!tokens.every(u => isAddress(u))) {
      throw new Error('One of the token address is not a valid ethereum address');
    }

    const blockTag = opts.blockTag ?? 'latest';

    return [
      ...(await this.readContract(
        this.defaultAddress!,
        'batchBalanceOf',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
        [users as Array<`0x${string}`>, tokens as Array<`0x${string}`>],
        { blockTag },
      )),
    ];
  }

  /**
   *  Provides balances of user wallet for all reserves available on the pool
   * @param user The user
   * @param lendingPoolAddressProvider The lending pool address provider
   */
  public async getUserWalletBalancesForLendingPoolProvider(
    user: string,
    lendingPoolAddressProvider: string,
  ): Promise<UserWalletBalancesResponse> {
    if (!isAddress(user)) {
      throw new Error('User address is not a valid ethereum address');
    }

    if (!isAddress(lendingPoolAddressProvider)) {
      throw new Error('Lending pool address provider is not a valid ethereum address');
    }

    return this.readContract(this.defaultAddress!, 'getUserWalletBalances', [
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      lendingPoolAddressProvider as `0x${string}`,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      user as `0x${string}`,
    ]);
  }
}
