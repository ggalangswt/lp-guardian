//! Portfolio-level report registry for LP Guardian.
//!
//! This is the Arbitrum Stylus port of the LP Doctor report anchor pattern.
//! It keeps `rootHash` as the canonical key while adding portfolio-native
//! owner and subject fields for LP Guardian reports.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloy_sol_types::sol;
use stylus_sdk::{
    alloy_primitives::{Address, B256, U256},
    prelude::*,
};

sol_storage! {
    #[entrypoint]
    pub struct PortfolioReportRegistry {
        mapping(bytes32 => Report) reports;
        mapping(uint256 => bytes32[]) subject_reports;
    }

    pub struct Report {
        address publisher;
        uint256 timestamp;
        address portfolio_owner;
        uint256 subject_id;
        bytes32 root_hash;
        bytes32 attestation_hash;
    }
}

sol! {
    event ReportPublished(
        bytes32 indexed rootHash,
        uint256 indexed subjectId,
        address indexed publisher,
        address portfolioOwner,
        uint256 timestamp,
        bytes32 attestationHash
    );

    error AlreadyPublished(bytes32 rootHash);
    error EmptyRootHash();
    error ZeroPortfolioOwner();
    error ReportIndexOutOfBounds(uint256 subjectId, uint256 index);
}

#[derive(SolidityError)]
pub enum RegistryError {
    AlreadyPublished(AlreadyPublished),
    EmptyRootHash(EmptyRootHash),
    ZeroPortfolioOwner(ZeroPortfolioOwner),
    ReportIndexOutOfBounds(ReportIndexOutOfBounds),
}

#[public]
impl PortfolioReportRegistry {
    pub fn publish_report(
        &mut self,
        portfolio_owner: Address,
        subject_id: U256,
        root_hash: B256,
        attestation_hash: B256,
    ) -> Result<(), RegistryError> {
        if root_hash == B256::ZERO {
            return Err(RegistryError::EmptyRootHash(EmptyRootHash {}));
        }
        if portfolio_owner == Address::ZERO {
            return Err(RegistryError::ZeroPortfolioOwner(ZeroPortfolioOwner {}));
        }
        if self.reports.get(root_hash).publisher.get() != Address::ZERO {
            return Err(RegistryError::AlreadyPublished(AlreadyPublished {
                rootHash: root_hash,
            }));
        }

        let publisher = self.vm().msg_sender();
        let timestamp = U256::from(self.vm().block_timestamp());

        let mut report = self.reports.setter(root_hash);
        report.publisher.set(publisher);
        report.timestamp.set(timestamp);
        report.portfolio_owner.set(portfolio_owner);
        report.subject_id.set(subject_id);
        report.root_hash.set(root_hash);
        report.attestation_hash.set(attestation_hash);

        self.subject_reports.setter(subject_id).push(root_hash);

        self.vm().log(ReportPublished {
            rootHash: root_hash,
            subjectId: subject_id,
            publisher,
            portfolioOwner: portfolio_owner,
            timestamp,
            attestationHash: attestation_hash,
        });

        Ok(())
    }

    pub fn get_report(&self, root_hash: B256) -> (Address, U256, Address, U256, B256, B256) {
        let report = self.reports.get(root_hash);
        (
            report.publisher.get(),
            report.timestamp.get(),
            report.portfolio_owner.get(),
            report.subject_id.get(),
            report.root_hash.get(),
            report.attestation_hash.get(),
        )
    }

    pub fn report_count(&self, subject_id: U256) -> U256 {
        U256::from(self.subject_reports.get(subject_id).len())
    }

    pub fn report_at(&self, subject_id: U256, index: U256) -> Result<B256, RegistryError> {
        let reports = self.subject_reports.get(subject_id);
        reports.get(index).ok_or_else(|| {
            RegistryError::ReportIndexOutOfBounds(ReportIndexOutOfBounds {
                subjectId: subject_id,
                index,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use stylus_sdk::testing::*;

    fn b256(n: u8) -> B256 {
        B256::from([n; 32])
    }

    fn must<T>(result: Result<T, RegistryError>) -> T {
        match result {
            Ok(value) => value,
            Err(_) => panic!("expected successful registry call"),
        }
    }

    #[test]
    fn publish_report_stores_and_indexes_report() {
        let vm = TestVM::default();
        let mut contract = PortfolioReportRegistry::from(&vm);
        let owner = Address::from([0x11; 20]);
        let root = b256(0x7a);
        let attestation = b256(0xae);

        must(contract.publish_report(owner, U256::from(605311), root, attestation));

        let (publisher, _timestamp, stored_owner, subject_id, stored_root, stored_attestation) =
            contract.get_report(root);

        assert_eq!(publisher, contract.vm().msg_sender());
        assert_eq!(stored_owner, owner);
        assert_eq!(subject_id, U256::from(605311));
        assert_eq!(stored_root, root);
        assert_eq!(stored_attestation, attestation);
        assert_eq!(contract.report_count(U256::from(605311)), U256::from(1));
        assert_eq!(
            must(contract.report_at(U256::from(605311), U256::ZERO)),
            root
        );
    }

    #[test]
    fn publish_report_rejects_empty_root_hash() {
        let vm = TestVM::default();
        let mut contract = PortfolioReportRegistry::from(&vm);
        let result = contract.publish_report(
            Address::from([0x11; 20]),
            U256::from(1),
            B256::ZERO,
            b256(0x01),
        );

        assert!(matches!(result, Err(RegistryError::EmptyRootHash(_))));
    }

    #[test]
    fn publish_report_rejects_zero_portfolio_owner() {
        let vm = TestVM::default();
        let mut contract = PortfolioReportRegistry::from(&vm);
        let result = contract.publish_report(Address::ZERO, U256::from(1), b256(0x01), b256(0x02));

        assert!(matches!(result, Err(RegistryError::ZeroPortfolioOwner(_))));
    }

    #[test]
    fn publish_report_rejects_duplicate_root_hash() {
        let vm = TestVM::default();
        let mut contract = PortfolioReportRegistry::from(&vm);
        let owner = Address::from([0x11; 20]);
        let root = b256(0x02);

        must(contract.publish_report(owner, U256::from(1), root, b256(0x03)));
        let result = contract.publish_report(owner, U256::from(2), root, b256(0x04));

        assert!(matches!(result, Err(RegistryError::AlreadyPublished(_))));
    }

    #[test]
    fn report_history_appends_per_subject() {
        let vm = TestVM::default();
        let mut contract = PortfolioReportRegistry::from(&vm);
        let owner = Address::from([0x11; 20]);
        let subject_id = U256::from(42);

        must(contract.publish_report(owner, subject_id, b256(0x01), b256(0xa1)));
        must(contract.publish_report(owner, subject_id, b256(0x02), b256(0xa2)));
        must(contract.publish_report(owner, subject_id, b256(0x03), b256(0xa3)));

        assert_eq!(contract.report_count(subject_id), U256::from(3));
        assert_eq!(must(contract.report_at(subject_id, U256::ZERO)), b256(0x01));
        assert_eq!(
            must(contract.report_at(subject_id, U256::from(2))),
            b256(0x03)
        );
    }

    #[test]
    fn report_at_rejects_out_of_bounds_index() {
        let vm = TestVM::default();
        let contract = PortfolioReportRegistry::from(&vm);
        let result = contract.report_at(U256::from(42), U256::ZERO);

        assert!(matches!(
            result,
            Err(RegistryError::ReportIndexOutOfBounds(_))
        ));
    }
}
