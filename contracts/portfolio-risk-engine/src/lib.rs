//! Stateless portfolio risk scorer for LP Guardian.
//!
//! The backend computes aggregate portfolio metrics off-chain; this Stylus
//! contract deterministically turns those metrics into a risk score, tier,
//! and action code that can be independently recomputed on Robinhood Chain.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use stylus_sdk::{alloy_primitives::U256, prelude::*};

const BPS_DENOMINATOR: u64 = 10_000;
const WATCH_THRESHOLD_BPS: u64 = 2_000;
const REBALANCE_THRESHOLD_BPS: u64 = 5_000;
const URGENT_THRESHOLD_BPS: u64 = 8_000;

#[storage]
#[entrypoint]
pub struct PortfolioRiskEngine;

#[public]
impl PortfolioRiskEngine {
    pub fn compute_risk(
        &self,
        total_positions: U256,
        out_of_range_positions: U256,
        dust_positions: U256,
        correlated_exposure_bps: U256,
        concentration_bps: U256,
    ) -> (U256, u8, u8) {
        let score = compute_risk_score_bps(
            total_positions.to::<u64>(),
            out_of_range_positions.to::<u64>(),
            dust_positions.to::<u64>(),
            correlated_exposure_bps.to::<u64>(),
            concentration_bps.to::<u64>(),
        );
        let tier = risk_tier(score);
        let action = action_code(score, dust_positions.to::<u64>());

        (U256::from(score), tier, action)
    }
}

pub fn compute_risk_score_bps(
    total_positions: u64,
    out_of_range_positions: u64,
    dust_positions: u64,
    correlated_exposure_bps: u64,
    concentration_bps: u64,
) -> u64 {
    if total_positions == 0 {
        return 0;
    }

    let out_of_range_ratio = ratio_bps(out_of_range_positions, total_positions);
    let dust_ratio = ratio_bps(dust_positions, total_positions);
    let correlation = correlated_exposure_bps.min(BPS_DENOMINATOR);
    let concentration = concentration_bps.min(BPS_DENOMINATOR);

    let score =
        (out_of_range_ratio * 35) + (dust_ratio * 20) + (correlation * 25) + (concentration * 20);

    (score / 100).min(BPS_DENOMINATOR)
}

pub fn risk_tier(score_bps: u64) -> u8 {
    if score_bps >= URGENT_THRESHOLD_BPS {
        3
    } else if score_bps >= REBALANCE_THRESHOLD_BPS {
        2
    } else if score_bps >= WATCH_THRESHOLD_BPS {
        1
    } else {
        0
    }
}

pub fn action_code(score_bps: u64, dust_positions: u64) -> u8 {
    if score_bps >= URGENT_THRESHOLD_BPS || dust_positions >= 5 {
        3
    } else if score_bps >= REBALANCE_THRESHOLD_BPS {
        2
    } else if score_bps >= WATCH_THRESHOLD_BPS {
        1
    } else {
        0
    }
}

fn ratio_bps(numerator: u64, denominator: u64) -> u64 {
    if denominator == 0 {
        return 0;
    }
    ((numerator.min(denominator) * BPS_DENOMINATOR) / denominator).min(BPS_DENOMINATOR)
}

#[cfg(test)]
mod tests {
    use super::*;
    use stylus_sdk::testing::*;

    #[test]
    fn zero_positions_are_healthy() {
        let vm = TestVM::default();
        let contract = PortfolioRiskEngine::from(&vm);
        assert_eq!(
            contract.compute_risk(U256::ZERO, U256::ZERO, U256::ZERO, U256::ZERO, U256::ZERO),
            (U256::ZERO, 0, 0)
        );
    }

    #[test]
    fn healthy_portfolio_scores_low() {
        let vm = TestVM::default();
        let contract = PortfolioRiskEngine::from(&vm);
        let (score, tier, action) = contract.compute_risk(
            U256::from(10),
            U256::ZERO,
            U256::ZERO,
            U256::from(500),
            U256::from(700),
        );

        assert!(score < U256::from(WATCH_THRESHOLD_BPS));
        assert_eq!(tier, 0);
        assert_eq!(action, 0);
    }

    #[test]
    fn out_of_range_positions_raise_rebalance_tier() {
        let score = compute_risk_score_bps(10, 9, 3, 6_000, 7_000);

        assert!(score >= REBALANCE_THRESHOLD_BPS);
        assert_eq!(risk_tier(score), 2);
        assert_eq!(action_code(score, 3), 2);
    }

    #[test]
    fn dust_trap_recommends_consolidate_or_exit() {
        let score = compute_risk_score_bps(12, 1, 6, 1_000, 1_500);

        assert_eq!(action_code(score, 6), 3);
    }

    #[test]
    fn correlation_and_concentration_can_be_urgent() {
        let score = compute_risk_score_bps(8, 7, 4, 10_000, 10_000);

        assert_eq!(score, 8_562);
        assert_eq!(risk_tier(score), 3);
        assert_eq!(action_code(score, 4), 3);
    }

    #[test]
    fn ratios_are_capped() {
        assert_eq!(compute_risk_score_bps(2, 99, 99, 50_000, 50_000), 10_000);
    }
}
