import { TypedDataEncoder, Wallet, getAddress, recoverAddress, verifyTypedData } from 'ethers';
import * as helpers from '..';

type PermitParams = helpers.BuildErc2612PermitTypedDataParams;
const build = helpers.buildErc2612PermitTypedData;

const UINT256_MAX = (2n ** 256n - 1n).toString();
const OWNER = '0x0000000000000000000000000000000000000001';
const SPENDER = '0x0000000000000000000000000000000000000002';
const TOKEN = '0x0000000000000000000000000000000000000003';
const input = (): PermitParams => ({
  domain: { name: 'Agora Dollar', version: '1', chainId: 143, verifyingContract: TOKEN },
  owner: OWNER,
  spender: SPENDER,
  valueRaw: '1000000',
  nonceRaw: '9007199254740993',
  deadline: 1792916073,
});

describe('buildErc2612PermitTypedData', () => {
  it('returns the exact EIP-712 permit contract with normalized decimal numeric strings', () => {
    const params = input();
    params.valueRaw = '0001000000';
    params.domain.chainId = '00143';
    const data = build(params);
    expect(data).toEqual({
      domain: { name: 'Agora Dollar', version: '1', chainId: '143', verifyingContract: TOKEN },
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Permit',
      message: {
        owner: OWNER,
        spender: SPENDER,
        value: '1000000',
        nonce: '9007199254740993',
        deadline: '1792916073',
      },
    });
    expect(Object.keys(data.types)).toEqual(['Permit']);
  });

  it('signs and hashes through real ethers 6 with a large nonce and an explicit domain', async () => {
    // Public deterministic test key only; no provider, network, or live signing.
    const wallet = new Wallet(`0x${'11'.repeat(32)}`);
    const params = { ...input(), owner: wallet.address };
    const data = build(params);
    const independentTypes = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };
    const expectedMessage = {
      owner: wallet.address,
      spender: SPENDER,
      value: '1000000',
      nonce: '9007199254740993',
      deadline: '1792916073',
    };
    const digest = TypedDataEncoder.hash(params.domain, independentTypes, expectedMessage);
    expect(TypedDataEncoder.hash(data.domain, data.types, data.message)).toBe(digest);
    const signature = await wallet.signTypedData(data.domain, data.types, data.message);
    expect(verifyTypedData(data.domain, data.types, data.message, signature)).toBe(wallet.address);
    expect(recoverAddress(digest, signature)).toBe(wallet.address);
    expect(
      TypedDataEncoder.hash(data.domain, data.types, {
        ...data.message,
        nonce: '9007199254740992',
      }),
    ).not.toBe(digest);
    expect(
      TypedDataEncoder.hash({ ...data.domain, version: '2' }, data.types, data.message),
    ).not.toBe(digest);
  });

  it('allows zero revocation and inclusive uint256 nonce/deadline/chain boundaries', () => {
    const params = input();
    params.valueRaw = '0';
    params.nonceRaw = UINT256_MAX;
    params.deadline = UINT256_MAX;
    params.domain.chainId = UINT256_MAX;
    expect(build(params).message).toEqual({
      owner: OWNER,
      spender: SPENDER,
      value: '0',
      nonce: UINT256_MAX,
      deadline: UINT256_MAX,
    });
  });

  it.each(['valueRaw', 'nonceRaw'] as const)(
    'rejects malformed %s without numeric coercion',
    field => {
      for (const value of [
        '',
        '-1',
        '+1',
        '0.1',
        'NaN',
        'Infinity',
        '1e18',
        ' 1',
        '0x1',
        (2n ** 256n).toString(),
        1,
      ]) {
        const params = input();
        Reflect.set(params, field, value);
        expect(() => build(params)).toThrow();
      }
    },
  );

  it('rejects the unlimited permit sentinel', () => {
    expect(() => build({ ...input(), valueRaw: UINT256_MAX })).toThrow();
  });

  it.each(['chainId', 'deadline'] as const)('rejects unsafe or malformed %s', field => {
    for (const value of [
      Number.MAX_SAFE_INTEGER + 1,
      -1,
      1.1,
      NaN,
      Infinity,
      '',
      '-1',
      '+1',
      '1.1',
      '1e18',
      '0x1',
      (2n ** 256n).toString(),
    ]) {
      const params = input();
      if (field === 'chainId') params.domain.chainId = value;
      else params.deadline = value;
      expect(() => build(params)).toThrow();
    }
  });

  it('requires a positive chain ID and allows a zero deadline', () => {
    const params = input();
    params.deadline = 0;
    expect(build(params).message.deadline).toBe('0');
    params.domain.chainId = 0;
    expect(() => build(params)).toThrow();
  });

  it.each(['name', 'version'] as const)('requires explicit nonempty domain %s', field => {
    for (const value of ['', '  ', undefined]) {
      const params = input();
      Reflect.set(params.domain, field, value);
      expect(() => build(params)).toThrow();
    }
  });

  it('validates and normalizes each address and copies caller-owned objects', () => {
    for (const field of ['owner', 'spender', 'verifyingContract'] as const) {
      const params = input();
      if (field === 'verifyingContract') params.domain.verifyingContract = 'invalid';
      else params[field] = 'invalid';
      expect(() => build(params)).toThrow();
    }

    const params = input();
    params.owner = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const data = build(params);
    expect(data.message.owner).toBe(getAddress(params.owner));
    params.domain.version = '9';
    params.valueRaw = '2';
    expect(data.domain.version).toBe('1');
    expect(data.message.value).toBe('1000000');
  });
});
