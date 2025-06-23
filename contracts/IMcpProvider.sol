//SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMcpProvider {
    function getServiceDetails(
        uint256 nonce
    )
        external
        view
        returns (
            uint256 providerNonce, // Unique global license ID
            address providerAddress, // Who minted the MCP
            string memory serviceName,
            uint256 usdPriceForConsumerMonth, // e.g. $50/month (in USD, 18 decimals)
            string memory serviceDescription,
            string memory url
        );

    function exists(uint256 _nonce) external view returns (bool);
}
