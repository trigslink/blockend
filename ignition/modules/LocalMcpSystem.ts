import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const AVAX_USD_FUJI_FEED = '0x5498BB86BC934c8D34FDA08E81D444153d0D06aD'

const McpSystemModule = buildModule('McpSystemModule', (m) => {
    const mockV3Aggregator = m.contract('MockV3Aggregator', [8, 1841000000])
    const mcpProvider = m.contract('McpProvider', [mockV3Aggregator])
    const mcpConsumer = m.contract('McpConsumer', [mockV3Aggregator, mcpProvider])

    return { mockV3Aggregator, mcpProvider, mcpConsumer }
})

export default McpSystemModule
