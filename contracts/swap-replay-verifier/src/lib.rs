//! Swap replay proof registry for LP Guardian.
//!
//! The heavy 1,000-swap counterfactual replay runs off-chain inside the Phala
//! TEE. This Stylus contract anchors the replay inputs, outputs, and TEE
//! attestation hash on Robinhood Chain, while exposing small deterministic
//! helpers that make the proof reproducible.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloy_sol_types::{SolValue, sol};
use stylus_sdk::{
    alloy_primitives::{Address, B256, U256, keccak256},
    prelude::*,
};

const MAX_SWAP_COUNT: u32 = 1_000;
const FEE_DENOMINATOR: u64 = 1_000_000;

sol_storage! {
    #[entrypoint]
    pub struct SwapReplayVerifier {
        mapping(bytes32 => ReplayProof) replays;
        mapping(uint256 => bytes32[]) subject_replays;
    }

    pub struct ReplayProof {
        address publisher;
        uint256 timestamp;
        address portfolio_owner;
        uint256 subject_id;
        address pool;
        uint256 from_block;
        uint256 to_block;
        uint256 swap_count;
        bytes32 input_root;
        bytes32 result_hash;
        bytes32 attestation_hash;
        bytes32 tee_image_hash;
    }
}

sol! {
    event ReplayPublished(
        bytes32 indexed replayId,
        uint256 indexed subjectId,
        address indexed publisher,
        address portfolioOwner,
        address pool,
        uint64 fromBlock,
        uint64 toBlock,
        uint32 swapCount,
        bytes32 inputRoot,
        bytes32 resultHash,
        bytes32 attestationHash,
        bytes32 teeImageHash
    );

    error AlreadyPublished(bytes32 replayId);
    error EmptyInputRoot();
    error EmptyResultHash();
    error EmptyAttestationHash();
    error InvalidBlockRange(uint64 fromBlock, uint64 toBlock);
    error InvalidSwapCount(uint32 swapCount);
    error ReplayIndexOutOfBounds(uint256 subjectId, uint256 index);
    error ZeroPool();
    error ZeroPortfolioOwner();
}

#[derive(SolidityError)]
pub enum SwapReplayError {
    AlreadyPublished(AlreadyPublished),
    EmptyInputRoot(EmptyInputRoot),
    EmptyResultHash(EmptyResultHash),
    EmptyAttestationHash(EmptyAttestationHash),
    InvalidBlockRange(InvalidBlockRange),
    InvalidSwapCount(InvalidSwapCount),
    ReplayIndexOutOfBounds(ReplayIndexOutOfBounds),
    ZeroPool(ZeroPool),
    ZeroPortfolioOwner(ZeroPortfolioOwner),
}

#[public]
impl SwapReplayVerifier {
    pub fn publish_replay(
        &mut self,
        portfolio_owner: Address,
        subject_id: U256,
        pool: Address,
        from_block: u64,
        to_block: u64,
        swap_count: u32,
        input_root: B256,
        result_hash: B256,
        attestation_hash: B256,
        tee_image_hash: B256,
    ) -> Result<B256, SwapReplayError> {
        validate_replay_inputs(
            portfolio_owner,
            pool,
            from_block,
            to_block,
            swap_count,
            input_root,
            result_hash,
            attestation_hash,
        )?;

        let replay_id = compute_replay_id_inner(
            portfolio_owner,
            subject_id,
            pool,
            from_block,
            to_block,
            swap_count,
            input_root,
            result_hash,
            attestation_hash,
            tee_image_hash,
        );

        if self.replays.get(replay_id).publisher.get() != Address::ZERO {
            return Err(SwapReplayError::AlreadyPublished(AlreadyPublished {
                replayId: replay_id,
            }));
        }

        let publisher = self.vm().msg_sender();
        let timestamp = U256::from(self.vm().block_timestamp());

        let mut replay = self.replays.setter(replay_id);
        replay.publisher.set(publisher);
        replay.timestamp.set(timestamp);
        replay.portfolio_owner.set(portfolio_owner);
        replay.subject_id.set(subject_id);
        replay.pool.set(pool);
        replay.from_block.set(U256::from(from_block));
        replay.to_block.set(U256::from(to_block));
        replay.swap_count.set(U256::from(swap_count));
        replay.input_root.set(input_root);
        replay.result_hash.set(result_hash);
        replay.attestation_hash.set(attestation_hash);
        replay.tee_image_hash.set(tee_image_hash);

        self.subject_replays.setter(subject_id).push(replay_id);

        self.vm().log(ReplayPublished {
            replayId: replay_id,
            subjectId: subject_id,
            publisher,
            portfolioOwner: portfolio_owner,
            pool,
            fromBlock: from_block,
            toBlock: to_block,
            swapCount: swap_count,
            inputRoot: input_root,
            resultHash: result_hash,
            attestationHash: attestation_hash,
            teeImageHash: tee_image_hash,
        });

        Ok(replay_id)
    }

    pub fn get_replay(
        &self,
        replay_id: B256,
    ) -> (
        Address,
        U256,
        Address,
        U256,
        Address,
        U256,
        U256,
        U256,
        B256,
        B256,
        B256,
        B256,
    ) {
        let replay = self.replays.get(replay_id);
        (
            replay.publisher.get(),
            replay.timestamp.get(),
            replay.portfolio_owner.get(),
            replay.subject_id.get(),
            replay.pool.get(),
            replay.from_block.get(),
            replay.to_block.get(),
            replay.swap_count.get(),
            replay.input_root.get(),
            replay.result_hash.get(),
            replay.attestation_hash.get(),
            replay.tee_image_hash.get(),
        )
    }

    pub fn replay_count(&self, subject_id: U256) -> U256 {
        U256::from(self.subject_replays.get(subject_id).len())
    }

    pub fn replay_at(&self, subject_id: U256, index: U256) -> Result<B256, SwapReplayError> {
        let replays = self.subject_replays.get(subject_id);
        replays.get(index).ok_or_else(|| {
            SwapReplayError::ReplayIndexOutOfBounds(ReplayIndexOutOfBounds {
                subjectId: subject_id,
                index,
            })
        })
    }

    pub fn compute_replay_id(
        &self,
        portfolio_owner: Address,
        subject_id: U256,
        pool: Address,
        from_block: u64,
        to_block: u64,
        swap_count: u32,
        input_root: B256,
        result_hash: B256,
        attestation_hash: B256,
        tee_image_hash: B256,
    ) -> B256 {
        compute_replay_id_inner(
            portfolio_owner,
            subject_id,
            pool,
            from_block,
            to_block,
            swap_count,
            input_root,
            result_hash,
            attestation_hash,
            tee_image_hash,
        )
    }

    pub fn compute_fee(&self, amount_in: U256, fee_pips: u32) -> (U256, U256) {
        compute_fee_inner(amount_in, fee_pips)
    }
}

#[allow(clippy::too_many_arguments)]
pub fn compute_replay_id_inner(
    portfolio_owner: Address,
    subject_id: U256,
    pool: Address,
    from_block: u64,
    to_block: u64,
    swap_count: u32,
    input_root: B256,
    result_hash: B256,
    attestation_hash: B256,
    tee_image_hash: B256,
) -> B256 {
    let encoded = (
        portfolio_owner,
        subject_id,
        pool,
        U256::from(from_block),
        U256::from(to_block),
        U256::from(swap_count),
        input_root,
        result_hash,
        attestation_hash,
        tee_image_hash,
    )
        .abi_encode_packed();

    keccak256(encoded)
}

pub fn compute_fee_inner(amount_in: U256, fee_pips: u32) -> (U256, U256) {
    let fee_pips = u64::from(fee_pips).min(FEE_DENOMINATOR);
    let fee_amount = amount_in * U256::from(fee_pips) / U256::from(FEE_DENOMINATOR);
    (amount_in.saturating_sub(fee_amount), fee_amount)
}

#[allow(clippy::too_many_arguments)]
fn validate_replay_inputs(
    portfolio_owner: Address,
    pool: Address,
    from_block: u64,
    to_block: u64,
    swap_count: u32,
    input_root: B256,
    result_hash: B256,
    attestation_hash: B256,
) -> Result<(), SwapReplayError> {
    if portfolio_owner == Address::ZERO {
        return Err(SwapReplayError::ZeroPortfolioOwner(ZeroPortfolioOwner {}));
    }
    if pool == Address::ZERO {
        return Err(SwapReplayError::ZeroPool(ZeroPool {}));
    }
    if from_block > to_block {
        return Err(SwapReplayError::InvalidBlockRange(InvalidBlockRange {
            fromBlock: from_block,
            toBlock: to_block,
        }));
    }
    if swap_count == 0 || swap_count > MAX_SWAP_COUNT {
        return Err(SwapReplayError::InvalidSwapCount(InvalidSwapCount {
            swapCount: swap_count,
        }));
    }
    if input_root == B256::ZERO {
        return Err(SwapReplayError::EmptyInputRoot(EmptyInputRoot {}));
    }
    if result_hash == B256::ZERO {
        return Err(SwapReplayError::EmptyResultHash(EmptyResultHash {}));
    }
    if attestation_hash == B256::ZERO {
        return Err(SwapReplayError::EmptyAttestationHash(
            EmptyAttestationHash {},
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use stylus_sdk::testing::*;

    #[derive(Clone, Copy)]
    struct Fixture {
        owner: Address,
        subject_id: U256,
        pool: Address,
        from_block: u64,
        to_block: u64,
        swap_count: u32,
        input_root: B256,
        result_hash: B256,
        attestation_hash: B256,
        tee_image_hash: B256,
    }

    fn b256(n: u8) -> B256 {
        B256::from([n; 32])
    }

    fn fixture() -> Fixture {
        Fixture {
            owner: Address::from([0x11; 20]),
            subject_id: U256::from(605311),
            pool: Address::from([0x22; 20]),
            from_block: 10_000,
            to_block: 11_000,
            swap_count: 1_000,
            input_root: b256(0xa1),
            result_hash: b256(0xb2),
            attestation_hash: b256(0xc3),
            tee_image_hash: b256(0xd4),
        }
    }

    fn publish(contract: &mut SwapReplayVerifier, f: Fixture) -> Result<B256, SwapReplayError> {
        contract.publish_replay(
            f.owner,
            f.subject_id,
            f.pool,
            f.from_block,
            f.to_block,
            f.swap_count,
            f.input_root,
            f.result_hash,
            f.attestation_hash,
            f.tee_image_hash,
        )
    }

    fn must<T>(result: Result<T, SwapReplayError>) -> T {
        match result {
            Ok(value) => value,
            Err(_) => panic!("expected successful swap replay call"),
        }
    }

    #[test]
    fn publish_replay_stores_and_indexes_proof() {
        let vm = TestVM::default();
        let mut contract = SwapReplayVerifier::from(&vm);
        let f = fixture();
        let replay_id = must(publish(&mut contract, f));

        let (
            publisher,
            _timestamp,
            owner,
            subject_id,
            pool,
            from_block,
            to_block,
            swap_count,
            input_root,
            result_hash,
            attestation_hash,
            tee_image_hash,
        ) = contract.get_replay(replay_id);

        assert_eq!(publisher, contract.vm().msg_sender());
        assert_eq!(owner, f.owner);
        assert_eq!(subject_id, f.subject_id);
        assert_eq!(pool, f.pool);
        assert_eq!(from_block, U256::from(f.from_block));
        assert_eq!(to_block, U256::from(f.to_block));
        assert_eq!(swap_count, U256::from(f.swap_count));
        assert_eq!(input_root, f.input_root);
        assert_eq!(result_hash, f.result_hash);
        assert_eq!(attestation_hash, f.attestation_hash);
        assert_eq!(tee_image_hash, f.tee_image_hash);
        assert_eq!(contract.replay_count(f.subject_id), U256::from(1));
        assert_eq!(
            must(contract.replay_at(f.subject_id, U256::ZERO)),
            replay_id
        );
    }

    #[test]
    fn publish_replay_rejects_duplicate_replay_id() {
        let vm = TestVM::default();
        let mut contract = SwapReplayVerifier::from(&vm);
        let f = fixture();

        must(publish(&mut contract, f));
        let result = publish(&mut contract, f);

        assert!(matches!(result, Err(SwapReplayError::AlreadyPublished(_))));
    }

    #[test]
    fn publish_replay_rejects_zero_owner() {
        let vm = TestVM::default();
        let mut contract = SwapReplayVerifier::from(&vm);
        let mut f = fixture();
        f.owner = Address::ZERO;

        assert!(matches!(
            publish(&mut contract, f),
            Err(SwapReplayError::ZeroPortfolioOwner(_))
        ));
    }

    #[test]
    fn publish_replay_rejects_zero_pool() {
        let vm = TestVM::default();
        let mut contract = SwapReplayVerifier::from(&vm);
        let mut f = fixture();
        f.pool = Address::ZERO;

        assert!(matches!(
            publish(&mut contract, f),
            Err(SwapReplayError::ZeroPool(_))
        ));
    }

    #[test]
    fn publish_replay_rejects_invalid_block_range() {
        let vm = TestVM::default();
        let mut contract = SwapReplayVerifier::from(&vm);
        let mut f = fixture();
        f.from_block = 11_001;

        assert!(matches!(
            publish(&mut contract, f),
            Err(SwapReplayError::InvalidBlockRange(_))
        ));
    }

    #[test]
    fn publish_replay_rejects_invalid_swap_count() {
        let vm = TestVM::default();
        let mut contract = SwapReplayVerifier::from(&vm);
        let mut f = fixture();
        f.swap_count = 0;

        assert!(matches!(
            publish(&mut contract, f),
            Err(SwapReplayError::InvalidSwapCount(_))
        ));

        f.swap_count = 1_001;
        assert!(matches!(
            publish(&mut contract, f),
            Err(SwapReplayError::InvalidSwapCount(_))
        ));
    }

    #[test]
    fn publish_replay_rejects_empty_hashes() {
        let vm = TestVM::default();
        let mut contract = SwapReplayVerifier::from(&vm);

        let mut f = fixture();
        f.input_root = B256::ZERO;
        assert!(matches!(
            publish(&mut contract, f),
            Err(SwapReplayError::EmptyInputRoot(_))
        ));

        let mut f = fixture();
        f.result_hash = B256::ZERO;
        assert!(matches!(
            publish(&mut contract, f),
            Err(SwapReplayError::EmptyResultHash(_))
        ));

        let mut f = fixture();
        f.attestation_hash = B256::ZERO;
        assert!(matches!(
            publish(&mut contract, f),
            Err(SwapReplayError::EmptyAttestationHash(_))
        ));
    }

    #[test]
    fn subject_history_appends_replay_ids() {
        let vm = TestVM::default();
        let mut contract = SwapReplayVerifier::from(&vm);
        let mut f = fixture();

        let first = must(publish(&mut contract, f));
        f.result_hash = b256(0xee);
        let second = must(publish(&mut contract, f));

        assert_ne!(first, second);
        assert_eq!(contract.replay_count(f.subject_id), U256::from(2));
        assert_eq!(must(contract.replay_at(f.subject_id, U256::ZERO)), first);
        assert_eq!(
            must(contract.replay_at(f.subject_id, U256::from(1))),
            second
        );
    }

    #[test]
    fn replay_at_rejects_out_of_bounds_index() {
        let vm = TestVM::default();
        let contract = SwapReplayVerifier::from(&vm);

        assert!(matches!(
            contract.replay_at(U256::from(42), U256::ZERO),
            Err(SwapReplayError::ReplayIndexOutOfBounds(_))
        ));
    }

    #[test]
    fn replay_id_is_deterministic_and_input_sensitive() {
        let f = fixture();
        let first = compute_replay_id_inner(
            f.owner,
            f.subject_id,
            f.pool,
            f.from_block,
            f.to_block,
            f.swap_count,
            f.input_root,
            f.result_hash,
            f.attestation_hash,
            f.tee_image_hash,
        );
        let second = compute_replay_id_inner(
            f.owner,
            f.subject_id,
            f.pool,
            f.from_block,
            f.to_block,
            f.swap_count,
            f.input_root,
            f.result_hash,
            f.attestation_hash,
            f.tee_image_hash,
        );
        let changed = compute_replay_id_inner(
            f.owner,
            f.subject_id,
            f.pool,
            f.from_block,
            f.to_block,
            f.swap_count - 1,
            f.input_root,
            f.result_hash,
            f.attestation_hash,
            f.tee_image_hash,
        );

        assert_eq!(first, second);
        assert_ne!(first, changed);
    }

    #[test]
    fn compute_fee_handles_common_uniswap_fee_tiers() {
        let amount = U256::from(1_000_000_u64);

        assert_eq!(
            compute_fee_inner(amount, 500),
            (U256::from(999_500_u64), U256::from(500_u64))
        );
        assert_eq!(
            compute_fee_inner(amount, 3_000),
            (U256::from(997_000_u64), U256::from(3_000_u64))
        );
        assert_eq!(
            compute_fee_inner(amount, 10_000),
            (U256::from(990_000_u64), U256::from(10_000_u64))
        );
    }

    #[test]
    fn compute_fee_caps_impossible_fee_tiers() {
        assert_eq!(
            compute_fee_inner(U256::from(100_u64), 2_000_000),
            (U256::ZERO, U256::from(100_u64))
        );
    }

    #[test]
    fn compute_fee_rounds_down_like_integer_math() {
        assert_eq!(
            compute_fee_inner(U256::from(333_u64), 3_000),
            (U256::from(333_u64), U256::ZERO)
        );
    }
}
