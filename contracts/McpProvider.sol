// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import '@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/// @title An MCP service registry
/// @author gmluqa
/// @notice Registers MCP services and their pricing per thirty days on-chain
/// @dev All license data is stored on-chain and priced in AVAX using a Chainlink AVAX/USD price feed
contract McpProvider is Ownable {
    /// @notice Emitted when a provider mints a new license
    event McpProviderRegistered(
        address indexed provider,
        uint256 amountPaid,
        uint256 indexed providerNonce
    );

    /// @notice Emitted when a provider sets the subscription price for their service
    event McpProviderUpdated(
        address indexed provider,
        uint256 indexed providerNonce,
        uint256 priceUsd
    );

    /// @notice Metadata about an MCP license issued by a provider
    struct License {
        uint256 providerNonce; // Unique global license ID
        address providerAddress; // Who minted the MCP
        uint256 amountPaid; // Amount of AVAX paid (in wei)
        string serviceName;
        uint256 usdPriceForConsumerMonth; // e.g. $50/month (in USD, 18 decimals)
        string serviceDescription;
        string url;
    }

    /// @notice Maps global license ID (providerNonce) to its metadata
    mapping(uint256 => License) public licenses;

    /// @notice Maps provider address to all license IDs (providerNonce) they've issued
    mapping(address => uint256[]) public providerLicenses;

    /// @notice Tracks the next unique license ID to be assigned
    uint256 public globalProviderNonce;

    AggregatorV3Interface internal priceFeed;

    uint256 public usdLicenseFee = 10 * 10 ** 18; // $10 license (18 decimals)

    constructor(address _priceFeed) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    /// @notice Registers or updates an MCP license with a subscription price and metadata
    /// @dev If _nonce is 0, it mints a new license and assigns a nonce; otherwise, updates an existing one
    ///      Price is set in USD but paid in AVAX using Chainlink AVAX/USD feed.
    ///      AVAX price volatility may cause short-lived under/overpayment edge cases.
    function registerMcp(
        string calldata _serviceName,
        uint256 _usdPriceForConsumerMonth,
        string calldata _serviceDescription,
        string memory _url
    ) external payable {
        uint256 requiredAvax = getLicenseFeeInAvax();
        require(msg.value >= requiredAvax, 'Less than $10 worth of AVAX sent');

        uint256 nonceToUse = globalProviderNonce++;
        licenses[nonceToUse] = License({
            providerNonce: nonceToUse,
            providerAddress: msg.sender,
            amountPaid: msg.value,
            serviceName: _serviceName,
            serviceDescription: _serviceDescription,
            usdPriceForConsumerMonth: _usdPriceForConsumerMonth,
            url: _url
        });

        providerLicenses[msg.sender].push(nonceToUse);
        emit McpProviderRegistered(msg.sender, msg.value, nonceToUse);
    }

    function updateMcp(
        uint256 _nonce,
        string calldata _serviceName,
        uint256 _usdPriceForConsumerMonth,
        string calldata _serviceDescription,
        string memory _url
    ) external {
        require(_nonce < globalProviderNonce, 'Invalid nonce');
        License storage lic = licenses[_nonce];
        require(lic.providerAddress == msg.sender, 'Not your license');

        lic.serviceName = _serviceName;
        lic.serviceDescription = _serviceDescription;
        lic.usdPriceForConsumerMonth = _usdPriceForConsumerMonth;
        lic.url = _url;

        emit McpProviderUpdated(msg.sender, _nonce, _usdPriceForConsumerMonth);
    }

    /// @notice Withdraw AVAX from the contract,
    /// @dev For testing purposes and funds rescue only, will be removed in future
    function withdrawAvax(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, 'Nothing to withdraw');
        to.transfer(balance);
    }

    /// @notice Returns all MCP licenses owned by a given provider address
    /// @param provider The address of the MCP provider
    /// @return An array of License structs associated with the provider
    function getAllMcpsByAddress(address provider) external view returns (License[] memory) {
        uint256[] memory licenseIds = providerLicenses[provider];
        License[] memory result = new License[](licenseIds.length);

        for (uint256 i = 0; i < licenseIds.length; i++) {
            result[i] = licenses[licenseIds[i]];
        }
        return result;
    }

    function getServiceDetails(
        uint256 nonce
    )
        external
        view
        returns (
            uint256 providerNonce,
            address providerAddress,
            string memory serviceName,
            uint256 usdPriceForConsumerMonth,
            string memory serviceDescription,
            string memory url
        )
    {
        require(nonce < globalProviderNonce, 'License does not exist');
        License storage lic = licenses[nonce];
        return (
            lic.providerNonce,
            lic.providerAddress,
            lic.serviceName,
            lic.usdPriceForConsumerMonth,
            lic.serviceDescription,
            lic.url
        );
    }

    function exists(uint256 _nonce) external view returns (bool) {
        return _nonce < globalProviderNonce;
    }

    function getLatestAvaxUsdPrice() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, 'Invalid price');
        return uint256(price); // 8 decimals
    }

    function getLicenseFeeInAvax() public view returns (uint256) {
        uint256 price = getLatestAvaxUsdPrice(); // 8 decimals
        return (usdLicenseFee * 10 ** 8) / price;
    }
}
