// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import '@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol';
import {AutomationCompatibleInterface} from '@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './IMcpProvider.sol';

/// @title An MCP subscription consumer
/// @author gmluqa
/// @notice Handles subscription payments, expiry tracking, and upkeep resolution for MCP licenses
/// @dev Integrates with Chainlink price feeds and Automation to manage license lifecycles on-chain
contract McpConsumer is Ownable, AutomationCompatibleInterface {
    /// @notice Emitted when a consumer subscribes to an MCP
    event Subscribed(
        address indexed consumer,
        uint256 indexed subId,
        uint256 providerNonce,
        uint256 avaxPaid
    );

    /// @notice Emitted when a subscription is resolved (expired or refunded)
    event SubscriptionResolved(address indexed consumer, uint256 indexed subId, SubStatus status);

    /// @notice Status lifecycle of a subscription
    enum SubStatus {
        Active,
        Completed
    }

    /// @notice Subscription metadata per consumer
    struct Subscription {
        uint256 providerNonce; // ID of license subscribed to
        address providerAddress; // Owner of the license
        uint256 amountPaid; // AVAX paid for the license
        uint256 startTimestamp; // When the subscription started
        SubStatus status; // Current status of the subscription
        string url;
    }

    /// @notice Tracks subscriptions made by each consumer
    mapping(address => Subscription[]) public userSubscriptions;

    /// @notice Tracks all known consumers for upkeep scanning
    address[] public allConsumers;

    /// @notice Ensures a consumer is only added once to `allConsumers`
    mapping(address => bool) public isKnownConsumer;

    /// @notice Chainlink AVAX/USD price feed (8 decimals)
    AggregatorV3Interface public priceFeed;

    /// @notice External MCP provider reference
    IMcpProvider public mcpProvider;

    /// @notice Grace period before subscription is eligible for upkeep (default 30 days)
    uint256 public GRACE_PERIOD = 30 days;

    /// @notice Initializes the MCP consumer
    /// @param _provider The address of the MCP provider contract
    /// @param _priceFeed The address of the Chainlink AVAX/USD feed
    constructor(address _priceFeed, address _provider) {
        priceFeed = AggregatorV3Interface(_priceFeed);
        mcpProvider = IMcpProvider(_provider);
    }

    /// @notice Subscribes to a given MCP license
    /// @param _providerNonce The nonce of the license to subscribe to
    /// @dev Subscriptions are priced in USD, paid in AVAX using current feed rate

    // TODO: require (_providerNonce) to exist!

    function subscribeToMcp(uint256 _providerNonce) external payable {
        if (!isKnownConsumer[msg.sender]) {
            isKnownConsumer[msg.sender] = true;
            allConsumers.push(msg.sender);
        }

        // ✅ Require provider to exist
        if (!mcpProvider.exists(_providerNonce)) {
            revert('Invalid provider');
        }

        (, address providerAddress, , uint256 priceUsd, , string memory url) = mcpProvider
            .getServiceDetails(_providerNonce);

        uint256 requiredAvax = (priceUsd * 10 ** 8) / getLatestAvaxUsdPrice();
        require(msg.value >= requiredAvax, 'Insufficient AVAX');

        Subscription memory newSub = Subscription({
            providerNonce: _providerNonce,
            providerAddress: providerAddress,
            amountPaid: msg.value,
            startTimestamp: block.timestamp,
            status: SubStatus.Active,
            url: url
        });

        userSubscriptions[msg.sender].push(newSub);

        emit Subscribed(
            msg.sender,
            userSubscriptions[msg.sender].length - 1,
            _providerNonce,
            msg.value
        );
    }

    function penalizeProvider(uint256 _providerNonce) external onlyOwner {
        for (uint256 u = 0; u < allConsumers.length; u++) {
            address consumer = allConsumers[u];
            Subscription[] storage subs = userSubscriptions[consumer];

            for (uint256 i = 0; i < subs.length; i++) {
                Subscription storage sub = subs[i];

                if (sub.providerNonce == _providerNonce && sub.status == SubStatus.Active) {
                    sub.status = SubStatus.Completed;
                    payable(consumer).transfer(sub.amountPaid);

                    emit SubscriptionResolved(consumer, i, SubStatus.Completed);
                }
            }
        }
    }

    /// @notice Withdraw AVAX from the contract,
    /// @dev For testing purposes and funds rescue only, will be removed in future
    function withdrawAvax(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, 'Nothing to withdraw');
        to.transfer(balance);
    }

    /// @notice Chainlink Automation check to determine if upkeep is needed
    /// @param checkData Ignored for now
    /// @return upkeepNeeded True if any sub has expired, performData with user/index
    function checkUpkeep(
        bytes calldata checkData
    ) external view returns (bool upkeepNeeded, bytes memory performData) {
        for (uint256 u = 0; u < allConsumers.length; u++) {
            address user = allConsumers[u];
            Subscription[] storage subs = userSubscriptions[user];

            for (uint256 i = 0; i < subs.length; i++) {
                if (
                    subs[i].status == SubStatus.Active &&
                    block.timestamp > subs[i].startTimestamp + GRACE_PERIOD
                ) {
                    return (true, abi.encode(user, i));
                }
            }
        }

        return (false, '');
    }

    /// @notice Chainlink Automation perform function that resolves expired subscriptions
    /// @param performData ABI-encoded (address user, uint256 index)
    function performUpkeep(bytes calldata performData) external override {
        (address user, uint256 index) = abi.decode(performData, (address, uint256));
        Subscription storage sub = userSubscriptions[user][index];

        require(sub.status == SubStatus.Active, 'Already settled');
        require(block.timestamp > sub.startTimestamp + GRACE_PERIOD, 'Not expired yet');

        sub.status = SubStatus.Completed;
        emit SubscriptionResolved(user, index, SubStatus.Completed);
    }

    function getConsumerMcps(address _consumer) public view returns (Subscription[] memory) {
        Subscription[] storage allSubs = userSubscriptions[_consumer];

        // First pass: count how many are still active and within GRACE_PERIOD
        uint256 activeCount = 0;
        for (uint256 i = 0; i < allSubs.length; i++) {
            if (
                allSubs[i].status == SubStatus.Active &&
                block.timestamp <= allSubs[i].startTimestamp + GRACE_PERIOD
            ) {
                activeCount++;
            }
        }

        // Second pass: copy those to a new memory array
        Subscription[] memory result = new Subscription[](activeCount);
        uint256 j = 0;
        for (uint256 i = 0; i < allSubs.length; i++) {
            if (
                allSubs[i].status == SubStatus.Active &&
                block.timestamp <= allSubs[i].startTimestamp + GRACE_PERIOD
            ) {
                result[j] = allSubs[i];
                j++;
            }
        }

        return result;
    }

    /// @notice Returns the current AVAX/USD price (8 decimals)
    /// @return The latest AVAX price as uint256
    function getLatestAvaxUsdPrice() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, 'Invalid price');
        return uint256(price);
    }
}
