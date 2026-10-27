export type ReservesHelperInput = { lendingPoolAddressProvider: string };
export type UserReservesHelperInput = ReservesHelperInput & { user: string };
export type Options = { blockTag?: string | number };
