import { erc20Abi } from '@neverland-money/contract-types';
import type { Provider } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { ERC20Validator } from '../commons/validators/method-validators';
import { isEthAddress } from '../commons/validators/param-validators';
export type GetNonceType = { token: string; owner: string };
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ERC20_2612Interface {
  getNonce: (args: GetNonceType) => Promise<bigint | null>;
}
export class ERC20_2612Service
  extends AbiBaseService<typeof erc20Abi>
  implements ERC20_2612Interface
{
  constructor(provider: Provider) {
    super(provider, erc20Abi);
    this.getNonce = this.getNonce.bind(this);
  }

  @ERC20Validator
  public async getNonce(
    @isEthAddress('token') @isEthAddress('owner') { token, owner }: GetNonceType,
  ): Promise<bigint | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      return await this.readContract(token, 'nonces', [owner as `0x${string}`]);
    } catch {
      return null;
    }
  }
}
