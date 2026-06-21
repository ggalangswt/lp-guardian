import { useState } from "react";
import { hashTypedData } from "viem";
import {
  useAccount,
  useChainId,
  useSignTypedData,
} from "wagmi";
import {
  E2E_MOCK_ACCOUNT,
  PERMIT2_ADDRESS,
} from "../lib/walletConfig.js";
import { API_BASE_URL } from "../lib/api.js";

// Builds the EIP-712 PermitSingle for the Permit2 contract and
// asks the connected wallet to sign it. The signature is what the
// migration bundle would attach as the user's authorization to the
// V3 → swap → V4 sequence — execution itself is out of scope for the
// hackathon demo. The agent never executes the bundle; the user signs,
// the panel shows the signature, and Permit2 makes it possible to
// submit the bundle later without exposing custody to the agent.

const PERMIT2_DOMAIN = {
  name: "Permit2",
  // Permit2 deploys with a fixed verifyingContract across chains.
  verifyingContract: PERMIT2_ADDRESS as `0x${string}`,
} as const;

const PERMIT_SINGLE_TYPES = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
} as const;

export interface MigrationSignArgs {
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  expiration: number;        // unix seconds, 30 days from now is conventional
  nonce: number;
  sigDeadline: number;       // unix seconds, 30 minutes is typical
}

export interface MigrationSignResult {
  signature: `0x${string}`;
  signer: `0x${string}`;
  chainId: number;
  domain: { name: string; chainId: number; verifyingContract: `0x${string}` };
  message: {
    details: {
      token: `0x${string}`;
      amount: string;
      expiration: number;
      nonce: number;
    };
    spender: `0x${string}`;
    sigDeadline: string;
  };
  /** EIP-712 typed-data hash of what was signed (the value the wallet hashed). */
  digest: `0x${string}`;
  signedAt: string;
}

export interface MigrationRecordReceipt {
  lpTokenId: string;
  signer: `0x${string}`;
  digest: `0x${string}`;
  receipt: {
    tokenId: number;
    contract: string;
    permit2Digest: string;
    migrationsTriggered: number;
    txHash?: string;
    explorerUrl?: string;
    stub: boolean;
    warnings: string[];
  };
}

export function usePermit2Migration() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync, isPending } = useSignTypedData();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MigrationSignResult | null>(null);

  const sign = async (
    args: MigrationSignArgs,
  ): Promise<MigrationSignResult | null> => {
    setError(null);
    if (!address) {
      setError("Connect a wallet first.");
      return null;
    }

    const domain = {
      ...PERMIT2_DOMAIN,
      chainId,
    };
    const message = {
      details: {
        token: args.tokenAddress,
        amount: args.amount,
        expiration: args.expiration,
        nonce: args.nonce,
      },
      spender: args.spender,
      sigDeadline: BigInt(args.sigDeadline),
    } as const;

    try {
      // E2E mock path — wagmi's mock connector returns a fake signature
      // that the backend's recoverTypedDataAddress will reject. Sign
      // with the local viem account instead so the digest+sig actually
      // round-trips. Production builds never enter this branch.
      const signature = E2E_MOCK_ACCOUNT
        ? await E2E_MOCK_ACCOUNT.signTypedData({
            domain,
            types: PERMIT_SINGLE_TYPES,
            primaryType: "PermitSingle",
            message,
          })
        : await signTypedDataAsync({
            domain,
            types: PERMIT_SINGLE_TYPES,
            primaryType: "PermitSingle",
            message,
          });
      const signer = E2E_MOCK_ACCOUNT?.address ?? address;
      const digest = hashTypedData({
        domain,
        types: PERMIT_SINGLE_TYPES,
        primaryType: "PermitSingle",
        message,
      });
      const out: MigrationSignResult = {
        signature,
        signer,
        chainId,
        domain: {
          name: domain.name,
          chainId,
          verifyingContract: domain.verifyingContract,
        },
        message: {
          details: {
            token: args.tokenAddress,
            amount: args.amount.toString(),
            expiration: args.expiration,
            nonce: args.nonce,
          },
          spender: args.spender,
          sigDeadline: args.sigDeadline.toString(),
        },
        digest,
        signedAt: new Date().toISOString(),
      };
      setResult(out);
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    }
  };

  /**
   * Posts the just-signed typed data to the backend so it can verify
   * the signature, compute the digest server-side, and call
   * LPGuardianAgent.recordMigration to bump the agent's
   * `migrationsTriggered` counter on Mantle.
   *
   * Best-effort: any HTTP failure surfaces in `error` but does not
   * throw — the migration sign UX is already complete by the time
   * this fires.
   */
  const recordMigration = async (
    lpTokenId: string,
    signed: MigrationSignResult,
  ): Promise<MigrationRecordReceipt | null> => {
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/migrate/${lpTokenId}/recorded`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenId: lpTokenId,
            signer: signed.signer,
            signature: signed.signature,
            domain: signed.domain,
            types: PERMIT_SINGLE_TYPES,
            primaryType: "PermitSingle",
            message: signed.message,
          }),
        },
      );
      if (!res.ok) {
        setError(`migrate-recorded HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as MigrationRecordReceipt;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  return { sign, recordMigration, isPending, error, result };
}
