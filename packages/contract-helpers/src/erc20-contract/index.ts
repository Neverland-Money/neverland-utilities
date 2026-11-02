import { erc20Abi } from '@neverland-money/contract-types';
import type { Contract, Interface, Provider, TransactionRequest } from 'ethers';
import { formatUnits, getNumber, MaxUint256 } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { estimateGas } from '../commons/gas-station';
import type {
  EthereumTransactionTypeExtended,
  tEthereumAddress,
  transactionType,
} from '../commons/types';
import { eEthereumTxType } from '../commons/types';
import {
  API_ETH_MOCK_ADDRESS,
  decimalsToCurrencyUnits,
  MAX_UINT_AMOUNT,
  SUPER_BIG_ALLOWANCE_NUMBER,
  valueToWei,
} from '../commons/utils';
import { ERC20Validator } from '../commons/validators/method-validators';
import { isEthAddress, isPositiveOrMinusOneAmount } from '../commons/validators/param-validators';

function parseApprovalAmount(amount: string): bigint {
  // BigInt() alone would also accept binary/octal prefixes and throw an unlabeled SyntaxError for
  // decimals or exponents.
  if (typeof amount !== 'string' || !/^\s*(?:\+?\d+|0[xX][\dA-Fa-f]+)\s*$/.test(amount)) {
    throw new TypeError('Approval amount must be an integer string');
  }

  const value = BigInt(amount);
  if (value < 0n || value > MaxUint256) {
    throw new RangeError('Approval amount must be within uint256 range');
  }

  return value;
}

export type IERC20ServiceInterface = {
  decimalsOf: (token: tEthereumAddress) => Promise<number>;
  getTokenData: (token: tEthereumAddress) => Promise<TokenMetadataType>;
  isApproved: (args: ApproveType & { nativeDecimals?: boolean }) => Promise<boolean>;
  approvedAmount: (args: AllowanceRequest) => Promise<string>;
  allowanceRaw: (args: AllowanceRequest) => Promise<bigint>;
  approve: (args: ApproveType) => EthereumTransactionTypeExtended;
  approveTxData: (args: ApproveType) => TransactionRequest;
};

export type TokenOwner = {
  user: tEthereumAddress;
  token: tEthereumAddress;
};

export type AllowanceRequest = TokenOwner & {
  spender: tEthereumAddress;
};

export type ApproveType = AllowanceRequest & {
  amount: string;
};

export type TokenMetadataType = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
};
export class ERC20Service
  extends AbiBaseService<typeof erc20Abi>
  implements IERC20ServiceInterface
{
  readonly tokenDecimals: Record<string, number>;

  readonly tokenMetadata: Record<string, TokenMetadataType>;

  readonly contractInterface: Interface;

  constructor(provider: Provider) {
    super(provider, erc20Abi, undefined, estimateGas);
    this.tokenDecimals = {};
    this.tokenMetadata = {};

    this.approve = this.approve.bind(this);
    this.approveTxData = this.approveTxData.bind(this);
    this.isApproved = this.isApproved.bind(this);
    this.getTokenData = this.getTokenData.bind(this);
    this.decimalsOf = this.decimalsOf.bind(this);
    this.contractInterface = this.iface;
  }

  /**
   * Generate approval tx data with legacy method, call tx() and gas() callbacks for tx data and gas estimation respectively
   * @param {string} user - Address to check allowance for
   * @param {string} token - Token which the user is spending
   * @param {string} spender - Address which is spending the tokens
   * @param {string} amount - Raw uint256 amount to approve, including zero to reset allowance
   * @returns {EthereumTransactionTypeExtended} legacy transaction response
   */
  @ERC20Validator
  public approve(
    @isEthAddress('user')
    @isEthAddress('token')
    @isEthAddress('spender')
    { user, token, spender, amount }: ApproveType,
  ): EthereumTransactionTypeExtended {
    const approvalAmount = parseApprovalAmount(amount);
    const erc20Contract: Contract = this.getContractInstance(token);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () => erc20Contract.approve.populateTransaction(spender, approvalAmount),
      from: user,
    });

    return {
      tx: txCallback,
      txType: eEthereumTxType.ERC20_APPROVAL,
      gas: this.generateTxPriceEstimation([], txCallback),
    };
  }

  /**
   * Generate approval tx data, ready to sign and submit to blockchain
   * @param {string} user - Address to check allowance for
   * @param {string} token - Token which the user is spending
   * @param {string} spender - Address which is spending the tokens
   * @param {string} amount - Raw uint256 amount to approve, including zero to reset allowance
   * @returns {TransactionRequest} Transaction response
   */
  @ERC20Validator
  public approveTxData(
    @isEthAddress('user')
    @isEthAddress('token')
    @isEthAddress('spender')
    { user, token, spender, amount }: ApproveType,
  ): TransactionRequest {
    const approvalAmount = parseApprovalAmount(amount);
    const tx: TransactionRequest = {};
    const txData = this.contractInterface.encodeFunctionData('approve', [spender, approvalAmount]);

    tx.data = txData;
    tx.to = token;
    tx.from = user;

    return tx;
  }

  /**
   * Qeuries whether user has approved spender to transfer tokens up to the specific amount
   * @param {string} user - Address to check allowance for
   * @param {string} token - Token which the user is spending
   * @param {string} spender - Address which is spending the tokens
   * @param {string} amount - Amount of token to checkif spender has allowance for
   * @returns {boolean} true if user has approved spender contract for greater than passed amount, false otherwise
   */
  @ERC20Validator
  public async isApproved(
    @isEthAddress('user')
    @isEthAddress('token')
    @isEthAddress('spender')
    @isPositiveOrMinusOneAmount('amount')
    { user, token, spender, amount, nativeDecimals }: ApproveType & { nativeDecimals?: boolean },
  ): Promise<boolean> {
    if (token.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) return true;
    const decimals = await this.decimalsOf(token);
    const allowance = await this.allowanceRaw({ user, token, spender });
    const amountBNWithDecimals: bigint =
      amount === '-1'
        ? BigInt(SUPER_BIG_ALLOWANCE_NUMBER)
        : BigInt(valueToWei(nativeDecimals ? formatUnits(amount, decimals) : amount, decimals));
    return allowance >= amountBNWithDecimals;
  }

  /**
   * Fetches the approval allowance of a user for a specific token and spender
   * @param {string} user - Address to check allowance for
   * @param {string} token - Token which the user is spending
   * @param {string} spender - Address which is spending the tokens
   * @returns {Promise<string>} Exact normalized token-unit allowance, or '-1' for native/unlimited
   * Use allowanceRaw for exact base-unit bigint reads.
   */
  @ERC20Validator
  public async approvedAmount(
    @isEthAddress('user')
    @isEthAddress('token')
    @isEthAddress('spender')
    { user, token, spender }: AllowanceRequest,
  ): Promise<string> {
    if (token.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) return '-1';
    const allowance = await this.allowanceRaw({ user, token, spender });
    if (allowance.toString() === MAX_UINT_AMOUNT) {
      return '-1';
    }

    const decimals = await this.decimalsOf(token);
    return decimalsToCurrencyUnits(allowance.toString(), decimals);
  }

  /**
   * Fetches the decimals of an ERC20 token, used for formatting amounts
   * @param {string} token - ERC20 token address
   * @returns {number} Decimal units of token amounts
   */
  @ERC20Validator
  public async decimalsOf(@isEthAddress() token: tEthereumAddress): Promise<number> {
    if (token.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) return 18;
    this.tokenDecimals[token] ||= getNumber(
      await this.readContract(token, 'decimals', []),
      'token decimals',
    );

    return this.tokenDecimals[token];
  }

  /**
   * Return basic details of an ERC20
   * @param {string} token - ERC20 token address
   * @returns {TokenMetadataType} ERC20 token metadata
   */
  @ERC20Validator
  public async getTokenData(@isEthAddress() token: tEthereumAddress): Promise<TokenMetadataType> {
    if (token.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
      return {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        address: token,
      };
    }

    // Needed because MKR does not return string for symbol and Name
    if (token.toLowerCase() === '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2'.toLowerCase()) {
      return {
        name: 'Maker',
        symbol: 'MKR',
        decimals: 18,
        address: token,
      };
    }

    if (!this.tokenMetadata[token]) {
      const [name, symbol, decimals]: [string, string, number] = await Promise.all([
        this.readContract(token, 'name', []),
        this.readContract(token, 'symbol', []),
        this.decimalsOf(token),
      ]);

      this.tokenMetadata[token] = {
        name,
        symbol,
        decimals,
        address: token,
      };
    }

    return this.tokenMetadata[token];
  }

  @ERC20Validator
  public async allowanceRaw(
    @isEthAddress('user')
    @isEthAddress('token')
    @isEthAddress('spender')
    { user, token, spender }: AllowanceRequest,
  ): Promise<bigint> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
    return this.readContract(token, 'allowance', [user as `0x${string}`, spender as `0x${string}`]);
  }
}
