import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const AVAX_USD_FUJI_FEED = '0x5498BB86BC934c8D34FDA08E81D444153d0D06aD'

const DeployMcpSystem = buildModule('McpSystemModule', (m) => {
    const mcpProvider = m.contract('McpProvider', [AVAX_USD_FUJI_FEED])
    const mcpConsumer = m.contract('McpConsumer', [AVAX_USD_FUJI_FEED, mcpProvider])

    return { mcpProvider, mcpConsumer }
})

export default DeployMcpSystem
